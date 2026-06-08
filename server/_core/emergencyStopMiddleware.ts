import type { Request, Response, NextFunction } from "express";
import { readFlag } from "../services/emergencyStopService";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Emergency stop middleware.
 *
 * When the flag is active:  always returns 503 (fail-closed for all requests).
 * When readFlag() throws:
 *   - Production + mutation (POST/PUT/PATCH/DELETE): returns 503 (fail-closed).
 *   - Otherwise: passes through (fail-open) so health checks and reads still work.
 *
 * This ensures that if the DB is unreachable in production, customer mutations
 * cannot proceed (preventing ghost orders, double-charges, etc.) while GET
 * endpoints (health, catalog reads) remain available for monitoring and recovery.
 */
export function createEmergencyStopMiddleware({
  adminBypass: _adminBypass,
}: {
  adminBypass: boolean;
}) {
  const isProduction = process.env.NODE_ENV === "production";

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const flag = await readFlag();
      if (flag.active) {
        res.status(503).json({
          error: "Service temporarily unavailable",
          reason: flag.reason ?? "Emergency stop is active",
        });
        return;
      }
    } catch {
      // readFlag() threw (e.g. DB error after getDb() returned a connection that failed mid-query).
      // Fail-closed for mutations in production; fail-open for reads and non-production.
      if (isProduction && MUTATION_METHODS.has(req.method)) {
        res.status(503).json({
          error: "Service temporarily unavailable",
          reason:
            "Emergency stop state could not be verified; mutations are blocked until connectivity is restored.",
        });
        return;
      }
      // Non-mutation or non-production: fail open so health checks and reads still work.
    }
    next();
  };
}
