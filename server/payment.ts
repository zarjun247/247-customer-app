/**
 * server/payment.ts
 * Payment record helpers and SLA event management.
 * Works alongside connectors.ts (Razorpay SDK) and routers.ts (tRPC procedures).
 */

import { getDb } from "./db";
import { paymentRecords, slaEvents, orders } from "../drizzle/schema";
import { eq, and, lte, isNull, gt } from "drizzle-orm";
import { sendOpsAlert } from "./notifications";

// ─── Payment Record Helpers ───────────────────────────────────────────────────

export async function createPaymentRecord(params: {
  orderId: number;
  userId: number;
  gatewayOrderId: string;
  amount: number; // paise
  currency?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(paymentRecords).values({
    orderId: params.orderId,
    userId: params.userId,
    gatewayOrderId: params.gatewayOrderId,
    amount: params.amount,
    currency: params.currency ?? "INR",
    status: "pending",
  });
  return (result as { insertId: number }).insertId;
}

export async function confirmPaymentRecord(params: {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
  method?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .update(paymentRecords)
    .set({
      gatewayPaymentId: params.gatewayPaymentId,
      gatewaySignature: params.gatewaySignature,
      method: params.method,
      status: "paid",
      paidAt: new Date(),
    })
    .where(eq(paymentRecords.gatewayOrderId, params.gatewayOrderId));
}

export async function failPaymentRecord(params: {
  gatewayOrderId: string;
  reason?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(paymentRecords)
    .set({ status: "failed", failureReason: params.reason ?? "Payment failed" })
    .where(eq(paymentRecords.gatewayOrderId, params.gatewayOrderId));
}

export async function getPaymentByOrderId(orderId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(paymentRecords)
    .where(eq(paymentRecords.orderId, orderId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPaymentByGatewayOrderId(gatewayOrderId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(paymentRecords)
    .where(eq(paymentRecords.gatewayOrderId, gatewayOrderId))
    .limit(1);
  return rows[0] ?? null;
}

// ─── SLA Event Helpers ────────────────────────────────────────────────────────

export async function createSlaEvent(params: {
  orderId: number;
  storeId: number;
  promisedSlaMins: number;
}) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const deadline = new Date(now.getTime() + params.promisedSlaMins * 60 * 1000);
  await db.insert(slaEvents).values({
    orderId: params.orderId,
    storeId: params.storeId,
    slaStartedAt: now,
    promisedSlaMins: params.promisedSlaMins,
    slaDeadline: deadline,
    breached: false,
    breachAlertSent: false,
  });
}

export async function closeSlaEvent(orderId: number) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const rows = await db
    .select()
    .from(slaEvents)
    .where(and(eq(slaEvents.orderId, orderId), isNull(slaEvents.deliveredAt)))
    .limit(1);
  if (!rows.length) return;
  const event = rows[0];
  const breached = now > event.slaDeadline;
  await db
    .update(slaEvents)
    .set({ deliveredAt: now, breached })
    .where(eq(slaEvents.id, event.id));
}

/**
 * Detect and flag SLA breaches for all open events past their deadline.
 * Should be called periodically (e.g., every 5 minutes from a scheduled job or on-demand).
 * Returns the number of new breaches detected.
 */
export async function detectSlaBreaches(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();

  // Find open SLA events that are past deadline and not yet flagged
  const breached = await db
    .select()
    .from(slaEvents)
    .where(
      and(
        isNull(slaEvents.deliveredAt),
        lte(slaEvents.slaDeadline, now),
        eq(slaEvents.breached, false)
      )
    );

  for (const event of breached) {
    await db
      .update(slaEvents)
      .set({ breached: true, breachDetectedAt: now })
      .where(eq(slaEvents.id, event.id));

    // Send ops alert if not already sent
    if (!event.breachAlertSent) {
      await sendOpsAlert(
        `SLA Breach: Order #${event.orderId}`,
        `Order #${event.orderId} (Store #${event.storeId}) exceeded SLA of ${event.promisedSlaMins} min. Deadline was ${event.slaDeadline.toISOString()}.`
      ).catch(() => {});
      await db
        .update(slaEvents)
        .set({ breachAlertSent: true })
        .where(eq(slaEvents.id, event.id));
    }
  }

  return breached.length;
}

/**
 * Get SLA performance summary for a store.
 * Returns total events, on-time count, breach count, and breach rate.
 */
export async function getSlaBreachSummary(storeId: number, days = 30) {
  const db = await getDb();
  if (!db) return null;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await db
    .select()
    .from(slaEvents)
    .where(
      and(
        eq(slaEvents.storeId, storeId),
        gt(slaEvents.createdAt, since)
      )
    );

  const total = events.length;
  const breached = events.filter(e => e.breached).length;
  const delivered = events.filter(e => e.deliveredAt !== null).length;
  const onTime = events.filter(e => e.deliveredAt !== null && !e.breached).length;

  return {
    total,
    delivered,
    breached,
    onTime,
    breachRate: total > 0 ? breached / total : 0,
    onTimeRate: delivered > 0 ? onTime / delivered : 0,
  };
}

/**
 * Get open (undelivered) SLA events — useful for the command center breach board.
 */
export async function getOpenSlaEvents(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const rows = await db
    .select({
      id: slaEvents.id,
      orderId: slaEvents.orderId,
      slaStartedAt: slaEvents.slaStartedAt,
      slaDeadline: slaEvents.slaDeadline,
      promisedSlaMins: slaEvents.promisedSlaMins,
      breached: slaEvents.breached,
    })
    .from(slaEvents)
    .where(
      and(
        eq(slaEvents.storeId, storeId),
        isNull(slaEvents.deliveredAt)
      )
    );

  return rows.map(r => ({
    ...r,
    minutesRemaining: Math.round((r.slaDeadline.getTime() - now.getTime()) / 60000),
    isBreached: r.breached || now > r.slaDeadline,
  }));
}

// ─── Expiry Zone Helpers ──────────────────────────────────────────────────────

export async function getExpiryZones(storeId: number) {
  const db = await getDb();
  if (!db) return null;

  const { batches } = await import("../drizzle/schema");
  const { sql, and: _and, eq: _eq, lte: _lte, gt: _gt, ne: _ne } = await import("drizzle-orm");

  const now = new Date();
  const d30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const d60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const d90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const allBatches = await db
    .select({
      id: batches.id,
      productId: batches.productId,
      batchNumber: batches.batchNumber,
      expiryDate: batches.expiryDate,
      quantity: batches.quantity,
      unitCost: batches.unitCost,
      status: batches.status,
    })
    .from(batches)
    .where(
      _and(
        _eq(batches.storeId, storeId),
        _ne(batches.status, "depleted"),
        _lte(batches.expiryDate, d90)
      )
    );

  const expired = allBatches.filter(b => b.expiryDate <= now);
  const critical = allBatches.filter(b => b.expiryDate > now && b.expiryDate <= d30);
  const warning = allBatches.filter(b => b.expiryDate > d30 && b.expiryDate <= d60);
  const caution = allBatches.filter(b => b.expiryDate > d60 && b.expiryDate <= d90);

  const calcValue = (list: typeof allBatches) =>
    list.reduce((s, b) => s + b.quantity * parseFloat(String(b.unitCost ?? 0)), 0);

  return {
    expired: { count: expired.length, value: calcValue(expired), items: expired },
    critical: { count: critical.length, value: calcValue(critical), items: critical }, // <30d
    warning: { count: warning.length, value: calcValue(warning), items: warning },     // 30–60d
    caution: { count: caution.length, value: calcValue(caution), items: caution },     // 60–90d
  };
}
