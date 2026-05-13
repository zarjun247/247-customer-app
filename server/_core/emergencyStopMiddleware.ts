import type { Request, Response, NextFunction } from "express";
import { readFlag } from "../services/emergencyStopService";

export function createEmergencyStopMiddleware({
  adminBypass: _adminBypass,
}: {
  adminBypass: boolean;
}) {
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
      // Fail open: if we can't read the flag, let the request through
    }
    next();
  };
}
