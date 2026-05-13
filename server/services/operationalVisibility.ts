import { sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  providerDeadLetters,
  providerWebhookEvents,
  workerJobs,
} from "../../drizzle/schema";

export const OBSERVABILITY_METRIC_NAMES = [
  "api_latency_seconds",
  "queue_backlog",
  "worker_processed_total",
  "worker_job_backlog",
  "worker_job_dead_letter_total",
  "provider_webhook_events_total",
  "provider_webhook_failed_total",
  "provider_retry_scheduled_total",
  "provider_dead_letter_total",
] as const;

export type ObservabilityMetricName =
  (typeof OBSERVABILITY_METRIC_NAMES)[number];

export type ProviderVisibilitySummary = {
  source: "provider_event_tables";
  databaseConfigured: boolean;
  providerEvents: {
    total: number;
    failed: number;
    retryScheduled: number;
    deadLetterStatus: number;
  };
  providerDeadLetters: {
    total: number;
    pendingReview: number;
  };
  workerJobs: {
    backlog: number;
    deadLetter: number;
  };
};

const zeroSummary = (
  databaseConfigured: boolean
): ProviderVisibilitySummary => ({
  source: "provider_event_tables",
  databaseConfigured,
  providerEvents: {
    total: 0,
    failed: 0,
    retryScheduled: 0,
    deadLetterStatus: 0,
  },
  providerDeadLetters: {
    total: 0,
    pendingReview: 0,
  },
  workerJobs: {
    backlog: 0,
    deadLetter: 0,
  },
});

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

export async function getProviderVisibilitySummary(): Promise<ProviderVisibilitySummary> {
  const db = await getDb();
  if (!db) return zeroSummary(false);

  const [providerCounts] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      failed: sql<number>`SUM(CASE WHEN ${providerWebhookEvents.processingStatus} = 'failed' THEN 1 ELSE 0 END)`,
      retryScheduled: sql<number>`SUM(CASE WHEN ${providerWebhookEvents.processingStatus} = 'retry_scheduled' THEN 1 ELSE 0 END)`,
      deadLetterStatus: sql<number>`SUM(CASE WHEN ${providerWebhookEvents.processingStatus} = 'dead_letter' THEN 1 ELSE 0 END)`,
    })
    .from(providerWebhookEvents);

  const [deadLetterCounts] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pendingReview: sql<number>`SUM(CASE WHEN ${providerDeadLetters.reviewStatus} = 'pending_review' THEN 1 ELSE 0 END)`,
    })
    .from(providerDeadLetters);

  const [workerCounts] = await db
    .select({
      backlog: sql<number>`SUM(CASE WHEN ${workerJobs.status} IN ('queued', 'retry_scheduled') THEN 1 ELSE 0 END)`,
      deadLetter: sql<number>`SUM(CASE WHEN ${workerJobs.status} = 'dead_letter' THEN 1 ELSE 0 END)`,
    })
    .from(workerJobs);

  return {
    source: "provider_event_tables",
    databaseConfigured: true,
    providerEvents: {
      total: asNumber(providerCounts?.total),
      failed: asNumber(providerCounts?.failed),
      retryScheduled: asNumber(providerCounts?.retryScheduled),
      deadLetterStatus: asNumber(providerCounts?.deadLetterStatus),
    },
    providerDeadLetters: {
      total: asNumber(deadLetterCounts?.total),
      pendingReview: asNumber(deadLetterCounts?.pendingReview),
    },
    workerJobs: {
      backlog: asNumber(workerCounts?.backlog),
      deadLetter: asNumber(workerCounts?.deadLetter),
    },
  };
}
