import type { Request, Response, NextFunction, RequestHandler } from "express";
import pino from "pino";
import {
  doubleCsrfProtection,
  invalidCsrfTokenError,
} from "../services/csrfService";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// Paths exempt from CSRF validation: provider webhook routes use their own
// signature verification (Razorpay HMAC, WhatsApp webhook token).
const CSRF_EXEMPT_PREFIXES = [
  "/api/webhooks/",
  "/api/worker/",
  "/health",
  "/metrics",
];

function isCsrfExempt(path: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some(prefix => path.startsWith(prefix));
}

export const csrfMiddleware: RequestHandler = (req, res, next) => {
  if (isCsrfExempt(req.path)) return next();
  return doubleCsrfProtection(req, res, next);
};

// Express error middleware must have exactly 4 parameters (err, req, res, next).
export function handleCsrfError(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err === invalidCsrfTokenError) {
    logger.warn(
      { path: req.path, method: req.method },
      "csrf: invalid token rejected"
    );
    res.status(403).json({ error: "CSRF token invalid or missing" });
    return;
  }
  next(err);
}
