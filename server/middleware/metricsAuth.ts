import type { NextFunction, Request, Response } from "express";

/**
 * Alternative /metrics auth path for Prometheus scrapers.
 * Reads METRICS_SCRAPE_TOKEN at request time. When the Bearer token matches,
 * marks req.metricsTokenAuthenticated and calls next(). When absent or
 * mismatched, calls next() and delegates to the subsequent requireStaff
 * middleware. Never sends a response — always calls next().
 */
export function metricsTokenAuth() {
  return function metricsTokenAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const envToken = process.env.METRICS_SCRAPE_TOKEN;

    if (envToken) {
      const authHeader = req.headers["authorization"];
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const providedToken = authHeader.slice("Bearer ".length);
        if (providedToken === envToken) {
          (req as any).metricsTokenAuthenticated = true;
        }
      }
    }

    next();
  };
}
