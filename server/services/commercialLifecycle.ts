import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { commercialEvents } from "../../drizzle/schema";

export const commercialLifecycleConcepts = [
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

export const commercialLifecycleStates = [
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

export const commercialEventTypes = [
  "cart_created",
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
  "return_initiated",
  "return_completed",
  "credit_note_generated",
  "cancellation_completed",
  "reconciliation_completed",
] as const;

export type CommercialLifecycleConcept = (typeof commercialLifecycleConcepts)[number];
export type CommercialLifecycleState = (typeof commercialLifecycleStates)[number];
export type CommercialEventType = (typeof commercialEventTypes)[number];

export type CommercialAggregateType =
  | "cart"
  | "reservation"
  | "checkout"
  | "payment"
  | "order"
  | "sale"
  | "invoice"
  | "refund"
  | "return"
  | "credit_note"
  | "cancellation"
  | "reconciliation";

export type CommercialActorType = "customer" | "staff" | "system" | "provider" | "admin" | "auditor";

export type CommercialEventPayload = Record<string, unknown>;

export interface CommercialEvent {
  eventId: string;
  aggregateType: CommercialAggregateType;
  aggregateId: string;
  eventType: CommercialEventType;
  eventVersion: number;
  actorType: CommercialActorType;
  actorId?: string | null;
  storeId?: string | null;
  orderId?: string | null;
  saleId?: string | null;
  invoiceId?: string | null;
  reservationId?: string | null;
  paymentId?: string | null;
  refundId?: string | null;
  eventPayload: CommercialEventPayload;
  occurredAt: Date;
  idempotencyKey?: string | null;
  correlationId?: string | null;
}

export interface AppendCommercialEventInput extends Partial<Omit<CommercialEvent, "eventId" | "aggregateId" | "eventPayload" | "occurredAt" | "eventVersion">> {
  aggregateType: CommercialAggregateType;
  aggregateId: string | number;
  eventType: CommercialEventType;
  eventVersion?: number;
  actorType?: CommercialActorType;
  eventPayload?: CommercialEventPayload | null;
  occurredAt?: Date | string | number;
}

export interface CommercialEventStore {
  findByIdempotencyKey?(idempotencyKey: string): Promise<CommercialEvent | null>;
  insert(event: CommercialEvent): Promise<CommercialEvent>;
  list(filter: CommercialTimelineFilter): Promise<CommercialEvent[]>;
}

export interface CommercialTimelineFilter {
  aggregateType?: CommercialAggregateType;
  aggregateId?: string | number;
  orderId?: string | number;
  saleId?: string | number;
  invoiceId?: string | number;
  paymentId?: string | number;
  refundId?: string | number;
  reservationId?: string | number;
  correlationId?: string;
}

export interface CommercialLifecycleSummary {
  state: CommercialLifecycleState;
  paymentState: CommercialLifecycleState;
  orderState: CommercialLifecycleState;
  invoiceState: CommercialLifecycleState;
  reservationState: CommercialLifecycleState;
  refundState: CommercialLifecycleState;
  cancellationState: CommercialLifecycleState;
  reconciliationState: CommercialLifecycleState;
  paidAmountPaise: number;
  refundedAmountPaise: number;
  invoiceIds: string[];
  providerRefs: string[];
  anomalies: CommercialLifecycleAnomaly[];
  lastEventType?: CommercialEventType;
  eventCount: number;
}

export type CommercialLifecycleAnomalyCode =
  | "refund_exceeds_payment"
  | "invoice_without_successful_order"
  | "consumed_reservation_without_order_confirmation"
  | "payment_verified_without_sale_confirmation"
  | "duplicate_invoice_ref"
  | "duplicate_provider_ref"
  | "refund_without_payment"
  | "payment_without_order"
  | "orphan_invoice"
  | "duplicate_event_attempt";

export interface CommercialLifecycleAnomaly {
  code: CommercialLifecycleAnomalyCode;
  severity: "info" | "warning" | "critical";
  message: string;
  refs?: Record<string, string | number | string[] | number[] | null>;
}

const SENSITIVE_KEY_RE = /(secret|signature|token|password|authorization|api[_-]?key|card|cvv|otp|cookie|session)/i;

export function normalizeCommercialStatus(concept: CommercialLifecycleConcept, runtimeStatus: string | null | undefined): CommercialLifecycleState {
  const status = String(runtimeStatus ?? "").trim().toLowerCase();
  if (!status) return "pending";
  if (["draft", "created", "initiated", "pending_ocr"].includes(status)) return "initiated";
  if (["pending", "awaiting_prescription", "awaiting_pharmacist_review", "clarification_needed", "awaiting_allocation", "backorder_review", "picking", "packed", "assigned_to_rider", "out_for_delivery"].includes(status)) return "pending";
  if (["authorized", "reserved", "active", "approved"].includes(status)) return concept === "reservation" ? "authorized" : "confirmed";
  if (["confirmed", "paid", "delivered", "closed", "generated", "pdf_generated", "issued", "success", "consumed"].includes(status)) return "confirmed";
  if (["partially_refunded", "partially_returned"].includes(status)) return "partially_refunded";
  if (["refunded", "returned"].includes(status)) return "refunded";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (["failed", "rejected", "delivery_exception"].includes(status)) return "failed";
  if (["expired"].includes(status)) return "expired";
  if (["reconciled"].includes(status)) return "reconciled";
  return "pending";
}

export function safeCommercialPayload(payload: CommercialEventPayload | null | undefined): CommercialEventPayload {
  return redactValue(payload ?? {}) as CommercialEventPayload;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, SENSITIVE_KEY_RE.test(key) ? "[REDACTED]" : redactValue(child)]));
}

function stringifyRef(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function normalizeOccurredAt(value: Date | string | number | undefined): Date {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("commercial event occurredAt is invalid");
  return date;
}

export function createCommercialEvent(input: AppendCommercialEventInput): CommercialEvent {
  return {
    eventId: `cevt_${nanoid(24)}`,
    aggregateType: input.aggregateType,
    aggregateId: stringifyRef(input.aggregateId)!,
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? 1,
    actorType: input.actorType ?? "system",
    actorId: stringifyRef(input.actorId),
    storeId: stringifyRef(input.storeId),
    orderId: stringifyRef(input.orderId),
    saleId: stringifyRef(input.saleId),
    invoiceId: stringifyRef(input.invoiceId),
    reservationId: stringifyRef(input.reservationId),
    paymentId: stringifyRef(input.paymentId),
    refundId: stringifyRef(input.refundId),
    eventPayload: safeCommercialPayload(input.eventPayload),
    occurredAt: normalizeOccurredAt(input.occurredAt),
    idempotencyKey: stringifyRef(input.idempotencyKey),
    correlationId: stringifyRef(input.correlationId),
  };
}

export class InMemoryCommercialEventStore implements CommercialEventStore {
  private readonly events: CommercialEvent[] = [];

  async findByIdempotencyKey(idempotencyKey: string): Promise<CommercialEvent | null> {
    return this.events.find((event) => event.idempotencyKey === idempotencyKey) ?? null;
  }

  async insert(event: CommercialEvent): Promise<CommercialEvent> {
    if (this.events.some((existing) => existing.eventId === event.eventId)) throw new Error("commercial events are append-only; eventId already exists");
    if (event.idempotencyKey && this.events.some((existing) => existing.idempotencyKey === event.idempotencyKey)) {
      return this.events.find((existing) => existing.idempotencyKey === event.idempotencyKey)!;
    }
    this.events.push(Object.freeze({ ...event, eventPayload: Object.freeze({ ...event.eventPayload }) }));
    return this.events[this.events.length - 1];
  }

  async list(filter: CommercialTimelineFilter = {}): Promise<CommercialEvent[]> {
    return sortCommercialTimeline(this.events.filter((event) => matchesTimelineFilter(event, filter)));
  }
}

export function createDbCommercialEventStore(db: any): CommercialEventStore {
  return {
    async findByIdempotencyKey(idempotencyKey: string) {
      const [row] = await db.select().from(commercialEvents).where(eq(commercialEvents.idempotencyKey, idempotencyKey)).limit(1);
      return row ? rowToCommercialEvent(row) : null;
    },
    async insert(event: CommercialEvent) {
      try {
        await db.insert(commercialEvents).values(commercialEventToRow(event));
      } catch (error: any) {
        if (event.idempotencyKey && /duplicate|unique/i.test(String(error?.message ?? error))) {
          const existing = await this.findByIdempotencyKey?.(event.idempotencyKey);
          if (existing) return existing;
        }
        throw error;
      }
      return event;
    },
    async list(filter: CommercialTimelineFilter = {}) {
      const clauses = buildDbFilterClauses(filter);
      const rows = await db
        .select()
        .from(commercialEvents)
        .where(clauses.length ? and(...clauses) : undefined)
        .orderBy(asc(commercialEvents.occurredAt), asc(commercialEvents.eventId));
      return rows.map(rowToCommercialEvent);
    },
  };
}

function buildDbFilterClauses(filter: CommercialTimelineFilter) {
  const clauses = [] as any[];
  if (filter.aggregateType) clauses.push(eq(commercialEvents.aggregateType, filter.aggregateType));
  if (filter.aggregateId !== undefined) clauses.push(eq(commercialEvents.aggregateId, String(filter.aggregateId)));
  if (filter.orderId !== undefined) clauses.push(eq(commercialEvents.orderId, String(filter.orderId)));
  if (filter.saleId !== undefined) clauses.push(eq(commercialEvents.saleId, String(filter.saleId)));
  if (filter.invoiceId !== undefined) clauses.push(eq(commercialEvents.invoiceId, String(filter.invoiceId)));
  if (filter.paymentId !== undefined) clauses.push(eq(commercialEvents.paymentId, String(filter.paymentId)));
  if (filter.refundId !== undefined) clauses.push(eq(commercialEvents.refundId, String(filter.refundId)));
  if (filter.reservationId !== undefined) clauses.push(eq(commercialEvents.reservationId, String(filter.reservationId)));
  if (filter.correlationId) clauses.push(eq(commercialEvents.correlationId, filter.correlationId));
  return clauses;
}

export async function appendCommercialEvent(storeOrDb: CommercialEventStore | any, input: AppendCommercialEventInput): Promise<CommercialEvent> {
  const store = isCommercialEventStore(storeOrDb) ? storeOrDb : createDbCommercialEventStore(storeOrDb);
  if (input.idempotencyKey) {
    const existing = await store.findByIdempotencyKey?.(String(input.idempotencyKey));
    if (existing) return existing;
  }
  return store.insert(createCommercialEvent(input));
}

export async function appendCommercialEvents(storeOrDb: CommercialEventStore | any, inputs: AppendCommercialEventInput[]): Promise<CommercialEvent[]> {
  const appended: CommercialEvent[] = [];
  for (const input of inputs) appended.push(await appendCommercialEvent(storeOrDb, input));
  return appended;
}

function isCommercialEventStore(value: unknown): value is CommercialEventStore {
  return !!value && typeof (value as CommercialEventStore).insert === "function" && typeof (value as CommercialEventStore).list === "function";
}

export async function getCommercialTimeline(storeOrDb: CommercialEventStore | any, filter: CommercialTimelineFilter = {}): Promise<CommercialEvent[]> {
  const store = isCommercialEventStore(storeOrDb) ? storeOrDb : createDbCommercialEventStore(storeOrDb);
  return store.list(filter);
}

export const getCommercialTimelineByOrder = (storeOrDb: CommercialEventStore | any, orderId: string | number) => getCommercialTimeline(storeOrDb, { orderId });
export const getCommercialTimelineByPayment = (storeOrDb: CommercialEventStore | any, paymentId: string | number) => getCommercialTimeline(storeOrDb, { paymentId });
export const getCommercialTimelineByInvoice = (storeOrDb: CommercialEventStore | any, invoiceId: string | number) => getCommercialTimeline(storeOrDb, { invoiceId });

export async function getAggregateLifecycle(storeOrDb: CommercialEventStore | any, aggregateType: CommercialAggregateType, aggregateId: string | number) {
  return summarizeCommercialLifecycle(await getCommercialTimeline(storeOrDb, { aggregateType, aggregateId }));
}

export async function reconcileCommercialAggregate(storeOrDb: CommercialEventStore | any, filter: CommercialTimelineFilter) {
  return summarizeCommercialLifecycle(await getCommercialTimeline(storeOrDb, filter));
}

export const getCommercialLifecycleState = (events: CommercialEvent[]): CommercialLifecycleSummary => summarizeCommercialLifecycle(events);

export function summarizeCommercialLifecycle(events: CommercialEvent[]): CommercialLifecycleSummary {
  const timeline = sortCommercialTimeline(events);
  let paidAmountPaise = 0;
  let refundedAmountPaise = 0;
  let paymentState: CommercialLifecycleState = "pending";
  let orderState: CommercialLifecycleState = "pending";
  let invoiceState: CommercialLifecycleState = "pending";
  let reservationState: CommercialLifecycleState = "pending";
  let refundState: CommercialLifecycleState = "pending";
  let cancellationState: CommercialLifecycleState = "pending";
  let reconciliationState: CommercialLifecycleState = "pending";

  for (const event of timeline) {
    const amount = amountFromPayload(event.eventPayload);
    switch (event.eventType) {
      case "checkout_initiated":
      case "cart_created":
        orderState = "initiated";
        break;
      case "reservation_created":
        reservationState = "authorized";
        break;
      case "reservation_released":
      case "reservation_expired":
        reservationState = event.eventType === "reservation_expired" ? "expired" : "cancelled";
        break;
      case "reservation_consumed":
        reservationState = "confirmed";
        break;
      case "payment_authorized":
        paymentState = "authorized";
        break;
      case "payment_verified":
        paymentState = "confirmed";
        paidAmountPaise = Math.max(paidAmountPaise, amount);
        break;
      case "payment_failed":
        paymentState = "failed";
        break;
      case "order_confirmed":
        orderState = "confirmed";
        break;
      case "invoice_generated":
        invoiceState = "confirmed";
        break;
      case "refund_initiated":
        refundState = "pending";
        break;
      case "refund_completed":
        refundedAmountPaise += amount;
        refundState = paidAmountPaise > 0 && refundedAmountPaise >= paidAmountPaise ? "refunded" : "partially_refunded";
        break;
      case "credit_note_generated":
        refundState = refundState === "refunded" ? "refunded" : "partially_refunded";
        break;
      case "cancellation_completed":
        cancellationState = "cancelled";
        orderState = "cancelled";
        break;
      case "reconciliation_completed":
        reconciliationState = "reconciled";
        break;
    }
  }

  if (refundedAmountPaise > 0) {
    refundState = paidAmountPaise > 0 && refundedAmountPaise >= paidAmountPaise ? "refunded" : "partially_refunded";
  }
  if (timeline.some((event) => event.eventType === "reservation_expired")) {
    reservationState = "expired";
  }
  if (timeline.some((event) => event.eventType === "reservation_released")) {
    reservationState = "cancelled";
  }
  if (timeline.some((event) => event.eventType === "reservation_consumed") && !timeline.some((event) => event.eventType === "reservation_released" || event.eventType === "reservation_expired")) {
    reservationState = "confirmed";
  }

  const anomalies = detectCommercialImpossibleStates(timeline, { paidAmountPaise, refundedAmountPaise });
  const state = deriveOverallState({ paymentState, orderState, invoiceState, refundState, cancellationState, reconciliationState, paidAmountPaise, refundedAmountPaise });
  const invoiceIds = uniqueRefs(timeline, "invoiceId");
  const providerRefs = uniquePayloadRefs(timeline, ["providerRef", "gatewayPaymentId", "gatewayOrderId", "providerRefundId"]);

  return { state, paymentState, orderState, invoiceState, reservationState, refundState, cancellationState, reconciliationState, paidAmountPaise, refundedAmountPaise, invoiceIds, providerRefs, anomalies, lastEventType: timeline.at(-1)?.eventType, eventCount: timeline.length };
}

function deriveOverallState(input: Pick<CommercialLifecycleSummary, "paymentState" | "orderState" | "invoiceState" | "refundState" | "cancellationState" | "reconciliationState" | "paidAmountPaise" | "refundedAmountPaise">): CommercialLifecycleState {
  if (input.reconciliationState === "reconciled") return "reconciled";
  if (input.cancellationState === "cancelled") return "cancelled";
  if (input.refundState === "refunded") return "refunded";
  if (input.refundState === "partially_refunded") return "partially_refunded";
  if (input.paymentState === "failed") return "failed";
  if (input.orderState === "confirmed" || input.invoiceState === "confirmed") return "confirmed";
  if (input.paymentState === "authorized") return "authorized";
  return input.orderState === "initiated" ? "initiated" : "pending";
}

export function detectCommercialImpossibleStates(events: CommercialEvent[], totals?: { paidAmountPaise?: number; refundedAmountPaise?: number }): CommercialLifecycleAnomaly[] {
  const timeline = sortCommercialTimeline(events);
  const anomalies: CommercialLifecycleAnomaly[] = [];
  const has = (type: CommercialEventType) => timeline.some((event) => event.eventType === type);
  const paidAmountPaise = totals?.paidAmountPaise ?? Math.max(0, ...timeline.filter((event) => event.eventType === "payment_verified").map((event) => amountFromPayload(event.eventPayload)));
  const refundedAmountPaise = totals?.refundedAmountPaise ?? timeline.filter((event) => event.eventType === "refund_completed").reduce((sum, event) => sum + amountFromPayload(event.eventPayload), 0);

  if (refundedAmountPaise > paidAmountPaise) anomalies.push({ code: "refund_exceeds_payment", severity: "critical", message: "Refunded amount exceeds verified payment amount.", refs: { paidAmountPaise, refundedAmountPaise } });
  if (has("invoice_generated") && !has("order_confirmed")) anomalies.push({ code: "invoice_without_successful_order", severity: "critical", message: "Invoice exists without an order confirmation event." });
  if (has("reservation_consumed") && !has("order_confirmed")) anomalies.push({ code: "consumed_reservation_without_order_confirmation", severity: "critical", message: "Reservation was consumed without an order confirmation event." });
  if (has("payment_verified") && !has("order_confirmed")) anomalies.push({ code: "payment_verified_without_sale_confirmation", severity: "warning", message: "Payment is verified but no order/sale confirmation event is present." });
  if (has("refund_completed") && !has("payment_verified")) anomalies.push({ code: "refund_without_payment", severity: "critical", message: "Refund event exists without a verified payment event." });
  if (has("payment_verified") && !timeline.some((event) => event.orderId || event.saleId || event.eventType === "order_confirmed")) anomalies.push({ code: "payment_without_order", severity: "warning", message: "Payment event is not linked to an order or sale." });
  if (has("invoice_generated") && !timeline.some((event) => event.orderId || event.saleId)) anomalies.push({ code: "orphan_invoice", severity: "critical", message: "Invoice event is not linked to an order or sale." });

  anomalies.push(...duplicateRefAnomalies(timeline, "invoiceId", "duplicate_invoice_ref", "Duplicate invoice reference detected."));
  anomalies.push(...duplicatePayloadRefAnomalies(timeline, ["providerRef", "gatewayPaymentId", "gatewayOrderId", "providerRefundId"], "duplicate_provider_ref", "Duplicate provider reference detected."));
  anomalies.push(...duplicateIdempotencyAnomalies(timeline));
  return anomalies;
}

function amountFromPayload(payload: CommercialEventPayload): number {
  const value = payload.amountPaise ?? payload.paidAmountPaise ?? payload.refundAmountPaise ?? payload.totalPaise;
  const amount = typeof value === "string" ? Number(value) : typeof value === "number" ? value : 0;
  return Number.isFinite(amount) ? amount : 0;
}

function matchesTimelineFilter(event: CommercialEvent, filter: CommercialTimelineFilter): boolean {
  return Object.entries(filter).every(([key, value]) => value === undefined || String((event as any)[key]) === String(value));
}

export function sortCommercialTimeline(events: CommercialEvent[]): CommercialEvent[] {
  return [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.eventId.localeCompare(b.eventId));
}

function uniqueRefs(events: CommercialEvent[], key: keyof CommercialEvent): string[] {
  return Array.from(new Set(events.map((event) => stringifyRef(event[key] as string | number | null | undefined)).filter(Boolean) as string[]));
}

function uniquePayloadRefs(events: CommercialEvent[], keys: string[]): string[] {
  return Array.from(new Set(events.flatMap((event) => keys.map((key) => stringifyRef(event.eventPayload[key] as string | number | null | undefined))).filter(Boolean) as string[]));
}

function duplicateRefAnomalies(events: CommercialEvent[], key: keyof CommercialEvent, code: CommercialLifecycleAnomalyCode, message: string): CommercialLifecycleAnomaly[] {
  return duplicates(events.map((event) => stringifyRef(event[key] as string | number | null | undefined))).map((ref) => ({ code, severity: "warning", message, refs: { [key]: ref } }));
}

function duplicatePayloadRefAnomalies(events: CommercialEvent[], keys: string[], code: CommercialLifecycleAnomalyCode, message: string): CommercialLifecycleAnomaly[] {
  return keys.flatMap((key) => duplicates(events.map((event) => stringifyRef(event.eventPayload[key] as string | number | null | undefined))).map((ref) => ({ code, severity: "warning" as const, message, refs: { [key]: ref } })));
}

function duplicateIdempotencyAnomalies(events: CommercialEvent[]): CommercialLifecycleAnomaly[] {
  return duplicates(events.map((event) => event.idempotencyKey)).map((key) => ({ code: "duplicate_event_attempt", severity: "info", message: "Duplicate event idempotency key observed in the event stream.", refs: { idempotencyKey: key } }));
}

function duplicates(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return Array.from(dupes);
}

function commercialEventToRow(event: CommercialEvent) {
  return {
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
    eventPayload: event.eventPayload,
    occurredAt: event.occurredAt,
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
  };
}

function rowToCommercialEvent(row: any): CommercialEvent {
  return {
    eventId: row.eventId,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    eventType: row.eventType,
    eventVersion: Number(row.eventVersion ?? 1),
    actorType: row.actorType,
    actorId: row.actorId,
    storeId: row.storeId,
    orderId: row.orderId,
    saleId: row.saleId,
    invoiceId: row.invoiceId,
    reservationId: row.reservationId,
    paymentId: row.paymentId,
    refundId: row.refundId,
    eventPayload: safeCommercialPayload(typeof row.eventPayload === "string" ? JSON.parse(row.eventPayload) : row.eventPayload),
    occurredAt: row.occurredAt instanceof Date ? row.occurredAt : new Date(row.occurredAt),
    idempotencyKey: row.idempotencyKey,
    correlationId: row.correlationId,
  };
}
