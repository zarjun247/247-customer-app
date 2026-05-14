import { and, asc, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { MySqlDatabase } from "drizzle-orm/mysql-core";
import type {
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
} from "drizzle-orm/mysql2";
type DrizzleDb = MySqlDatabase<
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
  Record<string, unknown>
>;
import { getDb } from "../db";
import {
  commercialEvents,
  type NewCommercialEvent,
} from "../../drizzle/schema";
export {
  COMMERCIAL_LIFECYCLE_CONCEPTS,
  COMMERCIAL_LIFECYCLE_STATES,
  COMMERCIAL_EVENT_TYPES,
  serializeCommercialPayload,
  normalizeCommercialEvent,
  mapCommercialStatus,
  createInMemoryCommercialEventStore,
} from "./commercialLifecycleHelpers";
export type {
  CommercialLifecycleConcept,
  CommercialLifecycleState,
  CommercialEventType,
  CommercialAggregateType,
  CommercialEventActorType,
  CommercialEventInput,
  CommercialEventRecord,
  CommercialEventStore,
  CommercialTimelineFilter,
} from "./commercialLifecycleHelpers";
import {
  normalizeCommercialEvent,
  compareCommercialEvents,
} from "./commercialLifecycleHelpers";
import type {
  CommercialEventInput,
  CommercialEventRecord,
  CommercialEventStore,
  CommercialTimelineFilter,
  CommercialLifecycleState,
} from "./commercialLifecycleHelpers";

const REF_FIELDS = [
  "providerRef",
  "providerPaymentId",
  "providerRefundId",
  "gatewayOrderId",
  "gatewayPaymentId",
  "invoiceNumber",
  "creditNoteNo",
];

async function appendCommercialEventToDatabase(
  event: CommercialEventRecord
): Promise<CommercialEventRecord> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for commercial event append");
  if (event.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(commercialEvents)
      .where(eq(commercialEvents.idempotencyKey, event.idempotencyKey))
      .limit(1);
    if (existing) return fromDbEvent(existing, true);
  }
  const insertRow: NewCommercialEvent = {
    eventId: event.eventId,
    aggregateType: String(event.aggregateType),
    aggregateId: String(event.aggregateId),
    eventType: String(event.eventType),
    eventVersion: event.eventVersion,
    actorType: event.actorType,
    actorId: event.actorId,
    storeId: event.storeId,
    orderId: event.orderId,
    saleId: event.saleId,
    invoiceId: event.invoiceId,
    reservationId: event.reservationId,
    paymentId: event.paymentId,
    refundId: event.refundId,
    eventPayload: JSON.stringify(event.eventPayload),
    occurredAt: event.occurredAt,
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
  };
  await db.insert(commercialEvents).values(insertRow);
  return event;
}

// Append a commercial event using an existing DB/transaction object (tx).
// This allows callers that are already within a transaction to persist the canonical
// commercial event inside the same transactional boundary. tx must implement the same
// query interface as the Drizzle DB client (select/insert/update)
export async function appendCommercialEventWithDb(
  db: DrizzleDb,
  input: CommercialEventInput
): Promise<CommercialEventRecord> {
  const event = normalizeCommercialEvent(input);
  if (!db) throw new Error("DB/tx unavailable for commercial event append");
  if (event.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(commercialEvents)
      .where(eq(commercialEvents.idempotencyKey, event.idempotencyKey))
      .limit(1);
    if (existing) return fromDbEvent(existing, true);
  }
  const insertRow2: NewCommercialEvent = {
    eventId: event.eventId,
    aggregateType: String(event.aggregateType),
    aggregateId: String(event.aggregateId),
    eventType: String(event.eventType),
    eventVersion: event.eventVersion,
    actorType: event.actorType,
    actorId: event.actorId,
    storeId: event.storeId,
    orderId: event.orderId,
    saleId: event.saleId,
    invoiceId: event.invoiceId,
    reservationId: event.reservationId,
    paymentId: event.paymentId,
    refundId: event.refundId,
    eventPayload: JSON.stringify(event.eventPayload),
    occurredAt: event.occurredAt,
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
  };
  await db.insert(commercialEvents).values(insertRow2);
  return event;
}

function prim(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function primOrNull(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function fromDbEvent(
  row: Record<string, unknown>,
  duplicate = false
): CommercialEventRecord {
  let payload: Record<string, unknown> = {};
  if (typeof row.eventPayload === "string" && row.eventPayload) {
    try {
      payload = JSON.parse(row.eventPayload) as Record<string, unknown>;
    } catch {
      payload = { parseError: true };
    }
  } else if (row.eventPayload && typeof row.eventPayload === "object") {
    payload = row.eventPayload as Record<string, unknown>;
  }
  return {
    eventId: prim(row.eventId),
    aggregateType: prim(row.aggregateType),
    aggregateId: prim(row.aggregateId),
    eventType: prim(row.eventType),
    eventVersion: Number(row.eventVersion ?? 1),
    actorType: prim(row.actorType, "system"),
    actorId: primOrNull(row.actorId),
    storeId: primOrNull(row.storeId),
    orderId: primOrNull(row.orderId),
    saleId: primOrNull(row.saleId),
    invoiceId: primOrNull(row.invoiceId),
    reservationId: primOrNull(row.reservationId),
    paymentId: primOrNull(row.paymentId),
    refundId: primOrNull(row.refundId),
    eventPayload: payload,
    occurredAt:
      row.occurredAt instanceof Date
        ? row.occurredAt
        : new Date(prim(row.occurredAt)),
    idempotencyKey: primOrNull(row.idempotencyKey),
    correlationId: primOrNull(row.correlationId),
    duplicate,
  };
}

async function getDatabaseTimeline(
  filter: CommercialTimelineFilter
): Promise<CommercialEventRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for commercial timeline");
  const conditions: SQL<unknown>[] = [];
  if (filter.aggregateType)
    conditions.push(
      eq(commercialEvents.aggregateType, String(filter.aggregateType))
    );
  if (filter.aggregateId != null)
    conditions.push(
      eq(commercialEvents.aggregateId, String(filter.aggregateId))
    );
  if (filter.orderId != null)
    conditions.push(eq(commercialEvents.orderId, String(filter.orderId)));
  if (filter.paymentId != null)
    conditions.push(eq(commercialEvents.paymentId, String(filter.paymentId)));
  if (filter.invoiceId != null)
    conditions.push(eq(commercialEvents.invoiceId, String(filter.invoiceId)));
  if (filter.saleId != null)
    conditions.push(eq(commercialEvents.saleId, String(filter.saleId)));
  if (filter.reservationId != null)
    conditions.push(
      eq(commercialEvents.reservationId, String(filter.reservationId))
    );
  if (filter.refundId != null)
    conditions.push(eq(commercialEvents.refundId, String(filter.refundId)));
  const query = db.select().from(commercialEvents);
  const rows = await (
    conditions.length ? query.where(and(...conditions)) : query
  ).orderBy(asc(commercialEvents.occurredAt), asc(commercialEvents.eventId));
  return rows.map(row => fromDbEvent(row as Record<string, unknown>));
}

export async function appendCommercialEvent(
  input: CommercialEventInput,
  store?: CommercialEventStore
) {
  const event = normalizeCommercialEvent(input);
  if (store) return store.append(event);
  return appendCommercialEventToDatabase(event);
}

export async function appendCommercialEventBestEffort(
  input: CommercialEventInput
) {
  try {
    return await appendCommercialEvent(input);
  } catch (error) {
    return {
      skipped: true,
      reason: (error as Error)?.message ?? String(error),
    };
  }
}

export async function appendCommercialEvents(
  inputs: CommercialEventInput[],
  store?: CommercialEventStore
) {
  const appended: CommercialEventRecord[] = [];
  for (const input of inputs)
    appended.push(await appendCommercialEvent(input, store));
  return appended;
}

export async function getCommercialTimeline(
  filter: CommercialTimelineFilter,
  store?: CommercialEventStore
) {
  if (store) return store.timeline(filter);
  return getDatabaseTimeline(filter);
}

export const getCommercialTimelineByOrder = (
  orderId: string | number,
  store?: CommercialEventStore
) => getCommercialTimeline({ orderId }, store);
export const getCommercialTimelineByPayment = (
  paymentId: string | number,
  store?: CommercialEventStore
) => getCommercialTimeline({ paymentId }, store);
export const getCommercialTimelineByInvoice = (
  invoiceId: string | number,
  store?: CommercialEventStore
) => getCommercialTimeline({ invoiceId }, store);

function sumPayloadAmount(events: CommercialEventRecord[], types: string[]) {
  return events
    .filter(event => types.includes(event.eventType))
    .reduce(
      (sum, event) =>
        sum +
        Number(
          event.eventPayload.amountPaise ?? event.eventPayload.amount ?? 0
        ),
      0
    );
}

export function getCommercialLifecycleState(
  events: CommercialEventRecord[]
): CommercialLifecycleState {
  const types = new Set(events.map(event => event.eventType));
  if (types.has("payment_failed")) return "failed";
  if (types.has("cancellation_completed")) return "cancelled";
  if (types.has("reservation_expired")) return "expired";
  const paid = sumPayloadAmount(events, [
    "payment_verified",
    "payment_authorized",
  ]);
  const refunded = sumPayloadAmount(events, ["refund_completed"]);
  if (paid > 0 && refunded >= paid) return "refunded";
  if (refunded > 0) return "partially_refunded";
  if (types.has("reconciliation_completed")) return "reconciled";
  if (types.has("order_confirmed") || types.has("invoice_generated"))
    return "confirmed";
  if (types.has("payment_verified")) return "authorized";
  if (
    types.has("reservation_created") ||
    types.has("checkout_initiated") ||
    types.has("payment_authorized")
  )
    return "pending";
  if (types.has("cart_initiated")) return "initiated";
  return "pending";
}

export async function getAggregateLifecycle(
  filter: CommercialTimelineFilter,
  store?: CommercialEventStore
) {
  const timeline = await getCommercialTimeline(filter, store);
  return { state: getCommercialLifecycleState(timeline), timeline };
}

export interface CommercialLifecycleAnomaly {
  code: string;
  severity: "warning" | "critical";
  message: string;
  refs?: Record<string, string | number | null>;
}

export function detectCommercialImpossibleStates(
  events: CommercialEventRecord[]
): CommercialLifecycleAnomaly[] {
  const anomalies: CommercialLifecycleAnomaly[] = [];
  const types = new Set(events.map(event => event.eventType));
  const paid = sumPayloadAmount(events, [
    "payment_verified",
    "payment_authorized",
  ]);
  const refunded = sumPayloadAmount(events, ["refund_completed"]);
  if (refunded > paid && refunded > 0)
    anomalies.push({
      code: "refund_exceeds_payment",
      severity: "critical",
      message: "Refund total exceeds verified payment total.",
    });
  if (types.has("invoice_generated") && !types.has("order_confirmed"))
    anomalies.push({
      code: "invoice_without_successful_order",
      severity: "critical",
      message: "Invoice exists without an order confirmation event.",
    });
  if (types.has("reservation_consumed") && !types.has("order_confirmed"))
    anomalies.push({
      code: "consumed_reservation_without_order",
      severity: "critical",
      message: "Reservation was consumed without order confirmation.",
    });
  if (types.has("payment_verified") && !types.has("order_confirmed"))
    anomalies.push({
      code: "payment_verified_without_sale_confirmation",
      severity: "warning",
      message:
        "Payment verified but no sale/order confirmation event is present.",
    });
  if (types.has("refund_completed") && !types.has("payment_verified"))
    anomalies.push({
      code: "refund_without_payment",
      severity: "critical",
      message: "Refund completion exists without a verified payment event.",
    });
  if (
    types.has("invoice_generated") &&
    !types.has("payment_verified") &&
    !types.has("order_confirmed")
  )
    anomalies.push({
      code: "orphan_invoice",
      severity: "critical",
      message: "Invoice cannot be linked to payment or order truth.",
    });
  if (
    types.has("payment_verified") &&
    !events.some(event => event.orderId || event.saleId)
  )
    anomalies.push({
      code: "payment_without_order",
      severity: "warning",
      message: "Payment event does not carry an orderId or saleId reference.",
    });
  for (const field of REF_FIELDS) {
    const seen = new Map<string, number>();
    for (const event of events) {
      const value = event.eventPayload[field];
      if (value == null) continue;
      let ref: string;
      if (typeof value === "object") {
        ref = JSON.stringify(value);
      } else {
        const prim = value as string | number | boolean | bigint;
        ref = String(prim);
      }
      seen.set(ref, (seen.get(ref) ?? 0) + 1);
    }
    for (const [ref, count] of Array.from(seen.entries())) {
      if (count > 1)
        anomalies.push({
          code: field.toLowerCase().includes("invoice")
            ? "duplicate_invoice_ref"
            : "duplicate_provider_ref",
          severity: "warning",
          message: `Duplicate commercial reference detected for ${field}.`,
          refs: { field, ref, count },
        });
    }
  }
  const idempotencyAttempts = events.filter(event => event.duplicate);
  if (idempotencyAttempts.length)
    anomalies.push({
      code: "duplicate_event_attempt",
      severity: "warning",
      message: "Duplicate idempotency-key event append was suppressed.",
    });
  return anomalies;
}

export function summarizeCommercialLifecycle(events: CommercialEventRecord[]) {
  const timeline = [...events].sort(compareCommercialEvents);
  const state = getCommercialLifecycleState(timeline);
  const anomalies = detectCommercialImpossibleStates(timeline);
  return {
    state,
    eventCount: timeline.length,
    firstOccurredAt: timeline[0]?.occurredAt ?? null,
    lastOccurredAt: timeline[timeline.length - 1]?.occurredAt ?? null,
    anomalies,
    hasCriticalAnomaly: anomalies.some(
      anomaly => anomaly.severity === "critical"
    ),
  };
}

export async function reconcileCommercialAggregate(
  filter: CommercialTimelineFilter,
  store?: CommercialEventStore
) {
  const timeline = await getCommercialTimeline(filter, store);
  return summarizeCommercialLifecycle(timeline);
}

export function assertCommercialLedgerAppendOnlyOperation(
  operation: "append" | "update" | "delete"
) {
  if (operation !== "append")
    throw new Error(
      "commercial event ledger is append-only; update/delete are prohibited"
    );
  return true;
}
