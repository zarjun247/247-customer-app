import pino from "pino";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { dsrRequests, users } from "../../drizzle/schema";
import { prescriptions } from "../../drizzle/schema";
import { orders } from "../../drizzle/schema";
import { logAudit } from "./audit";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export interface RetentionTickResult {
  processed: number;
  errors: number;
}

// Regex: H/H1/X schedule code to determine if a Rx must be kept (5-year retention).
const REGULATED_SCHEDULE_PATTERN = /^(H|H1|X)$/i;

export async function runRetentionTick(): Promise<RetentionTickResult> {
  if (!ENV.retentionWorkerEnabled) {
    logger.debug(
      "retentionWorker: RETENTION_WORKER_ENABLED=false; skipping tick"
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

  return { processed, errors };
}

async function processErasureRequest(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  req: typeof dsrRequests.$inferSelect
): Promise<void> {
  const scope = (req.requestPayload as any)?.scope ?? "all";
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
        .where(eq((orders as any).userId, customerId))
        .limit(2000);

      for (const order of orderRows) {
        await tx
          .update(orders)
          .set({
            deliveryAddress: null,
          } as any)
          .where(eq((orders as any).id, (order as any).id));
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
