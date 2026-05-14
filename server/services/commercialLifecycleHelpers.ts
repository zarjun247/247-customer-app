import { randomUUID } from "node:crypto";

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
export type CommercialEventType = string;
export type CommercialAggregateType = string;
export type CommercialEventActorType = string;

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

function asRef(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return JSON.stringify(value);
  const prim = value as string | number | boolean | bigint;
  return String(prim);
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

export function compareCommercialEvents(
  a: CommercialEventRecord,
  b: CommercialEventRecord
) {
  const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  return a.eventId.localeCompare(b.eventId);
}

export function matchesTimelineFilter(
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

export function createInMemoryCommercialEventStore(
  seed: CommercialEventInput[] = []
): CommercialEventStore & { events: CommercialEventRecord[] } {
  const events = seed.map(normalizeCommercialEvent);
  return {
    events,
    append(event) {
      if (event.idempotencyKey) {
        const existing = events.find(
          e => e.idempotencyKey === event.idempotencyKey
        );
        if (existing) return Promise.resolve({ ...existing, duplicate: true });
      }
      events.push(event);
      return Promise.resolve(event);
    },
    findByIdempotencyKey(key) {
      return Promise.resolve(
        events.find(e => e.idempotencyKey === key) ?? null
      );
    },
    timeline(filter) {
      return Promise.resolve(
        events
          .filter(event => matchesTimelineFilter(event, filter))
          .sort(compareCommercialEvents)
      );
    },
  };
}
