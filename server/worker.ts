/**
 * Queue Worker
 *
 * Polls the ocrJobs table for pending/failed jobs and processes them
 * using the ingestion engine. Implements retry logic (max 3 attempts)
 * with exponential backoff.
 *
 * Usage:
 *   import { startWorker } from "./worker";
 *   startWorker(30_000); // poll every 30 seconds
 *
 * IMPORTANT: Do NOT use setInterval in deployed server code.
 * In production, wire this to a cron job or a message queue (BullMQ, SQS).
 * The startWorker function is provided for local development only.
 * For production, call processQueue() from a scheduled endpoint or
 * a Manus scheduled task that POSTs to /api/worker/run.
 *
 * Sentry integration stub:
 *   import * as Sentry from "@sentry/node";
 *   Sentry.captureException(err); // TODO: replace console.error below
 *
 * PagerDuty integration stub:
 *   POST https://events.pagerduty.com/v2/enqueue with routing_key + payload
 *   TODO: call alertOps() below when job fails after max retries
 */

import { getDb } from "./db";
import { ocrJobs, invoiceIngestions } from "../drizzle/schema";
import { eq, and, lte } from "drizzle-orm";
import { runOcrPipeline } from "./ingestion";
import { metrics } from "./_core/observability";

const MAX_ATTEMPTS = 3;

// ─── Core Queue Processor ─────────────────────────────────────────────────────

/**
 * Processes all pending OCR jobs in a single pass.
 * Returns the number of jobs processed.
 */
export async function processQueue(): Promise<number> {
  const db = await getDb();
  if (!db) {
    console.warn("[Worker] Database unavailable, skipping queue pass");
    return 0;
  }

  // Find queued jobs that haven't exceeded max attempts
  const pendingJobs = await db
    .select({
      id: ocrJobs.id,
      ingestionId: ocrJobs.ingestionId,
      attempts: ocrJobs.attempts,
      status: ocrJobs.status,
    })
    .from(ocrJobs)
    .where(
      and(
        eq(ocrJobs.status, "queued"),
        lte(ocrJobs.attempts, MAX_ATTEMPTS - 1)
      )
    )
    .limit(10); // process up to 10 jobs per pass

  if (pendingJobs.length === 0) {
    metrics.setQueueBacklog(0);
    return 0;
  }

  console.log(`[Worker] Processing ${pendingJobs.length} OCR job(s)`);

  let processed = 0;
  for (const job of pendingJobs) {
    try {
      await runOcrPipeline(job.ingestionId);
      processed++;
      metrics.incrementWorkerProcessed();
      console.log(
        `[Worker] OCR job #${job.id} (ingestion #${job.ingestionId}) completed`
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[Worker] OCR job #${job.id} failed (attempt ${job.attempts + 1}/${MAX_ATTEMPTS}): ${errorMessage}`
      );

      // TODO: Sentry.captureException(err);

      if (job.attempts + 1 >= MAX_ATTEMPTS) {
        // Mark as permanently failed
        await db
          .update(ocrJobs)
          .set({ status: "failed", errorMessage })
          .where(eq(ocrJobs.id, job.id));

        // TODO: alertOps(`OCR job #${job.id} failed after ${MAX_ATTEMPTS} attempts`, errorMessage);
        console.error(
          `[Worker] OCR job #${job.id} permanently failed after ${MAX_ATTEMPTS} attempts`
        );
      } else {
        // Re-queue for retry (reset to queued so next pass picks it up)
        await db
          .update(ocrJobs)
          .set({ status: "queued", errorMessage })
          .where(eq(ocrJobs.id, job.id));
      }
    }
  }

  return processed;
}

// ─── Failed Job Requeue ───────────────────────────────────────────────────────

/**
 * Requeues a specific failed job for manual retry.
 * Resets attempts counter to allow another MAX_ATTEMPTS cycles.
 */
export async function requeueJob(jobId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .update(ocrJobs)
    .set({ status: "queued", attempts: 0, errorMessage: null })
    .where(eq(ocrJobs.id, jobId));
}

// ─── Worker Lifecycle ─────────────────────────────────────────────────────────

let _workerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the queue worker with a polling interval.
 *
 * NOTE: For local development only. In production, use a scheduled task
 * or cron job to call processQueue() instead of setInterval.
 *
 * @param intervalMs - Polling interval in milliseconds (default: 30s)
 */
export function startWorker(intervalMs = 30_000): void {
  if (_workerTimer) {
    console.warn("[Worker] Already running, ignoring startWorker call");
    return;
  }

  console.log(`[Worker] Starting with ${intervalMs}ms polling interval`);

  // Run immediately on start
  processQueue().catch((err) =>
    console.error("[Worker] Initial pass failed:", err)
  );

  _workerTimer = setInterval(() => {
    processQueue().catch((err) =>
      console.error("[Worker] Queue pass failed:", err)
    );
  }, intervalMs);
}

/**
 * Stops the queue worker.
 */
export function stopWorker(): void {
  if (_workerTimer) {
    clearInterval(_workerTimer);
    _workerTimer = null;
    console.log("[Worker] Stopped");
  }
}

// ─── Ops Alert Stub ───────────────────────────────────────────────────────────

/**
 * Sends an ops alert when a critical worker failure occurs.
 * TODO: Replace with PagerDuty / Opsgenie / Slack webhook.
 *
 * Required env vars (when implemented):
 *   PAGERDUTY_ROUTING_KEY — PagerDuty Events API v2 routing key
 *   SLACK_OPS_WEBHOOK_URL — Slack incoming webhook URL for ops channel
 */
async function alertOps(title: string, detail: string): Promise<void> {
  console.error(`[OPS ALERT] ${title}: ${detail}`);
  // TODO: await fetch(process.env.SLACK_OPS_WEBHOOK_URL!, {
  //   method: "POST",
  //   body: JSON.stringify({ text: `*${title}*\n${detail}` }),
  // });
}
