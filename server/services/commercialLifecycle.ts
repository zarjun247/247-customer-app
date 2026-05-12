import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "../db";
import { commercialEvents } from "../../drizzle/schema";

export const COMMERCIAL_LIFECYCLE_CONCEPTS = [
  "cart",
  "reservation",
  "checkout",
  "payment",
  "sale_order",
  "invoice",
  "refund",
  "return",
  "credit_note",
  "cancellation",
  "reconciliation",
] as const;

export const COMMERCIAL_LIFECYCLE_STATES = [
  "initiated",
  "pending",
  "authorized",
  "confirmed",
  "partially_refunded",
  "refunded",
  "cancelled",
  "failed",
  "expired",
  "reconciled",
] as const;

export const COMMERCIAL_EVENT_TYPES = [
  "cart_initiated",
  "checkout_initiated",
  "reservation_created",
  "reservation_released",
  "reservation_consumed",
  "reservation_expired",
  "payment_authorized",
  "payment_verified",
  "payment_failed",
  "order_confirmed",
  "invoice_generated",
  "refund_initiated",
  "refund_completed",
  "return_completed",
  "credit_note_generated",
  "cancellation_completed",
  "reconciliation_completed",
] as const;

export type CommercialLifecycleConcept =
  (typeof COMMERCIAL_LIFECYCLE_CONCEPTS)[number];
export type CommercialLifecycleState =
  (typeof COMMERCIAL_LIFECYCLE_STATES)[number];
export type CommercialEventType =
  | (typeof COMMERCIAL_EVENT_TYPES)[number]
  | string;
export type CommercialAggregateType =
  | CommercialLifecycleConcept
  | "order"
  | "sale"
  | "commercial"
  | string;

export type CommercialEventActorType =
  | "system"
  | "customer"
  | "staff"
  | "provider"
  | "admin"
  | "job"
  | string;

export interface CommercialEventInput {
  eventId?: string;
  aggregateType: CommercialAggregateType;
  aggregateId: string | number;
  eventType: CommercialEventType;
  eventVersion?: number;
  actorType?: CommercialEventActorType;
  actorId?: string | number | null;
  storeId?: string | number | null;
  orderId?: string | number | null;
  saleId?: string | number | null;
  invoiceId?: string | number | null;
  reservationId?: string | number | null;
  paymentId?: string | number | null;
  refundId?: string | number | null;
  eventPayload?: Record<string, unknown> | null;
  occurredAt?: Date | string | number;
  idempotencyKey?: string | null;
  correlationId?: string | null;
}

export interface CommercialEventRecord
  extends Required<
    Omit<
      CommercialEventInput,
      | "eventPayload"
      | "occurredAt"
      | "idempotencyKey"
      | "correlationId"
      | "actorId"
      | "storeId"
      | "orderId"
      | "saleId"
      | "invoiceId"
      | "reservationId"
      | "paymentId"
      | "refundId"
    >
  > {
  actorId: string | null;
  storeId: string | null;
  orderId: string | null;
  saleId: string | null;
  invoiceId: string | null;
  reservationId: string | null;
  paymentId: string | null;
  refundId: string | null;
  eventPayload: Record<string, unknown>;
  occurredAt: Date;
  idempotencyKey: string | null;
  correlationId: string | null;
  duplicate?: boolean;
}

export interface CommercialEventStore {
  append(event: CommercialEventRecord): Promise<CommercialEventRecord>;
  findByIdempotencyKey(key: string): Promise<CommercialEventRecord | null>;
  timeline(filter: CommercialTimelineFilter): Promise<CommercialEventRecord[]>;
}

export interface CommercialTimelineFilter {
  aggregateType?: string;
  aggregateId?: string | number;
  orderId?: string | number;
  paymentId?: string | number;
  invoiceId?: string | number;
  saleId?: string | number;
  reservationId?: string | number;
  refundId?: string | number;
}

const SECRET_KEY_PATTERN =
  /(secret|password|token|signature|api[_-]?key|authorization|cookie|otp|cvv|cardNumber|gatewaySignature)/i;
const REF_FIELDS = [
  "providerRef",
  "providerPaymentId",
  "providerRefundId",
  "gatewayOrderId",
  "gatewayPaymentId",
  "invoiceNumber",
  "creditNoteNo",
];

function asRef(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === "object"
    ? JSON.stringify(value)
    : String(value as string | number | boolean | bigint);
}

function normalizeOccurredAt(value?: Date | string | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  return new Date();
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      output[key] = SECRET_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactValue(nested);
    }
    return output;
  }
  return value;
}

export function serializeCommercialPayload(
  payload?: Record<string, unknown> | null
): Record<string, unknown> {
  return redactValue(payload ?? {}) as Record<string, unknown>;
}

export function normalizeCommercialEvent(
  input: CommercialEventInput
): CommercialEventRecord {
  return {
    eventId: input.eventId ?? randomUUID(),
    aggregateType: String(input.aggregateType),
    aggregateId: String(input.aggregateId),
    eventType: String(input.eventType),
    eventVersion: input.eventVersion ?? 1,
    actorType: input.actorType ?? "system",
    actorId: asRef(input.actorId),
    storeId: asRef(input.storeId),
    orderId: asRef(input.orderId),
    saleId: asRef(input.saleId),
    invoiceId: asRef(input.invoiceId),
    reservationId: asRef(input.reservationId),
    paymentId: asRef(input.paymentId),
    refundId: asRef(input.refundId),
    eventPayload: serializeCommercialPayload(input.eventPayload),
    occurredAt: normalizeOccurredAt(input.occurredAt),
    idempotencyKey: input.idempotencyKey ?? null,
    correlationId: input.correlationId ?? null,
  };
}

export function mapCommercialStatus(
  concept: CommercialLifecycleConcept,
  status?: string | null
): CommercialLifecycleState {
  const s = (status ?? "").toLowerCase();
  if (["new", "created", "draft", "active"].includes(s))
    return concept === "reservation" ? "authorized" : "initiated";
  if (["pending", "processing", "in_progress"].includes(s)) return "pending";
  if (["authorized", "reserved"].includes(s)) return "authorized";
  if (
    [
      "paid",
      "success",
      "confirmed",
      "issued",
      "consumed",
      "completed",
    ].includes(s)
  )
    return "confirmed";
  if (["partially_refunded", "partial_refund"].includes(s))
    return "partially_refunded";
  if (["refunded", "returned"].includes(s)) return "refunded";
  if (["cancelled", "canceled", "void"].includes(s)) return "cancelled";
  if (["failed", "rejected", "declined"].includes(s)) return "failed";
  if (["expired"].includes(s)) return "expired";
  if (["reconciled"].includes(s)) return "reconciled";
  return "pending";
}

export function createInMemoryCommercialEventStore(
  seed: CommercialEventInput[] = []
): CommercialEventStore & { events: CommercialEventRecord[] } {
  const events = seed.map(normalizeCommercialEvent);
  return {
    events,
    async append(event) {
      if (event.idempotencyKey) {
        const existing = events.find(
          e => e.idempotencyKey === event.idempotencyKey
        );
        if (existing) return { ...existing, duplicate: true };
      }
      events.push(event);
      return event;
    },
    async findByIdempotencyKey(key) {
      return events.find(e => e.idempotencyKey === key) ?? null;
    },
    async timeline(filter) {
      return events
        .filter(event => matchesTimelineFilter(event, filter))
        .sort(compareCommercialEvents);
    },
  };
}

function compareCommercialEvents(
  a: CommercialEventRecord,
  b: CommercialEventRecord
) {
  const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  return a.eventId.localeCompare(b.eventId);
}

function matchesTimelineFilter(
  event: CommercialEventRecord,
  filter: CommercialTimelineFilter
) {
  if (
    filter.aggregateType &&
    event.aggregateType !== String(filter.aggregateType)
  )
    return false;
  if (
    filter.aggregateId != null &&
    event.aggregateId !== String(filter.aggregateId)
  )
    return false;
  return (
    [
      "orderId",
      "paymentId",
      "invoiceId",
      "saleId",
      "reservationId",
      "refundId",
    ] as const
  ).every(key => {
    const expected = filter[key];
    return expected == null || event[key] === String(expected);
  });
}

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
  await db.insert(commercialEvents).values({
    eventId: event.eventId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
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
  } as any);
  return event;
}

// Append a commercial event using an existing DB/transaction object (tx).
// This allows callers that are already within a transaction to persist the canonical
// commercial event inside the same transactional boundary. tx must implement the same
// query interface as the Drizzle DB client (select/insert/update)
export async function appendCommercialEventWithDb(
  db: any,
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
  await db.insert(commercialEvents).values({
    eventId: event.eventId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
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
  } as any);
  return event;
}

function fromDbEvent(row: any, duplicate = false): CommercialEventRecord {
  let payload: Record<string, unknown> = {};
  if (typeof row.eventPayload === "string" && row.eventPayload) {
    try {
      payload = JSON.parse(row.eventPayload);
    } catch {
      payload = { parseError: true };
    }
  } else if (row.eventPayload && typeof row.eventPayload === "object") {
    payload = row.eventPayload;
  }
  return {
    eventId: row.eventId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    eventVersion: Number(row.eventVersion ?? 1),
    actorType: row.actorType ?? "system",
    actorId: row.actorId ?? null,
    storeId: row.storeId ?? null,
    orderId: row.orderId ?? null,
    saleId: row.saleId ?? null,
    invoiceId: row.invoiceId ?? null,
    reservationId: row.reservationId ?? null,
    paymentId: row.paymentId ?? null,
    refundId: row.refundId ?? null,
    eventPayload: payload,
    occurredAt:
      row.occurredAt instanceof Date
        ? row.occurredAt
        : new Date(row.occurredAt),
    idempotencyKey: row.idempotencyKey ?? null,
    correlationId: row.correlationId ?? null,
    duplicate,
  };
}

async function getDatabaseTimeline(
  filter: CommercialTimelineFilter
): Promise<CommercialEventRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable for commercial timeline");
  const conditions: any[] = [];
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
  return rows.map((row: any) => fromDbEvent(row));
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
      const ref =
        typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value ?? "");
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
