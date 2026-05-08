import { Router, type Request, type Response, type NextFunction } from "express";
import { getLivenessHealth, getReadinessHealth } from "../services/healthcheck";
import { redactForLog } from "../services/observability";

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function requireAdminHealthAccess(req: Request, res: Response, next: NextFunction) {
  const expected = (process.env.ADMIN_HEALTH_TOKEN || process.env.HEALTHCHECK_ADMIN_TOKEN || "").trim();
  const provided = (req.header("x-admin-health-token") || req.header("x-healthcheck-token") || req.header("authorization")?.replace(/^Bearer\s+/i, "") || "").trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!expected) {
    if (isProduction) {
      res.status(503).json({ status: "unhealthy", error: "admin_health_token_not_configured" });
      return;
    }
    next();
    return;
  }

  if (!safeEqual(provided, expected)) {
    res.status(401).json({ status: "unhealthy", error: "unauthorized" });
    return;
  }

  next();
}

export function createHealthRouter(): Router {
  const router = Router();

  router.get(["/healthz", "/api/healthz"], (_req, res) => {
    res.json(getLivenessHealth());
  });

  router.get(["/readyz", "/api/readyz", "/api/health"], async (_req, res) => {
    const readiness = await getReadinessHealth();
    res.status(readiness.status === "unhealthy" ? 503 : 200).json(redactForLog(readiness));
  });

  router.get(["/admin/health", "/api/admin/health"], requireAdminHealthAccess, async (_req, res) => {
    const readiness = await getReadinessHealth();
    res.status(readiness.status === "unhealthy" ? 503 : 200).json(redactForLog({ ...readiness, admin: { detailLevel: "component_summary", secretsExposed: false } }));
  });

  return router;
}
