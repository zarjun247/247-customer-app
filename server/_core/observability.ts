import pino from "pino";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";
import type { Express, NextFunction, Request, Response } from "express";
import { trace } from "@opentelemetry/api";
import { requireStaff } from "../routers/healthRouter";
import { metricsTokenAuth } from "../middleware/metricsAuth";
import {
  createRequestId,
  redactString,
  safeError,
  safeMetadata,
} from "../services/observability";
import { getProviderVisibilitySummary } from "../services/operationalVisibility";

/** Returns the active OTel trace/span IDs, or null when no span is active. */
export function getCurrentTraceContext(): {
  traceId: string;
  spanId: string;
} | null {
  const span = trace.getActiveSpan();
  if (!span) return null;
  const ctx = span.spanContext();
  if (!ctx.traceId || ctx.traceId === "00000000000000000000000000000000")
    return null;
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  mixin() {
    const traceCtx = getCurrentTraceContext();
    return traceCtx ?? {};
  },
});

const register = new Registry();
collectDefaultMetrics({ register });

const queueBacklog = new Gauge({
  name: "queue_backlog",
  help: "OCR queue backlog derived from worker runtime",
  registers: [register],
});
const workerProcessed = new Counter({
  name: "worker_processed_total",
  help: "Processed worker jobs",
  registers: [register],
});
const workerJobBacklog = new Gauge({
  name: "worker_job_backlog",
  help: "Queued/retry worker jobs from worker_jobs",
  registers: [register],
});
const workerJobDeadLetter = new Gauge({
  name: "worker_job_dead_letter_total",
  help: "Dead-letter worker jobs from worker_jobs",
  registers: [register],
});
const providerWebhookEventsTotal = new Gauge({
  name: "provider_webhook_events_total",
  help: "Provider webhook events from provider_webhook_events",
  registers: [register],
});
const providerWebhookFailedTotal = new Gauge({
  name: "provider_webhook_failed_total",
  help: "Failed provider webhook events from provider_webhook_events",
  registers: [register],
});
const providerRetryScheduledTotal = new Gauge({
  name: "provider_retry_scheduled_total",
  help: "Provider webhook events scheduled for retry from provider_webhook_events",
  registers: [register],
});
const providerDeadLetterTotal = new Gauge({
  name: "provider_dead_letter_total",
  help: "Provider dead letters from provider_dead_letters",
  registers: [register],
});
const providerLatency = new Histogram({
  name: "provider_latency_seconds",
  help: "Provider latency seconds recorded by runtime provider integrations",
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});
const apiLatency = new Histogram({
  name: "api_latency_seconds",
  help: "API latency seconds",
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export function buildHttpRequestLog(
  req: Request,
  res: Response,
  latency: number
) {
  return safeMetadata({
    event: "http_request",
    method: req.method,
    route: redactString(req.path),
    status: res.statusCode,
    latency,
    traceId: (req as any).traceId,
    correlationId: (req as any).correlationId,
  });
}

export async function refreshOperationalMetrics() {
  const summary = await getProviderVisibilitySummary();
  providerWebhookEventsTotal.set(summary.providerEvents.total);
  providerWebhookFailedTotal.set(summary.providerEvents.failed);
  providerRetryScheduledTotal.set(summary.providerEvents.retryScheduled);
  providerDeadLetterTotal.set(summary.providerDeadLetters.total);
  workerJobBacklog.set(summary.workerJobs.backlog);
  workerJobDeadLetter.set(summary.workerJobs.deadLetter);
  return summary;
}

export function initObservability(app: Express) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const traceId = createRequestId(req.headers["x-trace-id"]);
    const correlationId = createRequestId(req.headers["x-correlation-id"]);
    (req as any).traceId = traceId;
    (req as any).correlationId = correlationId;
    res.setHeader("x-trace-id", traceId);
    res.setHeader("x-correlation-id", correlationId);
    (req as any).log = logger.child({ traceId, correlationId });

    const start = Date.now();
    res.on("finish", () => {
      const latency = (Date.now() - start) / 1000;
      apiLatency.observe(latency);
      (req as any).log.info(
        buildHttpRequestLog(req, res, latency),
        "http_request"
      );
    });

    next();
  });

  app.get("/metrics", metricsTokenAuth(), requireStaff, (_req, res) => {
    void (async () => {
      try {
        await refreshOperationalMetrics();
        res.setHeader("Content-Type", register.contentType);
        res.end(await register.metrics());
      } catch (error) {
        res
          .status(503)
          .json({ status: "unavailable", error: safeError(error) });
      }
    })();
  });

  logger.info(
    { event: "observability_initialized" },
    "observability_initialized"
  );
}

export const metrics = {
  setQueueBacklog: (n: number) => queueBacklog.set(n),
  incrementWorkerProcessed: () => workerProcessed.inc(),
  recordProviderLatency: (s: number) => providerLatency.observe(s),
  startApiTimer: () => apiLatency.startTimer(),
};

export { logger, register };
