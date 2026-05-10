import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { createRequestId, safeError, serializeSafeLog } from "../services/observability";

type RequestWithContext = Request & {
  requestId?: string;
  user?: { id?: unknown; role?: unknown; staffStoreId?: unknown; assignedStoreId?: unknown } | null;
};

type Logger = Pick<Console, "info" | "warn" | "error">;

function safeId(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value).slice(0, 80);
  return undefined;
}

function actorFromRequest(req: RequestWithContext) {
  return {
    userId: safeId(req.user?.id),
    role: typeof req.user?.role === "string" ? req.user.role : undefined,
    storeId: safeId(req.user?.staffStoreId ?? req.user?.assignedStoreId),
  };
}

export function requestIdMiddleware(): RequestHandler {
  return (req: RequestWithContext, res, next) => {
    const requestId = createRequestId(req.header("x-request-id"));
    req.requestId = requestId;
    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    next();
  };
}

export function buildRequestLogEntry(req: RequestWithContext, res: Response, startedAt: bigint, err?: unknown) {
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  return {
    event: err ? "http_request_error" : "http_request",
    requestId: req.requestId ?? res.locals.requestId,
    method: req.method,
    path: req.path,
    status: res.statusCode,
    durationMs: Math.round(durationMs),
    actor: actorFromRequest(req),
    error: err ? safeError(err) : undefined,
  };
}

import { recordMetric, recordEvent } from "../services/telemetry";

export function requestLoggerMiddleware(logger: Logger = console): RequestHandler {
  return (req: RequestWithContext, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const entry = buildRequestLogEntry(req, res, startedAt);
      const serialized = serializeSafeLog(entry);
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      // Emit structured log
      if (res.statusCode >= 500) logger.error(serialized);
      else if (res.statusCode >= 400) logger.warn(serialized);
      else logger.info(serialized);
      // Emit metrics (best-effort)
      try {
        recordMetric('http.request.duration_ms', Math.round(durationMs), { method: req.method, path: req.path, status: res.statusCode });
      } catch (err) {
        // ignore
      }
      // Emit events for server errors
      if (res.statusCode >= 500) {
        try {
          recordEvent('http.request.error', { requestId: req.requestId ?? res.locals.requestId, method: req.method, path: req.path, status: res.statusCode }, 'critical');
        } catch (err) {}
      }
    });
    next();
  };
}

export function requestErrorLoggerMiddleware(logger: Pick<Console, "error"> = console): ErrorRequestHandler {
  return (err, req: RequestWithContext, res, next) => {
    const entry = buildRequestLogEntry(req, res, process.hrtime.bigint(), err);
    logger.error(serializeSafeLog(entry));
    next(err);
  };
}
