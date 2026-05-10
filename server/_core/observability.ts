import pino from "pino";
import { collectDefaultMetrics, Registry, Gauge, Counter, Histogram } from "prom-client";
import { nanoid } from "nanoid";
import { Server } from "http";
import type { Express, Request, Response, NextFunction } from "express";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const register = new Registry();
collectDefaultMetrics({ register });

const queueBacklog = new Gauge({ name: "queue_backlog", help: "OCR queue backlog", registers: [register] });
const workerProcessed = new Counter({ name: "worker_processed_total", help: "Processed worker jobs", registers: [register] });
const deadLetterCount = new Counter({ name: "dead_letter_total", help: "Dead letter count", registers: [register] });
const providerLatency = new Histogram({ name: "provider_latency_seconds", help: "Provider latency seconds", buckets: [0.005,0.01,0.05,0.1,0.5,1,2,5], registers: [register] });
const apiLatency = new Histogram({ name: "api_latency_seconds", help: "API latency seconds", buckets: [0.001,0.005,0.01,0.05,0.1,0.5,1], registers: [register] });

export function initObservability(app: Express, server: Server) {
  // Request correlation/trace middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const traceId = (req.headers["x-trace-id"] as string) || nanoid();
    const correlationId = (req.headers["x-correlation-id"] as string) || nanoid();
    (req as any).traceId = traceId;
    (req as any).correlationId = correlationId;
    res.setHeader("x-trace-id", traceId);
    res.setHeader("x-correlation-id", correlationId);
    (req as any).log = logger.child({ traceId, correlationId, route: req.path });

    const start = Date.now();
    res.on("finish", () => {
      const latency = (Date.now() - start) / 1000; // seconds
      apiLatency.observe(latency);
      (req as any).log.info({ method: req.method, status: res.statusCode, latency }, "http_request");
    });

    next();
  });

  // Prometheus scrape endpoint
  app.get("/metrics", async (_req, res) => {
    res.setHeader("Content-Type", register.contentType);
    res.end(await register.metrics());
  });

  logger.info("Observability initialized");
}

export const metrics = {
  setQueueBacklog: (n: number) => queueBacklog.set(n),
  incrementWorkerProcessed: () => workerProcessed.inc(),
  incrementDeadLetter: () => deadLetterCount.inc(),
  recordProviderLatency: (s: number) => providerLatency.observe(s),
  startApiTimer: () => apiLatency.startTimer(),
};

export { logger, register };