import type { Express } from "express";
import fs from "fs/promises";
import path from "path";
import { requireStaff } from "./healthRouter";
import { safeError } from "../services/observability";
import {
  OBSERVABILITY_METRIC_NAMES,
  getProviderVisibilitySummary,
} from "../services/operationalVisibility";

export async function loadDashboardDefinitions() {
  const dashDir = path.join(process.cwd(), "docs", "dashboards");
  const files = await fs.readdir(dashDir);
  return Promise.all(
    files
      .filter(f => f.endsWith(".json"))
      .sort()
      .map(async f => {
        const raw = await fs.readFile(path.join(dashDir, f), "utf-8");
        return JSON.parse(raw);
      })
  );
}

export function registerObservabilityRoutes(app: Express) {
  app.get("/api/observability/dashboards", requireStaff, (_req, res) => {
    void (async () => {
      try {
        const dashboards = await loadDashboardDefinitions();
        res.json({ dashboards, supportedMetrics: OBSERVABILITY_METRIC_NAMES });
      } catch (_err) {
        res.status(500).json({ error: "Failed to read dashboards" });
      }
    })();
  });

  app.get("/api/observability/health-summary", requireStaff, (_req, res) => {
    void (async () => {
      try {
        const providerVisibility = await getProviderVisibilitySummary();
        res.json({
          ok: providerVisibility.databaseConfigured,
          source: providerVisibility.source,
          providerVisibility,
        });
      } catch (error) {
        res
          .status(503)
          .json({ status: "unavailable", error: safeError(error) });
      }
    })();
  });

  app.get("/api/observability/provider-events", requireStaff, (_req, res) => {
    void (async () => {
      try {
        res.json(await getProviderVisibilitySummary());
      } catch (error) {
        res
          .status(503)
          .json({ status: "unavailable", error: safeError(error) });
      }
    })();
  });
}
