/**
 * refillReminderWorker.ts
 *
 * Background worker that dispatches due refill reminders to customers.
 * Runs on a configurable interval (default: 6 hours).
 * Deduplication is handled by the DB-backed upsertRefillReminder (userId + productId unique).
 *
 * Controlled by REFILL_REMINDER_WORKER_ENABLED env var (default: true in production).
 */
import pino from "pino";
import { getDb } from "../db";
import { refillReminders, products } from "../../drizzle/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { createNotification } from "./notificationService";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// Default: check every 6 hours
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

let refillReminderTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Process all due refill reminders: send a notification to each customer
 * whose next reminder date is today or in the past and is not dismissed/snoozed.
 */
export async function processRefillReminders(): Promise<number> {
  const db = await getDb();
  if (!db) {
    logger.warn("refillReminderWorker: DB unavailable, skipping tick");
    return 0;
  }

  const now = new Date();
  const dueReminders = await db
    .select({
      id: refillReminders.id,
      userId: refillReminders.userId,
      productId: refillReminders.productId,
      nextReminderAt: refillReminders.nextReminderAt,
      avgIntervalDays: refillReminders.avgIntervalDays,
      productName: products.name,
    })
    .from(refillReminders)
    .innerJoin(products, eq(refillReminders.productId, products.id))
    .where(
      and(
        eq(refillReminders.isDismissed, false),
        lte(refillReminders.nextReminderAt, now),
        // Not currently snoozed
        sql`(${refillReminders.snoozedUntil} IS NULL OR ${refillReminders.snoozedUntil} <= ${now})`
      )
    );

  let dispatched = 0;
  for (const reminder of dueReminders) {
    try {
      await createNotification({
        customerId: reminder.userId,
        type: "refill_reminder",
        title: "Time to refill your medication",
        body: `Your supply of ${reminder.productName} may be running low. Tap to reorder.`,
        channel: "in_app",
      });
      // Advance the next reminder date by the average interval
      const nextReminderAt = new Date(
        now.getTime() + reminder.avgIntervalDays * 24 * 60 * 60 * 1000
      );
      await db
        .update(refillReminders)
        .set({ nextReminderAt })
        .where(eq(refillReminders.id, reminder.id));
      dispatched++;
    } catch (err) {
      logger.error(
        { err, reminderId: reminder.id },
        "refillReminderWorker: failed to dispatch reminder"
      );
    }
  }

  if (dispatched > 0) {
    logger.info({ dispatched }, "refillReminderWorker: dispatched reminders");
  }
  return dispatched;
}

export function startRefillReminderWorker(): void {
  if (refillReminderTimer) return;
  const intervalMs = parseInt(
    process.env.REFILL_REMINDER_WORKER_INTERVAL_MS ??
      String(DEFAULT_INTERVAL_MS),
    10
  );
  // Run once immediately, then on interval
  processRefillReminders().catch((err: unknown) =>
    logger.error({ err }, "refillReminderWorker initial tick failed")
  );
  refillReminderTimer = setInterval(() => {
    processRefillReminders().catch((err: unknown) =>
      logger.error({ err }, "refillReminderWorker tick failed")
    );
  }, intervalMs);
  logger.info({ intervalMs }, "refillReminderWorker started");
}

export function stopRefillReminderWorker(): void {
  if (refillReminderTimer) {
    clearInterval(refillReminderTimer);
    refillReminderTimer = null;
    logger.info("refillReminderWorker stopped");
  }
}

export function isRefillReminderWorkerRunning(): boolean {
  return refillReminderTimer !== null;
}
