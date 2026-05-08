import type { NextFunction, Request, Response } from "express";
import { createStructuredLog, getOrCreateRequestId, REQUEST_ID_HEADER } from "../services/observability";

type ActorLike = { id?: string | number; userId?: string | number; role?: string; storeId?: string | number };

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

function getActor(req: Request): ActorLike {
  const anyReq = req as Request & { user?: ActorLike; ctx?: { user?: ActorLike }; session?: ActorLike };
  return anyReq.user ?? anyReq.ctx?.user ?? anyReq.session ?? {};
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header(REQUEST_ID_HEADER) ?? undefined;
  const requestId = getOrCreateRequestId(incoming);
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  const started = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const actor = getActor(req);
    const errorCode = typeof res.locals?.errorCode === "string" ? res.locals.errorCode : undefined;
    const log = createStructuredLog({
      requestId,
      method: req.method,
      route: req.route?.path ? String(req.route.path) : undefined,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
      actorId: actor.id ?? actor.userId,
      actorRole: actor.role,
      storeId: actor.storeId,
      errorCode,
    });
    console.info(log);
  });

  next();
}
