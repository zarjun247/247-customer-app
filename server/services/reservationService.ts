import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";
import { buildIdempotencyKey, createMutationFingerprint, withIdempotency } from "./idempotencyService";

export const ACTIVE_RESERVATION_STATUS = "active" as const;
export const RESERVATION_STATUSES = ["active", "consumed", "released", "expired", "cancelled", "failed"] as const;
export const TERMINAL_RESERVATION_STATUSES = ["consumed", "released", "expired", "cancelled", "failed"] as const;
export type ReservationStatus = typeof RESERVATION_STATUSES[number];
type ReservationTerminalStatus = typeof TERMINAL_RESERVATION_STATUSES[number];

type ReservationScope = {
  storeId: number;
  productId: number;
  variantId?: number | null;
  batchId?: number | null;
  skuId?: number | null;
};

type ReservationMutationInput = ReservationScope & {
  qty: number;
  orderId?: number | null;
  cartId?: number | null;
  saleId?: string | number | null;
  expiresAt?: Date | null;
  idempotencyKey?: string | null;
  ctx?: any;
};

type ReservationSelector = Partial<ReservationScope> & {
  id?: number | null;
  orderId?: number | null;
  cartId?: number | null;
  saleId?: string | number | null;
  releaseReason?: string | null;
  idempotencyKey?: string | null;
  ctx?: any;
};

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
    formula: "availableQty = onHandQty - activeReservedQty - softLockedQty - quarantinedQty - expiredQty",
  };
}

async function requireDb() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function scopedDb(dbOrTx?: any) {
  return dbOrTx ?? requireDb();
}

function variantFilter(table: any, variantId?: number | null) {
  return variantId == null ? sql`1=1` : eq(table.variantId, variantId);
}

function batchFilter(table: any, batchId?: number | null) {
  return batchId == null ? sql`1=1` : eq(table.batchId, batchId);
}

function positiveQty(qty: number) {
  if (!Number.isInteger(qty) || qty <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Reservation quantity must be a positive integer" });
  return qty;
}

function jsonRef(input: { saleId?: string | number | null }) {
  return input.saleId == null ? null : JSON.stringify({ saleId: String(input.saleId) });
}

function saleRefFilter(table: any, saleId?: string | number | null) {
  if (saleId == null) return sql`1=1`;
  return sql`JSON_UNQUOTE(JSON_EXTRACT(${table.reservationMeta}, '$.saleId')) = ${String(saleId)}`;
}

function reservationQtyExpr(stockReservations: any) {
  return sql<number>`COALESCE(${stockReservations.qty}, ${stockReservations.qtyReserved}, 0)`;
}

function updateRowCount(result: any) {
  const r = Array.isArray(result) ? result[0] : result;
  return Number(r?.affectedRows ?? r?.changedRows ?? r?.rowCount ?? 0);
}

async function runSerializable<T>(db: any, fn: (tx: any) => Promise<T>) {
  if (typeof db.transaction !== "function") return fn(db);
  return db.transaction(async (tx: any) => {
    await tx.execute?.(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    return fn(tx);
  });
}

async function getCanonicalStockAggregateWithDb(db: any, scope: ReservationScope, now = new Date()) {
  const { batchLedger, stockReservations, storeSkus } = await import("../../drizzle/schema");
  const [sku] = await db
    .select()
    .from(storeSkus)
    .where(and(eq(storeSkus.storeId, scope.storeId), eq(storeSkus.productId, scope.productId), variantFilter(storeSkus, scope.variantId)))
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
      eq(batchLedger.storeId, scope.storeId),
      eq(batchLedger.productId, scope.productId),
      variantFilter(batchLedger, scope.variantId),
      scope.batchId == null ? sql`1=1` : eq(batchLedger.id, scope.batchId),
      eq(batchLedger.status, "active"),
    ));
  const [reservationAgg] = await db
    .select({ reserved: sql<number>`COALESCE(SUM(${reservationQtyExpr(stockReservations)}), 0)` })
    .from(stockReservations)
    .where(and(
      eq(stockReservations.storeId, scope.storeId),
      eq(stockReservations.productId, scope.productId),
      variantFilter(stockReservations, scope.variantId),
      batchFilter(stockReservations, scope.batchId),
      eq(stockReservations.status, ACTIVE_RESERVATION_STATUS),
      or(isNull(stockReservations.expiresAt), gt(stockReservations.expiresAt, now))!,
    ));

  const onHand = Number(batchAgg?.onHand ?? 0);
  return {
    onHandQty: onHand || Number(sku?.stockQty ?? 0),
    reservedQty: Number(batchAgg?.batchReserved ?? 0) + Number(reservationAgg?.reserved ?? 0),
    activeReservedQty: Number(reservationAgg?.reserved ?? 0),
    legacyBatchReservedQty: Number(batchAgg?.batchReserved ?? 0),
    softLockedQty: Number(sku?.softLockedQty ?? 0),
    quarantinedQty: Number(batchAgg?.quarantined ?? 0),
    expiredQty: Number(batchAgg?.expired ?? 0),
  };
}

export async function getCanonicalStockAggregate(storeId: number, productId: number, variantId?: number | null, batchId?: number | null) {
  const db = await requireDb();
  return getCanonicalStockAggregateWithDb(db, { storeId, productId, variantId, batchId });
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

export async function getCanonicalAvailability(storeId: number, productId: number, variantId?: number | null, batchId?: number | null) {
  return explainAvailability(await getCanonicalStockAggregate(storeId, productId, variantId, batchId));
}

export function getAvailableQty(storeId: number, productId: number, variantId?: number | null, batchId?: number | null) { return getCanonicalAvailability(storeId, productId, variantId, batchId); }

export async function getReservedQty(input: ReservationScope & { includeExpiredActive?: boolean }) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const conds: any[] = [
    eq(stockReservations.storeId, input.storeId),
    eq(stockReservations.productId, input.productId),
    variantFilter(stockReservations, input.variantId),
    batchFilter(stockReservations, input.batchId),
    eq(stockReservations.status, ACTIVE_RESERVATION_STATUS),
  ];
  if (!input.includeExpiredActive) conds.push(or(isNull(stockReservations.expiresAt), gt(stockReservations.expiresAt, new Date()))!);
  const [row] = await db.select({ reservedQty: sql<number>`COALESCE(SUM(${reservationQtyExpr(stockReservations)}), 0)` }).from(stockReservations).where(and(...conds));
  return Number(row?.reservedQty ?? 0);
}

export async function assertAvailableForReservation(input: ReservationScope & { qty: number }, dbOrTx?: any) {
  const db = await scopedDb(dbOrTx);
  const c = explainAvailability(await getCanonicalStockAggregateWithDb(db, input));
  if (c.availableQty < input.qty) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Insufficient available stock after reservations" });
  return c;
}

export async function createReservation(input: ReservationMutationInput) {
  positiveQty(input.qty);
  const idemKey = input.idempotencyKey ?? buildIdempotencyKey(["reservation", "create", input.orderId ?? "cart", input.cartId ?? "none", input.storeId, input.productId, input.variantId ?? "base", input.batchId ?? "any"]);
  return withIdempotency({ key: idemKey, scope: "reservation.create", operationType: "reservation_create", actorId: input.ctx?.user?.id, storeId: input.storeId, entityType: "stock_reservation", entityId: input.orderId ?? input.cartId ?? input.saleId ?? `${input.storeId}:${input.productId}`, requestHash: createMutationFingerprint({ ...input, ctx: undefined }), ctx: input.ctx }, async () => {
    const db = await requireDb();
    return runSerializable(db, async (tx) => {
      await assertAvailableForReservation(input, tx);
      const { stockReservations } = await import("../../drizzle/schema");
      const expiresAt = input.expiresAt === null ? null : input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000);
      const [row] = await tx.insert(stockReservations).values({
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
        reservationMeta: jsonRef(input) as any,
        expiresAt,
      });
      const id = (row as any)?.insertId;
      const result = { id, status: ACTIVE_RESERVATION_STATUS, expiresAt, ...input, ctx: undefined };
      await logAudit({ action: "reservation.created", entityType: "stock_reservation", entityId: id ?? Number(input.orderId ?? 0), afterJson: result }, input.ctx);
      return result;
    });
  });
}

export const reserveStockForOrder = createReservation;

function selectorConds(stockReservations: any, input: ReservationSelector) {
  const conds: any[] = [];
  if (input.id) conds.push(eq(stockReservations.id, input.id));
  if (input.orderId) conds.push(eq(stockReservations.orderId, input.orderId));
  if (input.cartId) conds.push(eq(stockReservations.cartId, input.cartId));
  if (input.storeId) conds.push(eq(stockReservations.storeId, input.storeId));
  if (input.productId) conds.push(eq(stockReservations.productId, input.productId));
  if (input.variantId !== undefined) conds.push(variantFilter(stockReservations, input.variantId));
  if (input.batchId !== undefined) conds.push(batchFilter(stockReservations, input.batchId));
  conds.push(saleRefFilter(stockReservations, input.saleId));
  if (conds.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Reservation selector is required" });
  return conds;
}

async function transitionActiveReservation(input: ReservationSelector, status: ReservationTerminalStatus, defaultReason: string) {
  const idemKey = input.idempotencyKey ?? buildIdempotencyKey(["reservation", status, input.id ?? input.orderId ?? input.cartId ?? input.saleId ?? "scope", input.storeId, input.productId]);
  return withIdempotency({ key: idemKey, scope: `reservation.${status}`, operationType: `reservation_${status}`, actorId: input.ctx?.user?.id, storeId: input.storeId, entityType: "stock_reservation", entityId: input.id ?? input.orderId ?? input.cartId ?? input.saleId ?? null, requestHash: createMutationFingerprint({ ...input, ctx: undefined, idempotencyKey: undefined }), ctx: input.ctx }, async () => {
    const db = await requireDb();
    const { stockReservations } = await import("../../drizzle/schema");
    const reason = input.releaseReason ?? defaultReason;
    const set: any = { status, releaseReason: reason };
    if (status === "consumed") set.fulfilledAt = new Date();
    if (["cancelled", "released", "failed"].includes(status)) set.cancelledAt = new Date();
    const conds = [eq(stockReservations.status, ACTIVE_RESERVATION_STATUS), ...selectorConds(stockReservations, input)];
    const result = await db.update(stockReservations).set(set).where(and(...conds));
    const affectedCount = updateRowCount(result);
    await logAudit({ action: `reservation.${status}`, entityType: "stock_reservation", entityId: Number(input.id ?? input.orderId ?? 0) || null, afterJson: { ...input, ctx: undefined, status, releaseReason: reason, affectedCount } }, input.ctx);
    return { status, releaseReason: reason, affectedCount, idempotent: affectedCount === 0 };
  });
}

export function releaseReservation(input: ReservationSelector) { return transitionActiveReservation(input, "released", input.releaseReason ?? "manual_release"); }
export function failReservation(input: ReservationSelector) { return transitionActiveReservation(input, "failed", input.releaseReason ?? "reservation_failed"); }
export function releaseReservationOnPaymentFailure(input: ReservationSelector) { return transitionActiveReservation(input, "failed", input.releaseReason ?? "payment_failed"); }
export function releaseReservationOnRxReject(input: ReservationSelector) { return transitionActiveReservation(input, "cancelled", input.releaseReason ?? "rx_rejected"); }
export function releaseReservationOnOrderCancel(input: ReservationSelector) { return transitionActiveReservation(input, "cancelled", input.releaseReason ?? "order_cancelled"); }

export async function extendReservation(input: ReservationSelector & { expiresAt: Date }) {
  const idemKey = input.idempotencyKey ?? buildIdempotencyKey(["reservation", "extend", input.id ?? input.orderId ?? input.cartId ?? input.saleId, input.expiresAt.toISOString()]);
  return withIdempotency({ key: idemKey, scope: "reservation.extend", operationType: "reservation_extend", actorId: input.ctx?.user?.id, storeId: input.storeId, entityType: "stock_reservation", entityId: input.id ?? input.orderId ?? input.cartId ?? input.saleId ?? null, requestHash: createMutationFingerprint({ ...input, ctx: undefined, idempotencyKey: undefined }), ctx: input.ctx }, async () => {
    const db = await requireDb();
    const { stockReservations } = await import("../../drizzle/schema");
    const result = await db.update(stockReservations).set({ expiresAt: input.expiresAt }).where(and(eq(stockReservations.status, ACTIVE_RESERVATION_STATUS), ...selectorConds(stockReservations, input)));
    const affectedCount = updateRowCount(result);
    await logAudit({ action: "reservation.extended", entityType: "stock_reservation", entityId: Number(input.id ?? input.orderId ?? 0) || null, afterJson: { ...input, ctx: undefined, affectedCount } }, input.ctx);
    return { status: ACTIVE_RESERVATION_STATUS, expiresAt: input.expiresAt, affectedCount };
  });
}

export async function assertReservationCanBeConsumed(input: ReservationSelector) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const rows = await db.select().from(stockReservations).where(and(...selectorConds(stockReservations, input))).limit(100);
  const now = new Date();
  const expiredActive = rows.find((r: any) => r.status === ACTIVE_RESERVATION_STATUS && r.expiresAt && r.expiresAt <= now);
  if (expiredActive) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Expired reservation cannot be consumed" });
  const active = rows.filter((r: any) => r.status === ACTIVE_RESERVATION_STATUS);
  if (active.length === 0) {
    if (rows.some((r: any) => r.status === "consumed")) return { consumable: false, idempotent: true, rows };
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active reservation can be consumed" });
  }
  return { consumable: true, idempotent: false, rows: active };
}

export async function consumeReservation(input: ReservationSelector) {
  await assertReservationCanBeConsumed(input);
  return transitionActiveReservation(input, "consumed", input.releaseReason ?? "sale_or_order_confirmed");
}

export async function expireReservations(now = new Date()) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const rows = await db.select({ id: stockReservations.id }).from(stockReservations).where(and(eq(stockReservations.status, ACTIVE_RESERVATION_STATUS), lt(stockReservations.expiresAt, now)));
  const ids = rows.map((r: any) => r.id).filter(Boolean);
  if (ids.length > 0) {
    await db.update(stockReservations).set({ status: "expired", releaseReason: "expiresAt elapsed" }).where(inArray(stockReservations.id, ids));
    await logAudit({ action: "reservation.expired_batch", entityType: "stock_reservation", entityId: null, afterJson: { count: ids.length, ids, now } });
  }
  return { status: "expired", count: ids.length, ids };
}

export const expireStaleReservations = expireReservations;
export function expireReservation(input: ReservationSelector) { return transitionActiveReservation(input, "expired", input.releaseReason ?? "reservation_expired"); }

export async function getReservationStatus(input: ReservationSelector) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const conds = selectorConds(stockReservations, input);
  const rows = await db.select().from(stockReservations).where(and(...conds));
  return rows;
}

export async function reconcileReservations(now = new Date()) {
  const db = await requireDb();
  const { stockReservations, batchLedger, orders, cartItems, sales } = await import("../../drizzle/schema");
  const activeReservedRows = await db.select({
    storeId: stockReservations.storeId,
    productId: stockReservations.productId,
    batchId: stockReservations.batchId,
    reservedQty: sql<number>`COALESCE(SUM(${reservationQtyExpr(stockReservations)}), 0)`,
  }).from(stockReservations).where(eq(stockReservations.status, ACTIVE_RESERVATION_STATUS)).groupBy(stockReservations.storeId, stockReservations.productId, stockReservations.batchId);
  const expiredActiveRows = await db.select({ id: stockReservations.id }).from(stockReservations).where(and(eq(stockReservations.status, ACTIVE_RESERVATION_STATUS), lt(stockReservations.expiresAt, now)));
  const missingOrderRows = await db.select({ id: stockReservations.id, orderId: stockReservations.orderId }).from(stockReservations).leftJoin(orders, eq(stockReservations.orderId, orders.id)).where(and(sql`${stockReservations.orderId} IS NOT NULL`, isNull(orders.id)));
  const missingCartRows = await db.select({ id: stockReservations.id, cartId: stockReservations.cartId }).from(stockReservations).leftJoin(cartItems, eq(stockReservations.cartId, cartItems.id)).where(and(sql`${stockReservations.cartId} IS NOT NULL`, isNull(cartItems.id)));
  const missingSaleRows = await db.select({ id: stockReservations.id, saleId: sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${stockReservations.reservationMeta}, '$.saleId'))` }).from(stockReservations).leftJoin(sales, sql`${sales.id} = JSON_UNQUOTE(JSON_EXTRACT(${stockReservations.reservationMeta}, '$.saleId'))`).where(and(sql`JSON_EXTRACT(${stockReservations.reservationMeta}, '$.saleId') IS NOT NULL`, isNull(sales.id)));
  const overReservedRows = await db.select({
    storeId: stockReservations.storeId,
    productId: stockReservations.productId,
    batchId: stockReservations.batchId,
    reservedQty: sql<number>`COALESCE(SUM(${reservationQtyExpr(stockReservations)}), 0)`,
    physicalQty: sql<number>`COALESCE(MAX(${batchLedger.qtyOnHand}), 0)`,
  }).from(stockReservations).leftJoin(batchLedger, eq(stockReservations.batchId, batchLedger.id)).where(eq(stockReservations.status, ACTIVE_RESERVATION_STATUS)).groupBy(stockReservations.storeId, stockReservations.productId, stockReservations.batchId).having(sql`COALESCE(SUM(${reservationQtyExpr(stockReservations)}), 0) > COALESCE(MAX(${batchLedger.qtyOnHand}), 0)`);
  const rows = [
    ...expiredActiveRows.map((r: any) => ({ type: "expired_active", id: r.id })),
    ...missingOrderRows.map((r: any) => ({ type: "missing_order", id: r.id, ref: r.orderId })),
    ...missingCartRows.map((r: any) => ({ type: "missing_cart", id: r.id, ref: r.cartId })),
    ...missingSaleRows.map((r: any) => ({ type: "missing_sale", id: r.id, ref: r.saleId })),
    ...overReservedRows.map((r: any) => ({ type: "over_reserved", storeId: r.storeId, productId: r.productId, batchId: r.batchId, reservedQty: Number(r.reservedQty ?? 0), physicalQty: Number(r.physicalQty ?? 0) })),
  ];
  const csvData = ["type,id,ref,storeId,productId,batchId,reservedQty,physicalQty", ...rows.map((r: any) => [r.type, r.id ?? "", r.ref ?? "", r.storeId ?? "", r.productId ?? "", r.batchId ?? "", r.reservedQty ?? "", r.physicalQty ?? ""].join(","))].join("\n");
  return { activeReservedByStoreProductBatch: activeReservedRows, expiredActiveCount: expiredActiveRows.length, orphanReservations: { missingOrderRows, missingCartRows, missingSaleRows }, overReservedRows, anomalies: rows, csvData };
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
