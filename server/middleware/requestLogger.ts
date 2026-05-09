import type { Request, Response, NextFunction } from "express";
import { buildStructuredLog, createRequestId } from "../services/observability";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  const requestId = createRequestId(req.header("x-request-id"));
  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const status = res.statusCode;
    const entry = buildStructuredLog({
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      event: "http.request",
      requestId,
      method: req.method,
      path: req.path,
      status,
      durationMs: Date.now() - startedAt,
      actorId: (req as { user?: { id?: string | number } }).user?.id,
      storeId: (req as { user?: { storeId?: string | number } }).user?.storeId,
    } as Parameters<typeof buildStructuredLog>[0]);
    const line = JSON.stringify(entry);
    if (status >= 500) console.error(line);
    else if (status >= 400) console.warn(line);
    else console.info(line);
  });

  next();
}
