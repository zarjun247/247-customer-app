import type { NextFunction, Request, Response } from "express";
import { buildRequestLog, getOrCreateRequestId, writeStructuredLog } from "../services/observability";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startMs = Date.now();
  const requestId = getOrCreateRequestId(req);
  (req as any).requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    writeStructuredLog(buildRequestLog(req, res, startMs));
  });

  next();
}
