import type { Express, Request, Response } from "express";
import { getHealthReport, toPublicLiveness, toPublicReadiness } from "../services/healthcheck";
import { redactForObservability } from "../services/observability";

function hasDetailedHealthAccess(req: Request): boolean {
  const configuredToken = (process.env.HEALTHCHECK_INTERNAL_TOKEN ?? "").trim();
  const suppliedToken = (req.header("x-healthcheck-token") ?? req.header("x-internal-health-token") ?? req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
  if (configuredToken) return suppliedToken === configuredToken;
  return process.env.NODE_ENV !== "production";
}

async function livenessHandler(_req: Request, res: Response) {
  const report = await getHealthReport();
  res.status(report.app.status === "healthy" ? 200 : 503).json(toPublicLiveness(report));
}

async function readinessHandler(_req: Request, res: Response) {
  const report = await getHealthReport();
  res.status(report.status === "unhealthy" ? 503 : 200).json(toPublicReadiness(report));
}

function requireAdmin(req: Request, res: Response, next: () => void) {
  if (!hasDetailedHealthAccess(req)) {
    res.status(403).json({ status: "forbidden", message: "Detailed health is protected" });
    return;
  }
  next();
}

async function detailedHandler(_req: Request, res: Response) {
  const report = await getHealthReport();
  res.status(report.status === "unhealthy" ? 503 : 200).json(redactForObservability(report));
}

export function registerHealthRoutes(app: Express) {
  app.get("/healthz", livenessHandler);
  app.get("/api/healthz", livenessHandler);
  app.get("/readyz", readinessHandler);
  app.get("/api/readyz", readinessHandler);
  app.get("/api/health", requireAdmin, detailedHandler);
  app.get("/api/admin/health", requireAdmin, detailedHandler);
}

export const __healthRouterTest = { hasDetailedHealthAccess, requireAdmin, livenessHandler, readinessHandler, detailedHandler };
