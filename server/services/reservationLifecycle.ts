import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";
import { appendCommercialEventBestEffort } from "./commercialLifecycle";
import {
  assertAvailableForReservation as assertCanonicalAvailableForReservation,
  getCanonicalAvailability,
} from "./reservationService";

export const RESERVATION_STATUSES = ["active", "consumed", "released", "expired", "cancelled", "failed"] as const;
export type ReservationStatus = typeof RESERVATION_STATUSES[number];
export type TerminalReservationStatus = Exclude<ReservationStatus, "active">;

export type ReservationLifecycleReason =
  | "manual_release"
  | "reservation_expired"
  | "payment_failed"
  | "payment_cancelled"
  | "payment_expired"
  | "rx_rejected"
  | "order_cancelled"
  | "checkout_failed"
  | "fulfillment_completed"
  | "reservation_failed"
  | string;

type CtxLike = { user?: { id?: number; role?: string | null }; requestId?: string; req?: { headers?: Record<string, string | string[] | undefined>; ip?: string }; session?: { id?: string } };

export interface ReservationIdentity {
  id?: number | null;
  orderId?: number | null;
  cartId?: number | null;
  storeId?: number | null;
  productId?: number | null;
  variantId?: number | null;
  skuId?: number | null;
}

export interface CreateReservationInput extends Required<Pick<ReservationIdentity, "storeId" | "productId">> {
  storeId: number;
  productId: number;
  variantId?: number | null;
  skuId?: number | null;
  batchId?: number | null;
  orderId?: number | null;
  cartId?: number | null;
  qty: number;
  expiresAt?: Date | null;
  idempotencyKey?: string | null;
  correlationId?: string | null;
  ctx?: CtxLike;
}

export interface ReservationMutationInput extends ReservationIdentity {
  releaseReason?: ReservationLifecycleReason | null;
  idempotencyKey?: string | null;
  correlationId?: string | null;
  ctx?: CtxLike;
}

export interface ReservationMutationResult {
  ok: boolean;
  status: ReservationStatus;
  idempotent: boolean;
  reservationId: number | null;
  releaseReason?: string | null;
  reason?: string;
}

async function requireDb() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function requirePositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${field} must be a positive integer` });
  }
}

function requireIdentity(input: ReservationIdentity) {
  if (input.id || input.orderId || input.cartId) return;
  throw new TRPCError({ code: "BAD_REQUEST", message: "Reservation mutation requires id, orderId, or cartId" });
}

function variantPredicate(table: any, variantId?: number | null) {
  return variantId == null ? sql`${table.variantId} IS NULL` : eq(table.variantId, variantId);
}

function buildIdentityPredicates(table: any, input: ReservationIdentity, includeProductScope = false) {
  const predicates = [];
  if (input.id) predicates.push(eq(table.id, input.id));
  if (input.orderId) predicates.push(eq(table.orderId, input.orderId));
  if (input.cartId) predicates.push(eq(table.cartId, input.cartId));
  if (includeProductScope) {
    if (input.storeId) predicates.push(eq(table.storeId, input.storeId));
    if (input.productId) predicates.push(eq(table.productId, input.productId));
    if (input.variantId !== undefined) predicates.push(variantPredicate(table, input.variantId));
    if (input.skuId) predicates.push(eq(table.skuId, input.skuId));
  }
  return predicates;
}

export function assertReservationTransition(current: ReservationStatus, next: ReservationStatus) {
  if (current === next) return { allowed: true, idempotent: true };
  if (current === "active" && next !== "active") return { allowed: true, idempotent: false };
  return { allowed: false, idempotent: false, reason: `Invalid reservation transition ${current} -> ${next}` };
}

function eventTypeForStatus(status: ReservationStatus) {
  if (status === "active") return "reservation_created";
  if (status === "consumed") return "reservation_consumed";
  if (status === "expired") return "reservation_expired";
  if (status === "cancelled") return "reservation_cancelled";
  if (status === "failed") return "reservation_failed";
  return "reservation_released";
}

async function auditReservation(input: {
  action: string;
  reservation: any;
  before?: unknown;
  after: unknown;
  reason?: string | null;
  ctx?: CtxLike;
  idempotencyKey?: string | null;
  correlationId?: string | null;
}) {
  const reservationId = typeof input.reservation?.id === "number" ? input.reservation.id : null;
  await logAudit({
    action: input.action,
    entityType: "stock_reservation",
    entityId: reservationId,
    entityRef: reservationId == null ? String(input.reservation?.orderId ?? input.reservation?.cartId ?? "reservation") : null,
    storeId: input.reservation?.storeId ?? null,
    beforeJson: input.before,
    afterJson: input.after,
    reason: input.reason ?? undefined,
  }, input.ctx);

  await appendCommercialEventBestEffort({
    aggregateType: "reservation",
    aggregateId: reservationId ?? input.reservation?.orderId ?? input.reservation?.cartId ?? `${input.reservation?.storeId}:${input.reservation?.productId}`,
    eventType: eventTypeForStatus(input.reservation?.status ?? "active"),
    actorType: input.ctx?.user ? "staff" : "system",
    actorId: input.ctx?.user?.id ?? null,
    storeId: input.reservation?.storeId ?? null,
    orderId: input.reservation?.orderId ?? null,
    reservationId,
    eventPayload: input.after as Record<string, unknown>,
    idempotencyKey: input.idempotencyKey ?? `reservation:${reservationId ?? input.reservation?.orderId ?? input.reservation?.cartId}:${input.action}`,
    correlationId: input.correlationId ?? input.ctx?.requestId ?? null,
  });
}

export async function assertAvailableForReservation(input: { storeId: number; productId: number; variantId?: number | null; qty: number }) {
  requirePositiveInteger(input.storeId, "storeId");
  requirePositiveInteger(input.productId, "productId");
  requirePositiveInteger(input.qty, "qty");
  return assertCanonicalAvailableForReservation(input);
}

export async function createReservation(input: CreateReservationInput) {
  requirePositiveInteger(input.storeId, "storeId");
  requirePositiveInteger(input.productId, "productId");
  requirePositiveInteger(input.qty, "qty");
  if (input.orderId != null) requirePositiveInteger(input.orderId, "orderId");
  if (input.cartId != null) requirePositiveInteger(input.cartId, "cartId");
  if (input.idempotencyKey === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Reservation idempotencyKey cannot be null when supplied" });

  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000);

  const duplicatePredicates = [
    eq(stockReservations.status, "active" as const),
    eq(stockReservations.storeId, input.storeId),
    eq(stockReservations.productId, input.productId),
    variantPredicate(stockReservations, input.variantId),
  ];
  if (input.orderId) duplicatePredicates.push(eq(stockReservations.orderId, input.orderId));
  if (input.cartId) duplicatePredicates.push(eq(stockReservations.cartId, input.cartId));
  if (input.skuId) duplicatePredicates.push(eq(stockReservations.skuId, input.skuId));
  if (input.orderId || input.cartId) {
    const [existing] = await db.select().from(stockReservations).where(and(...duplicatePredicates)).limit(1);
    if (existing) {
      await auditReservation({ action: "reservation.create_idempotent", reservation: existing, after: { status: existing.status, idempotent: true }, ctx: input.ctx, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
      return { ok: true, id: existing.id, reservation: existing, status: existing.status as ReservationStatus, expiresAt: existing.expiresAt, idempotent: true };
    }
  }

  const availability = await assertAvailableForReservation(input);
  const [row] = await db.insert(stockReservations).values({
    batchId: input.batchId ?? null,
    orderId: input.orderId ?? null,
    cartId: input.cartId ?? null,
    productId: input.productId,
    variantId: input.variantId ?? null,
    skuId: input.skuId ?? null,
    storeId: input.storeId,
    qty: input.qty,
    qtyReserved: input.qty,
    status: "active",
    expiresAt,
  });
  const reservationId = (row as { insertId?: number })?.insertId ?? null;
  const [reservation] = reservationId
    ? await db.select().from(stockReservations).where(eq(stockReservations.id, reservationId)).limit(1)
    : await db.select().from(stockReservations).where(and(...duplicatePredicates)).limit(1);
  if (!reservation) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reservation insert did not return a durable row" });

  await auditReservation({
    action: "reservation.created",
    reservation,
    after: { reservationId: reservation.id, status: "active", qty: input.qty, expiresAt, availabilityBeforeCreate: availability },
    ctx: input.ctx,
    idempotencyKey: input.idempotencyKey ?? `reservation:${reservation.id}:created`,
    correlationId: input.correlationId,
  });
  return { ok: true, id: reservation.id, reservation, status: "active" as ReservationStatus, expiresAt, idempotent: false };
}

async function transitionReservation(input: ReservationMutationInput, nextStatus: TerminalReservationStatus, defaultReason: string): Promise<ReservationMutationResult> {
  requireIdentity(input);
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const predicates = buildIdentityPredicates(stockReservations, input, true);
  const [reservation] = await db.select().from(stockReservations).where(and(...predicates)).limit(1);
  if (!reservation) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Reservation not found for lifecycle transition" });
  }

  const currentStatus = reservation.status as ReservationStatus;
  const transition = assertReservationTransition(currentStatus, nextStatus);
  if (!transition.allowed) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: transition.reason });
  }
  const releaseReason = input.releaseReason ?? defaultReason;
  if (transition.idempotent) {
    await auditReservation({ action: `reservation.${nextStatus}.idempotent`, reservation, before: reservation, after: { status: currentStatus, releaseReason, idempotent: true }, reason: releaseReason, ctx: input.ctx, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
    return { ok: true, status: currentStatus, idempotent: true, reservationId: reservation.id, releaseReason };
  }

  const patch: Record<string, unknown> = { status: nextStatus, releaseReason };
  if (nextStatus === "consumed") patch.fulfilledAt = new Date();
  if (nextStatus === "cancelled") patch.cancelledAt = new Date();
  await db.update(stockReservations).set(patch).where(eq(stockReservations.id, reservation.id));
  const [updated] = await db.select().from(stockReservations).where(eq(stockReservations.id, reservation.id)).limit(1);
  await auditReservation({ action: `reservation.${nextStatus}`, reservation: updated ?? { ...reservation, ...patch }, before: reservation, after: updated ?? patch, reason: releaseReason, ctx: input.ctx, idempotencyKey: input.idempotencyKey, correlationId: input.correlationId });
  return { ok: true, status: nextStatus, idempotent: false, reservationId: reservation.id, releaseReason };
}

export function consumeReservation(input: ReservationMutationInput) { return transitionReservation(input, "consumed", input.releaseReason ?? "fulfillment_completed"); }
export function releaseReservation(input: ReservationMutationInput) { return transitionReservation(input, "released", input.releaseReason ?? "manual_release"); }
export function expireReservation(input: ReservationMutationInput) { return transitionReservation(input, "expired", input.releaseReason ?? "reservation_expired"); }
export function cancelReservation(input: ReservationMutationInput) { return transitionReservation(input, "cancelled", input.releaseReason ?? "order_cancelled"); }
export function failReservation(input: ReservationMutationInput) { return transitionReservation(input, "failed", input.releaseReason ?? "reservation_failed"); }

export async function getReservationStatus(input: ReservationIdentity = {}) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const predicates = buildIdentityPredicates(stockReservations, input, true);
  const rows = await db.select().from(stockReservations).where(predicates.length ? and(...predicates) : ne(stockReservations.status, "consumed" as const));
  return rows;
}

export async function reconcileExpiredReservations(now = new Date(), scope: Pick<ReservationIdentity, "storeId" | "productId" | "variantId" | "skuId"> = {}) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const predicates = [eq(stockReservations.status, "active" as const), lt(stockReservations.expiresAt, now)];
  if (scope.storeId) predicates.push(eq(stockReservations.storeId, scope.storeId));
  if (scope.productId) predicates.push(eq(stockReservations.productId, scope.productId));
  if (scope.variantId !== undefined) predicates.push(variantPredicate(stockReservations, scope.variantId));
  if (scope.skuId) predicates.push(eq(stockReservations.skuId, scope.skuId));
  const rows = await db.select().from(stockReservations).where(and(...predicates));
  const results: ReservationMutationResult[] = [];
  for (const row of rows) {
    results.push(await expireReservation({ id: row.id, releaseReason: "reservation_expired" }));
  }
  return { ok: true, expiredCount: results.filter((r) => !r.idempotent).length, inspectedCount: rows.length, results };
}

export async function getReservationAuditSummary(input: ReservationIdentity) {
  requireIdentity(input);
  const rows = await getReservationStatus(input);
  const active = rows.filter((r: any) => r.status === "active");
  const terminal = rows.filter((r: any) => r.status !== "active");
  const availabilityByLine = await Promise.all(rows.map(async (r: any) => ({
    reservationId: r.id,
    status: r.status,
    qty: r.qty ?? r.qtyReserved,
    availability: await getCanonicalAvailability(r.storeId, r.productId, r.variantId),
  })));
  return { reservationCount: rows.length, activeCount: active.length, terminalCount: terminal.length, rows, availabilityByLine };
}

export async function assertOrderHasActiveReservations(orderId: number) {
  requirePositiveInteger(orderId, "orderId");
  const rows = await getReservationStatus({ orderId });
  const active = rows.filter((r: any) => r.status === "active");
  if (!active.length) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Order has no active stock reservation" });
  }
  return { ok: true, activeReservations: active };
}
