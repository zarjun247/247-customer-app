import type { Express, Request, Response } from "express";
import { createHealthReport, createLivenessReport, readinessSummary } from "../services/healthcheck";
import { ENV } from "../_core/env";

function readinessHttpStatus(status: string): number {
  return status === "unhealthy" ? 503 : 200;
}

function isAdminHealthAuthorized(req: Request): boolean {
  const configuredToken = (process.env.ADMIN_HEALTH_TOKEN || ENV.workerAdminToken || "").trim();
  if (!configuredToken) return !ENV.isProduction;
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const explicit = req.header("x-admin-health-token") ?? "";
  return bearer === configuredToken || explicit === configuredToken;
}

export function registerHealthRoutes(app: Express): void {
  const liveness = (_req: Request, res: Response) => {
    res.json(createLivenessReport());
  };

  app.get("/healthz", liveness);
  app.get("/api/healthz", liveness);

  app.get("/readyz", async (_req, res) => {
    const report = readinessSummary(await createHealthReport("readiness"));
    res.status(readinessHttpStatus(report.status)).json(report);
  });

  app.get("/api/readyz", async (_req, res) => {
    const report = readinessSummary(await createHealthReport("readiness"));
    res.status(readinessHttpStatus(report.status)).json(report);
  });

  app.get("/api/health", async (_req, res) => {
    const report = readinessSummary(await createHealthReport("readiness"));
    res.status(readinessHttpStatus(report.status)).json(report);
  });

  app.get("/admin/health", async (req, res) => {
    if (!isAdminHealthAuthorized(req)) {
      res.status(401).json({ status: "unhealthy", error: "Unauthorized" });
      return;
    }
    const report = await createHealthReport("admin");
    res.status(readinessHttpStatus(report.status)).json(report);
  });

  app.get("/api/admin/health", async (req, res) => {
    if (!isAdminHealthAuthorized(req)) {
      res.status(401).json({ status: "unhealthy", error: "Unauthorized" });
      return;
    }
    const report = await createHealthReport("admin");
    res.status(readinessHttpStatus(report.status)).json(report);
  });
}
