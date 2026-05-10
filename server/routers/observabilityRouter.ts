import { Express } from "express";
import fs from "fs/promises";
import path from "path";
import { metrics } from "../_core/observability";

export function registerObservabilityRoutes(app: Express) {
  app.get("/api/observability/dashboards", async (_req, res) => {
    try {
      const dashDir = path.join(process.cwd(), "docs", "dashboards");
      const files = await fs.readdir(dashDir);
      const dashboards = await Promise.all(
        files.filter(f => f.endsWith('.json')).map(async (f) => {
          const raw = await fs.readFile(path.join(dashDir, f), 'utf-8');
          return JSON.parse(raw);
        })
      );
      res.json({ dashboards });
    } catch (err) {
      res.status(500).json({ error: 'Failed to read dashboards' });
    }
  });

  app.get('/api/observability/health-summary', async (_req, res) => {
    // Lightweight health summary based on metrics exposed in-memory
    // In future this should aggregate provider heartbeats and lastSuccess timestamps
    res.json({ ok: true, note: 'Health summary (placeholder)'});
  });
}
