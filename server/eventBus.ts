/**
 * PART 12 — Event Bus
 * Typed event emitter with DB persistence to system_events.
 * All important state transitions emit an event here so the command center
 * can aggregate them without coupling every module to every other.
 */

import { getDb } from "./db";
import { systemEvents } from "../drizzle/schema";

// ─── Event type union ────────────────────────────────────────────────────────

export type EventType =
  | "order_placed"
  | "rx_uploaded"
  | "rx_approved"
  | "rx_rejected"
  | "stock_reserved"
  | "picking_started"
  | "packed"
  | "rider_assigned"
  | "delivered"
  | "delivery_failed"
  | "refill_due"
  | "payment_received"
  | "payment_failed"
  | "purchase_committed"
  | "stock_adjusted"
  | "batch_quarantined"
  | "manual_override"
  | "sla_breach_risk"
  | "sync_stale"
  | "ocr_pending"
  | "order_cancelled"
  | "whatsapp_order"
  | "counter_sale"
  | "pharmacist_approved"
  | "out_for_delivery";

export type ActorType =
  | "customer"
  | "pharmacist"
  | "rider"
  | "system"
  | "admin"
  | "whatsapp";
export type Severity = "info" | "warning" | "critical";
export type Channel = "app" | "whatsapp" | "counter" | "system" | "import";

export interface BusEvent {
  eventType: EventType;
  entityType?: string;
  entityId?: number;
  storeId?: number;
  actorId?: number;
  actorType?: ActorType;
  payload?: Record<string, unknown>;
  severity?: Severity;
  channel?: Channel;
}

// ─── In-process subscriber registry ─────────────────────────────────────────

type Handler = (event: BusEvent) => void | Promise<void>;
const subscribers = new Map<EventType | "*", Handler[]>();

export function subscribe(eventType: EventType | "*", handler: Handler): void {
  const list = subscribers.get(eventType) ?? [];
  list.push(handler);
  subscribers.set(eventType, list);
}

// ─── Emit ─────────────────────────────────────────────────────────────────────

export async function emit(event: BusEvent): Promise<void> {
  // 1. Persist to DB (best-effort — never throw)
  try {
    const db = await getDb();
    if (db) {
      await db.insert(systemEvents).values({
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        storeId: event.storeId,
        actorId: event.actorId,
        actorType: event.actorType ?? "system",
        payload: event.payload ? JSON.stringify(event.payload) : undefined,
        severity: event.severity ?? "info",
        channel: event.channel ?? "system",
        occurredAt: new Date(),
      });
    }
  } catch (err) {
    console.error("[EventBus] DB persist failed:", err);
  }

  // 2. Notify in-process subscribers
  const handlers = [
    ...(subscribers.get(event.eventType) ?? []),
    ...(subscribers.get("*") ?? []),
  ];
  for (const h of handlers) {
    try {
      await h(event);
    } catch (err) {
      console.error("[EventBus] Handler error:", err);
    }
  }
}

// ─── Convenience emitters ────────────────────────────────────────────────────

export const bus = {
  orderPlaced: (
    orderId: number,
    userId: number,
    storeId: number,
    total: number,
    channel: Channel = "app"
  ) =>
    emit({
      eventType: "order_placed",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId: userId,
      actorType: "customer",
      payload: { total },
      severity: "info",
      channel,
    }),

  rxUploaded: (rxId: number, userId: number, storeId?: number) =>
    emit({
      eventType: "rx_uploaded",
      entityType: "prescription",
      entityId: rxId,
      storeId,
      actorId: userId,
      actorType: "customer",
      severity: "info",
      channel: "app",
    }),

  rxApproved: (rxId: number, pharmacistId: number, storeId: number) =>
    emit({
      eventType: "rx_approved",
      entityType: "prescription",
      entityId: rxId,
      storeId,
      actorId: pharmacistId,
      actorType: "pharmacist",
      severity: "info",
      channel: "system",
    }),

  rxRejected: (
    rxId: number,
    pharmacistId: number,
    storeId: number,
    reason?: string
  ) =>
    emit({
      eventType: "rx_rejected",
      entityType: "prescription",
      entityId: rxId,
      storeId,
      actorId: pharmacistId,
      actorType: "pharmacist",
      payload: { reason },
      severity: "warning",
      channel: "system",
    }),

  stockReserved: (orderId: number, storeId: number) =>
    emit({
      eventType: "stock_reserved",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorType: "system",
      severity: "info",
      channel: "system",
    }),

  pickingStarted: (orderId: number, storeId: number, staffId?: number) =>
    emit({
      eventType: "picking_started",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId: staffId,
      actorType: "pharmacist",
      severity: "info",
      channel: "system",
    }),

  packed: (orderId: number, storeId: number, staffId?: number) =>
    emit({
      eventType: "packed",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId: staffId,
      actorType: "pharmacist",
      severity: "info",
      channel: "system",
    }),

  riderAssigned: (orderId: number, riderId: number, storeId: number) =>
    emit({
      eventType: "rider_assigned",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId: riderId,
      actorType: "rider",
      severity: "info",
      channel: "system",
    }),

  outForDelivery: (orderId: number, riderId: number, storeId: number) =>
    emit({
      eventType: "out_for_delivery",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId: riderId,
      actorType: "rider",
      severity: "info",
      channel: "system",
    }),

  delivered: (orderId: number, riderId: number, storeId: number) =>
    emit({
      eventType: "delivered",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId: riderId,
      actorType: "rider",
      severity: "info",
      channel: "system",
    }),

  deliveryFailed: (
    orderId: number,
    riderId: number,
    storeId: number,
    reason: string
  ) =>
    emit({
      eventType: "delivery_failed",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId: riderId,
      actorType: "rider",
      payload: { reason },
      severity: "warning",
      channel: "system",
    }),

  refillDue: (refillPlanId: number, userId: number, storeId?: number) =>
    emit({
      eventType: "refill_due",
      entityType: "refill_plan",
      entityId: refillPlanId,
      storeId,
      actorId: userId,
      actorType: "system",
      severity: "warning",
      channel: "system",
    }),

  paymentReceived: (orderId: number, amount: number, storeId: number) =>
    emit({
      eventType: "payment_received",
      entityType: "order",
      entityId: orderId,
      storeId,
      payload: { amount },
      severity: "info",
      channel: "system",
    }),

  paymentFailed: (
    orderId: number,
    amount: number,
    storeId: number,
    reason?: string
  ) =>
    emit({
      eventType: "payment_failed",
      entityType: "order",
      entityId: orderId,
      storeId,
      payload: { amount, reason },
      severity: "warning",
      channel: "system",
    }),

  purchaseCommitted: (
    invoiceId: number,
    storeId: number,
    vendorId: number,
    total: number
  ) =>
    emit({
      eventType: "purchase_committed",
      entityType: "purchase_invoice",
      entityId: invoiceId,
      storeId,
      payload: { vendorId, total },
      severity: "info",
      channel: "import",
    }),

  stockAdjusted: (
    skuId: number,
    storeId: number,
    staffId: number,
    delta: number,
    reason: string
  ) =>
    emit({
      eventType: "stock_adjusted",
      entityType: "store_sku",
      entityId: skuId,
      storeId,
      actorId: staffId,
      actorType: "admin",
      payload: { delta, reason },
      severity: "warning",
      channel: "system",
    }),

  batchQuarantined: (
    batchId: number,
    storeId: number,
    staffId: number,
    reason: string
  ) =>
    emit({
      eventType: "batch_quarantined",
      entityType: "batch",
      entityId: batchId,
      storeId,
      actorId: staffId,
      actorType: "admin",
      payload: { reason },
      severity: "critical",
      channel: "system",
    }),

  manualOverride: (
    entityType: string,
    entityId: number,
    storeId: number,
    staffId: number,
    note: string
  ) =>
    emit({
      eventType: "manual_override",
      entityType,
      entityId,
      storeId,
      actorId: staffId,
      actorType: "admin",
      payload: { note },
      severity: "warning",
      channel: "system",
    }),

  slaBreachRisk: (orderId: number, storeId: number, minutesRemaining: number) =>
    emit({
      eventType: "sla_breach_risk",
      entityType: "order",
      entityId: orderId,
      storeId,
      payload: { minutesRemaining },
      severity: "critical",
      channel: "system",
    }),

  syncStale: (feedName: string, storeId: number, lastSyncAt: Date) =>
    emit({
      eventType: "sync_stale",
      entityType: "sync_feed",
      storeId,
      payload: { feedName, lastSyncAt: lastSyncAt.toISOString() },
      severity: "warning",
      channel: "import",
    }),

  ocrPending: (jobId: number, storeId?: number) =>
    emit({
      eventType: "ocr_pending",
      entityType: "ocr_job",
      entityId: jobId,
      storeId,
      severity: "info",
      channel: "import",
    }),

  orderCancelled: (
    orderId: number,
    storeId: number,
    actorId: number,
    actorType: ActorType,
    reason?: string
  ) =>
    emit({
      eventType: "order_cancelled",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId,
      actorType,
      payload: { reason },
      severity: "warning",
      channel: "system",
    }),

  whatsappOrder: (
    orderId: number,
    userId: number,
    storeId: number,
    total: number
  ) =>
    emit({
      eventType: "whatsapp_order",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId: userId,
      actorType: "whatsapp",
      payload: { total },
      severity: "info",
      channel: "whatsapp",
    }),

  counterSale: (
    saleId: number,
    storeId: number,
    staffId: number,
    total: number
  ) =>
    emit({
      eventType: "counter_sale",
      entityType: "sale",
      entityId: saleId,
      storeId,
      actorId: staffId,
      actorType: "admin",
      payload: { total },
      severity: "info",
      channel: "counter",
    }),

  pharmacistApproved: (
    orderId: number,
    pharmacistId: number,
    storeId: number
  ) =>
    emit({
      eventType: "pharmacist_approved",
      entityType: "order",
      entityId: orderId,
      storeId,
      actorId: pharmacistId,
      actorType: "pharmacist",
      severity: "info",
      channel: "system",
    }),
};
