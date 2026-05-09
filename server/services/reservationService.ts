import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";
import { appendCommercialEventBestEffort } from "./commercialLifecycle";

const ACTIVE_RESERVATION_STATUS = "active" as const;
const TERMINAL_RESERVATION_STATUSES = ["released", "expired", "consumed", "cancelled", "failed"] as const;
type ReservationReleaseStatus = typeof TERMINAL_RESERVATION_STATUSES[number];

export function computeAvailableQty(input: {
  onHandQty: number;
  reservedQty?: number;
  softLockedQty?: number;
  quarantinedQty?: number;
  expiredQty?: number;
}) {
  return input.onHandQty - (input.reservedQty ?? 0) - (input.softLockedQty ?? 0) - (input.quarantinedQty ?? 0) - (input.expiredQty ?? 0);
}

export function explainAvailability(input: any) {
  const available = computeAvailableQty(input);
  return {
    ...input,
    availableQty: Math.max(0, available),
    rawAvailableQty: available,
    formula: "availableQty = onHandQty - reservedQty - softLockedQty - quarantinedQty - expiredQty",
  };
}

async function requireDb() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function variantFilter(table: any, variantId?: number | null) {
  return variantId == null ? sql`1=1` : eq(table.variantId, variantId);
}

export async function getCanonicalStockAggregate(storeId: number, productId: number, variantId?: number | null) {
  const db = await requireDb();
  const { batchLedger, stockReservations, storeSkus } = await import("../../drizzle/schema");
  const now = new Date();
  const [sku] = await db
    .select()
    .from(storeSkus)
    .where(and(eq(storeSkus.storeId, storeId), eq(storeSkus.productId, productId), variantFilter(storeSkus, variantId)))
    .limit(1);
  const [batchAgg] = await db
    .select({
      onHand: sql<number>`COALESCE(SUM(${batchLedger.qtyOnHand}), 0)`,
      batchReserved: sql<number>`COALESCE(SUM(${batchLedger.qtyReserved}), 0)`,
      quarantined: sql<number>`COALESCE(SUM(${batchLedger.qtyQuarantined}), 0)`,
      expired: sql<number>`COALESCE(SUM(${batchLedger.qtyExpired}), 0)`,
    })
    .from(batchLedger)
    .where(and(
      eq(batchLedger.storeId, storeId),
      eq(batchLedger.productId, productId),
      variantFilter(batchLedger, variantId),
      eq(batchLedger.status, "active"),
    ));
  const [reservationAgg] = await db
    .select({ reserved: sql<number>`COALESCE(SUM(COALESCE(${stockReservations.qty}, ${stockReservations.qtyReserved})), 0)` })
    .from(stockReservations)
    .where(and(
      eq(stockReservations.storeId, storeId),
      eq(stockReservations.productId, productId),
      variantFilter(stockReservations, variantId),
      eq(stockReservations.status, ACTIVE_RESERVATION_STATUS),
      or(sql`${stockReservations.expiresAt} IS NULL`, sql`${stockReservations.expiresAt} > ${now}`)!,
    ));

  return {
    onHandQty: Number(batchAgg?.onHand ?? sku?.stockQty ?? 0),
    reservedQty: Number(batchAgg?.batchReserved ?? 0) + Number(reservationAgg?.reserved ?? 0),
    softLockedQty: Number(sku?.softLockedQty ?? 0),
    quarantinedQty: Number(batchAgg?.quarantined ?? 0),
    expiredQty: Number(batchAgg?.expired ?? 0),
  };
}

export async function syncStoreSkuAggregate(input: { storeId: number; productId: number; variantId?: number | null }) {
  const db = await requireDb();
  const { storeSkus } = await import("../../drizzle/schema");
  const aggregate = await getCanonicalStockAggregate(input.storeId, input.productId, input.variantId);
  const [sku] = await db
    .select()
    .from(storeSkus)
    .where(and(eq(storeSkus.storeId, input.storeId), eq(storeSkus.productId, input.productId), variantFilter(storeSkus, input.variantId)))
    .limit(1);
  if (!sku) return { synced: false, aggregate };
  await db.update(storeSkus).set({ stockQty: aggregate.onHandQty }).where(eq(storeSkus.id, sku.id));
  return { synced: true, skuId: sku.id, aggregate };
}

export async function getCanonicalAvailability(storeId: number, productId: number, variantId?: number | null) {
  return explainAvailability(await getCanonicalStockAggregate(storeId, productId, variantId));
}

export async function assertAvailableForReservation(input: { storeId: number; productId: number; variantId?: number | null; qty: number }) {
  const c = await getCanonicalAvailability(input.storeId, input.productId, input.variantId);
  if (c.availableQty < input.qty) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Insufficient available stock after reservations" });
  return c;
}

export async function reserveStockForOrder(input: any) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  await assertAvailableForReservation(input);
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000);
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
    status: ACTIVE_RESERVATION_STATUS,
    expiresAt,
  });
  const reservationId = (row as any)?.insertId;
  await logAudit({ action: "reservation.created", entityType: "stock_reservation", entityId: reservationId ?? null, entityRef: reservationId ? null : String(input.orderId ?? input.cartId ?? `${input.storeId}:${input.productId}`), afterJson: { ...input, expiresAt } }, input.ctx);
  await appendCommercialEventBestEffort({
    aggregateType: "reservation",
    aggregateId: reservationId ?? input.orderId ?? input.cartId ?? `${input.storeId}:${input.productId}`,
    eventType: "reservation_created",
    actorType: input.ctx?.user ? "staff" : "system",
    actorId: input.ctx?.user?.id ?? null,
    storeId: input.storeId,
    orderId: input.orderId ?? null,
    reservationId,
    eventPayload: { productId: input.productId, variantId: input.variantId ?? null, skuId: input.skuId ?? null, qty: input.qty, expiresAt },
    idempotencyKey: input.idempotencyKey ?? (reservationId ? `reservation:${reservationId}:created` : null),
    correlationId: input.correlationId ?? input.ctx?.requestId ?? null,
  });
  return { id: reservationId, status: ACTIVE_RESERVATION_STATUS, expiresAt, ...input };
}

async function updateReservationStatus(input: any, status: ReservationReleaseStatus, defaultReason: string) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const releaseReason = input.releaseReason ?? defaultReason;
  const conds = [eq(stockReservations.status, ACTIVE_RESERVATION_STATUS)];
  if (input.id) conds.push(eq(stockReservations.id, input.id));
  if (input.orderId) conds.push(eq(stockReservations.orderId, input.orderId));
  if (input.cartId) conds.push(eq(stockReservations.cartId, input.cartId));
  if (input.storeId) conds.push(eq(stockReservations.storeId, input.storeId));
  if (input.productId) conds.push(eq(stockReservations.productId, input.productId));
  await db.update(stockReservations).set({ status, releaseReason }).where(and(...conds));
  await logAudit({ action: `reservation.${status}`, entityType: "stock_reservation", entityId: typeof input.id === "number" ? input.id : null, entityRef: input.id ? null : String(input.orderId ?? input.cartId ?? "reservation"), afterJson: { ...input, status, releaseReason } }, input.ctx);
  const eventType = status === "consumed" ? "reservation_consumed" : status === "expired" ? "reservation_expired" : status === "cancelled" ? "reservation_cancelled" : status === "failed" ? "reservation_failed" : "reservation_released";
  await appendCommercialEventBestEffort({
    aggregateType: "reservation",
    aggregateId: input.id ?? input.orderId ?? input.cartId ?? "unknown",
    eventType,
    actorType: input.ctx?.user ? "staff" : "system",
    actorId: input.ctx?.user?.id ?? null,
    storeId: input.storeId ?? null,
    orderId: input.orderId ?? null,
    reservationId: input.id ?? null,
    eventPayload: { status, releaseReason },
    idempotencyKey: input.idempotencyKey ?? `${eventType}:${input.id ?? input.orderId ?? input.cartId ?? "unknown"}`,
    correlationId: input.correlationId ?? input.ctx?.requestId ?? null,
  });
  return { status, releaseReason };
}

export function releaseReservation(input: any) { return updateReservationStatus(input, "released", input.releaseReason ?? "manual_release"); }
export function expireReservation(input: any) { return updateReservationStatus(input, "expired", input.releaseReason ?? "reservation_expired"); }
export function releaseReservationOnPaymentFailure(input: any) { return updateReservationStatus(input, "failed", input.releaseReason ?? "payment_failed"); }
export function releaseReservationOnRxReject(input: any) { return updateReservationStatus(input, "released", input.releaseReason ?? "rx_rejected"); }
export function releaseReservationOnOrderCancel(input: any) { return updateReservationStatus(input, "cancelled", input.releaseReason ?? "order_cancelled"); }

export async function expireStaleReservations(now = new Date()) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  await db.update(stockReservations).set({ status: "expired", releaseReason: "expiresAt elapsed" }).where(and(eq(stockReservations.status, ACTIVE_RESERVATION_STATUS), lt(stockReservations.expiresAt, now)));
  return { status: "expired" };
}

export async function getReservationStatus(input: any) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const conds = [];
  if (input.id) conds.push(eq(stockReservations.id, input.id));
  if (input.orderId) conds.push(eq(stockReservations.orderId, input.orderId));
  if (input.cartId) conds.push(eq(stockReservations.cartId, input.cartId));
  const rows = await db.select().from(stockReservations).where(conds.length ? and(...conds) : ne(stockReservations.status, "consumed"));
  return rows;
}

export async function syncStoreSkuSoftLocks(input?: { storeId?: number; productId?: number; variantId?: number | null }) {
  const db = await requireDb();
  const { storeSkus } = await import("../../drizzle/schema");
  const conds = [];
  if (input?.storeId) conds.push(eq(storeSkus.storeId, input.storeId));
  if (input?.productId) conds.push(eq(storeSkus.productId, input.productId));
  if (input?.variantId != null) conds.push(eq(storeSkus.variantId, input.variantId));
  await db.update(storeSkus).set({ softLockedQty: 0 }).where(conds.length ? and(...conds) : sql`1=1`);
  return { synced: true, note: "Soft locks reconciled; durable stock_reservations are canonical." };
}
