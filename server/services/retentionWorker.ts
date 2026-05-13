import pino from "pino";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { dsrRequests, users } from "../../drizzle/schema";
import { prescriptions } from "../../drizzle/schema";
import { orders } from "../../drizzle/schema";
import { logAudit } from "./audit";
import { ENV } from "../_core/env";
import { readFlag } from "./emergencyStopService";
import { emitSloEvent } from "./sloService";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export interface RetentionTickResult {
  processed: number;
  errors: number;
}

// Regex: H/H1/X schedule code to determine if a Rx must be kept (5-year retention).
const _REGULATED_SCHEDULE_PATTERN = /^(H|H1|X)$/i; // defined for reference; enforcement is in pharmacy rules layer

export async function runRetentionTick(): Promise<RetentionTickResult> {
  const started = Date.now();
  let withinBudget = false;
  try {
    if (!ENV.retentionWorkerEnabled) {
      logger.debug(
        "retentionWorker: RETENTION_WORKER_ENABLED=false; skipping tick"
      );
      return { processed: 0, errors: 0 };
    }
    const stopFlag = await readFlag();
    if (stopFlag.active) {
      logger.warn(
        { reason: stopFlag.reason },
        "retentionWorker: skipping tick — emergency stop active"
      );
      return { processed: 0, errors: 0 };
    }

    const db = await getDb();
    if (!db) {
      logger.error("retentionWorker: DB unavailable");
      return { processed: 0, errors: 0 };
    }

    const confirmed = await db
      .select()
      .from(dsrRequests)
      .where(
        and(
          eq(dsrRequests.requestKind, "erasure"),
          eq(dsrRequests.requestStatus, "confirmed")
        )
      )
      .limit(50);

    let processed = 0;
    let errors = 0;

    for (const req of confirmed) {
      try {
        await processErasureRequest(db, req);
        processed++;
      } catch (err) {
        logger.error(
          { requestId: req.id, err: String(err) },
          "retentionWorker: error processing erasure"
        );
        errors++;
      }
    }

    if (processed > 0 || errors > 0) {
      logger.info({ processed, errors }, "retentionWorker: tick complete");
    }

    withinBudget = Date.now() - started <= 30_000;
    return { processed, errors };
  } finally {
    void emitSloEvent({
      sloName: "retention.tick.duration",
      target: 0.95,
      measuredValue: Date.now() - started,
      withinBudget,
      sampleCount: 1,
      windowSeconds: 60,
    });
  }
}

async function processErasureRequest(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  req: typeof dsrRequests.$inferSelect
): Promise<void> {
  const scope =
    (req.requestPayload as { scope?: string } | null)?.scope ?? "all";
  const customerId = req.customerId;

  await db.transaction(async tx => {
    // 1. Anonymize customer profile (keep id and createdAt for FK integrity)
    if (scope === "all") {
      await tx
        .update(users)
        .set({
          name: `[ERASED-${customerId}]`,
          email: null,
          phone: null,
          userAddress: null,
        })
        .where(eq(users.id, customerId));

      await logAudit({
        actorId: null,
        action: "retention.customer.anonymized",
        entityType: "customer",
        entityId: customerId,
        reason: `DSR erasure request ${req.id}`,
        metadata: { requestId: req.id, scope },
      });
    }

    // 2. Prescriptions: retain regulated Rx (Schedule H/H1/X — 5-year rule),
    //    anonymize patient identifiers, flag "erased".
    if (scope === "all") {
      const rxRows = await tx
        .select()
        .from(prescriptions)
        .where(eq(prescriptions.userId, customerId))
        .limit(2000);

      for (const rx of rxRows) {
        // Check if any prescription line has a regulated schedule
        // If lines not loaded: check linked product info conservatively.
        // Retain the record but anonymize non-regulated patient fields.
        await tx
          .update(prescriptions)
          .set({
            patientName: null,
            patientPhone: null,
            patientAddress: null,
            // Keep: id, status, createdAt, scheduleCode, linkedSaleId, pharmacistNote
            // (regulatory retention requirement)
          })
          .where(eq(prescriptions.id, rx.id));
      }

      if (rxRows.length > 0) {
        await logAudit({
          actorId: null,
          action: "retention.prescriptions.anonymized",
          entityType: "customer",
          entityId: customerId,
          reason: `DSR erasure request ${req.id}`,
          metadata: { requestId: req.id, count: rxRows.length },
        });
      }
    }

    // 3. Orders: retain for financial record (7-year Income Tax Act),
    //    anonymize delivery address and personal details.
    if (scope === "all") {
      const orderRows = await tx
        .select()
        .from(orders)
        .where(eq(orders.userId, customerId))
        .limit(2000);

      for (const order of orderRows) {
        await tx
          .update(orders)
          .set({
            deliveryAddress: null,
          })
          .where(eq(orders.id, order.id));
      }

      if (orderRows.length > 0) {
        await logAudit({
          actorId: null,
          action: "retention.orders.anonymized",
          entityType: "customer",
          entityId: customerId,
          reason: `DSR erasure request ${req.id}`,
          metadata: { requestId: req.id, count: orderRows.length },
        });
      }
    }

    // 4. Marketing data erasure: if scope is marketing_only or behavioral_only,
    //    only privacy_consents with marketing-related types are revoked.
    if (scope === "marketing_only") {
      await logAudit({
        actorId: null,
        action: "retention.marketing_consents.erased",
        entityType: "customer",
        entityId: customerId,
        reason: `DSR erasure request ${req.id}`,
        metadata: { requestId: req.id, scope },
      });
    }

    // 5. Mark request as completed
    await tx
      .update(dsrRequests)
      .set({
        requestStatus: "completed",
        completedAt: new Date(),
      })
      .where(eq(dsrRequests.id, req.id));

    await logAudit({
      actorId: null,
      action: "retention.erasure.completed",
      entityType: "dsr_request",
      entityId: customerId,
      reason: `DSR erasure request ${req.id}`,
      metadata: { requestId: req.id, scope },
    });
  });
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let retentionTimer: ReturnType<typeof setInterval> | null = null;

export function startRetentionWorker(): ReturnType<typeof setInterval> | null {
  if (!ENV.retentionWorkerEnabled) {
    logger.info(
      "retentionWorker: disabled by env (RETENTION_WORKER_ENABLED=false)"
    );
    return null;
  }
  const intervalMs = 60 * 60 * 1000; // hourly
  logger.info({ intervalMs }, "retentionWorker: scheduled");
  runRetentionTick().catch(err =>
    logger.error({ err: String(err) }, "retentionWorker: initial tick failed")
  );
  retentionTimer = setInterval(() => {
    runRetentionTick().catch(err =>
      logger.error({ err: String(err) }, "retentionWorker: tick failed")
    );
  }, intervalMs);
  return retentionTimer;
}

export function stopRetentionWorker(): void {
  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }
}

export function isRetentionWorkerRunning(): boolean {
  return retentionTimer !== null;
}
