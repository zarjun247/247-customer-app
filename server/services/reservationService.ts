import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";
import type { CtxLike } from "./audit";
import { appendCommercialEventBestEffort } from "./commercialLifecycle";
import type { getDb } from "../db";
import type { ResultSetHeader } from "mysql2";
export {
  computeAvailableQty,
  explainAvailability,
  syncStoreSkuSoftLocks,
} from "./reservationHelpers";

type DbInstance = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type DbTx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

const ACTIVE_RESERVATION_STATUS = "active" as const;
const _TERMINAL_RESERVATION_STATUSES = [
  "released",
  "expired",
  "consumed",
  "cancelled",
] as const;
type ReservationReleaseStatus = (typeof _TERMINAL_RESERVATION_STATUSES)[number];

type ReservationCtx = CtxLike & { requestId?: string | null };

interface ReservationInput {
  qty?: number | null;
  expiresAt?: Date | null;
  batchId?: number | null;
  orderId?: number | null;
  cartId?: string | number | null;
  productId?: number | null;
  variantId?: number | null;
  skuId?: number | null;
  storeId?: number | null;
  releaseReason?: string | null;
  ctx?: ReservationCtx | null;
  actorId?: number | null;
  idempotencyKey?: string | null;
  correlationId?: string | null;
  id?: number | null;
}

async function requireDb() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

function variantFilter(
  variantIdCol: AnyMySqlColumn,
  variantId?: number | null
): SQL<unknown> {
  return variantId == null ? sql`1=1` : eq(variantIdCol, variantId);
}

export async function getCanonicalStockAggregate(
  storeId: number,
  productId: number,
  variantId?: number | null
) {
  const db = await requireDb();
  const { batchLedger, stockReservations, storeSkus } = await import(
    "../../drizzle/schema"
  );
  const now = new Date();
  const [sku] = await db
    .select()
    .from(storeSkus)
    .where(
      and(
        eq(storeSkus.storeId, storeId),
        eq(storeSkus.productId, productId),
        variantFilter(storeSkus.variantId, variantId)
      )
    )
    .limit(1);
  const [batchAgg] = await db
    .select({
      onHand: sql<number>`COALESCE(SUM(${batchLedger.qtyOnHand}), 0)`,
      batchReserved: sql<number>`COALESCE(SUM(${batchLedger.qtyReserved}), 0)`,
      quarantined: sql<number>`COALESCE(SUM(${batchLedger.qtyQuarantined}), 0)`,
      expired: sql<number>`COALESCE(SUM(${batchLedger.qtyExpired}), 0)`,
    })
    .from(batchLedger)
    .where(
      and(
        eq(batchLedger.storeId, storeId),
        eq(batchLedger.productId, productId),
        variantFilter(batchLedger.variantId, variantId),
        eq(batchLedger.status, "active")
      )
    );
  const [_reservationAgg] = await db
    .select({
      reserved: sql<number>`COALESCE(SUM(COALESCE(${stockReservations.qty}, ${stockReservations.qtyReserved})), 0)`,
    })
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.storeId, storeId),
        eq(stockReservations.productId, productId),
        variantFilter(stockReservations.variantId, variantId),
        eq(stockReservations.status, ACTIVE_RESERVATION_STATUS),
        or(
          sql`${stockReservations.expiresAt} IS NULL`,
          sql`${stockReservations.expiresAt} > ${now}`
        )
      )
    );

  return {
    onHandQty: Number(batchAgg?.onHand ?? sku?.stockQty ?? 0),
    reservedQty: Number(batchAgg?.batchReserved ?? 0),
    softLockedQty: Number(sku?.softLockedQty ?? 0),
    quarantinedQty: Number(batchAgg?.quarantined ?? 0),
    expiredQty: Number(batchAgg?.expired ?? 0),
  };
}

export async function syncStoreSkuAggregate(input: {
  storeId: number;
  productId: number;
  variantId?: number | null;
}) {
  const db = await requireDb();
  const { storeSkus } = await import("../../drizzle/schema");
  const aggregate = await getCanonicalStockAggregate(
    input.storeId,
    input.productId,
    input.variantId
  );
  const [sku] = await db
    .select()
    .from(storeSkus)
    .where(
      and(
        eq(storeSkus.storeId, input.storeId),
        eq(storeSkus.productId, input.productId),
        variantFilter(storeSkus.variantId, input.variantId)
      )
    )
    .limit(1);
  if (!sku) return { synced: false, aggregate };
  await db
    .update(storeSkus)
    .set({ stockQty: aggregate.onHandQty })
    .where(eq(storeSkus.id, sku.id));
  return { synced: true, skuId: sku.id, aggregate };
}

export async function getCanonicalAvailability(
  storeId: number,
  productId: number,
  variantId?: number | null
) {
  const { getCanonicalAvailability: fromLedger } = await import(
    "./canonicalAvailability"
  );
  const ledger = await fromLedger(productId, storeId, variantId);
  return {
    availableQty: ledger.totalSellable,
    rawAvailableQty: ledger.totalSellable,
    onHandQty: ledger.totalOnHand,
    reservedQty: ledger.totalReserved,
    softLockedQty: 0,
    quarantinedQty: 0,
    expiredQty: 0,
    formula: "availableQty = totalSellable from canonical ledger (FEFO)",
  };
}

export async function assertAvailableForReservation(input: {
  storeId: number;
  productId: number;
  variantId?: number | null;
  qty: number;
}) {
  const c = await getCanonicalAvailability(
    input.storeId,
    input.productId,
    input.variantId
  );
  if (c.availableQty < input.qty)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Insufficient available stock after reservations",
    });
  return c;
}

export async function reserveBatchAtomic(input: ReservationInput) {
  const db = await requireDb();
  const { batchLedger, stockReservations, stockMovements } = await import(
    "../../drizzle/schema"
  );
  const qty = Math.abs(Number(input.qty ?? 0));
  if (!qty)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Reservation quantity must be positive",
    });
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000);
  const result = await db.transaction(async (tx: DbTx) => {
    const [batch] = await tx
      .select()
      .from(batchLedger)
      .where(eq(batchLedger.id, input.batchId!))
      .for("update")
      .limit(1);
    if (!batch)
      throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
    const available =
      Number(batch.qtyOnHand ?? 0) -
      Number(batch.qtyReserved ?? 0) -
      Number(batch.qtyQuarantined ?? 0) -
      Number(batch.qtyExpired ?? 0);
    if (available < qty)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Insufficient available stock after reservations",
      });
    const beforeReserved = Number(batch.qtyReserved ?? 0);
    const afterReserved = beforeReserved + qty;
    const claimResult = await tx
      .update(batchLedger)
      .set({ qtyReserved: afterReserved })
      .where(
        and(
          eq(batchLedger.id, input.batchId!),
          sql`${batchLedger.qtyOnHand} - ${batchLedger.qtyReserved} - ${batchLedger.qtyQuarantined} - ${batchLedger.qtyExpired} >= ${qty}`
        )
      );
    const [claimHeader] = claimResult as unknown as [ResultSetHeader];
    if (Number(claimHeader.affectedRows ?? 0) !== 1)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Reservation race lost",
      });
    type StockReservationInsert = typeof stockReservations.$inferInsert;
    const insertRes = await tx.insert(stockReservations).values({
      batchId: input.batchId ?? null,
      orderId: input.orderId ?? null,
      cartId: input.cartId != null ? Number(input.cartId) : null,
      productId: input.productId ?? batch.productId,
      variantId: input.variantId ?? batch.variantId ?? null,
      skuId: input.skuId ?? null,
      storeId: input.storeId ?? batch.storeId,
      qty,
      qtyReserved: qty,
      status: ACTIVE_RESERVATION_STATUS,
      expiresAt,
    } as unknown as StockReservationInsert);
    const [insertHeader] = insertRes as unknown as [ResultSetHeader];
    const reservationId = insertHeader.insertId;
    type StockMovementInsert = typeof stockMovements.$inferInsert;
    await tx.insert(stockMovements).values({
      batchId: input.batchId!,
      storeId: input.storeId ?? batch.storeId,
      movementType: "sale_reserve",
      qty,
      qtyBefore: beforeReserved,
      qtyAfter: afterReserved,
      referenceType: "stock_reservation",
      referenceId: reservationId ?? null,
      reason: input.releaseReason ?? "reservation_created",
      performedBy: input.ctx?.user?.id ?? input.actorId ?? 0,
    } as unknown as StockMovementInsert);
    return { reservationId, batch, beforeReserved, afterReserved, expiresAt };
  });
  await logAudit(
    {
      action: "reservation.created",
      entityType: "stock_reservation",
      entityId: result.reservationId ?? Number(input.orderId ?? 0),
      beforeJson: { qtyReserved: result.beforeReserved },
      afterJson: { ...input, expiresAt, qtyReserved: result.afterReserved },
    },
    input.ctx ?? undefined
  );
  await appendCommercialEventBestEffort({
    aggregateType: "reservation",
    aggregateId:
      result.reservationId ??
      input.orderId ??
      input.cartId ??
      `${input.storeId}:${input.productId}`,
    eventType: "reservation_created",
    actorType: input.ctx?.user ? "staff" : "system",
    actorId: input.ctx?.user?.id ?? null,
    storeId: input.storeId ?? result.batch.storeId,
    orderId: input.orderId ?? null,
    reservationId: result.reservationId,
    eventPayload: {
      productId: input.productId ?? result.batch.productId,
      variantId: input.variantId ?? result.batch.variantId ?? null,
      skuId: input.skuId ?? null,
      qty,
      expiresAt,
    },
    idempotencyKey:
      input.idempotencyKey ??
      (result.reservationId
        ? `reservation:${result.reservationId}:created`
        : null),
    correlationId: input.correlationId ?? input.ctx?.requestId ?? null,
  });
  return {
    id: result.reservationId,
    status: ACTIVE_RESERVATION_STATUS,
    expiresAt,
    ...input,
    qty,
  };
}

/** P0-3: Atomic availability check + reservation via SELECT FOR UPDATE transaction. */
export async function reserveStockForOrder(input: ReservationInput) {
  if (input.batchId) return reserveBatchAtomic(input);
  const db = await requireDb();
  const { stockReservations, storeSkus } = await import("../../drizzle/schema");
  const qty = input.qty!;
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000);
  const result = await db.transaction(async (tx: DbTx) => {
    // SELECT FOR UPDATE on storeSkus serializes concurrent reservations for the same SKU.
    const skuConds = [
      eq(storeSkus.storeId, input.storeId!),
      eq(storeSkus.productId, input.productId!),
    ];
    if (input.variantId != null)
      skuConds.push(eq(storeSkus.variantId, input.variantId));
    const [sku] = await tx
      .select()
      .from(storeSkus)
      .where(and(...skuConds))
      .limit(1)
      .for("update");
    if (!sku)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "SKU not found for reservation",
      });
    const { getCanonicalAvailability } = await import(
      "./canonicalAvailability"
    );
    const availability = await getCanonicalAvailability(
      input.productId!,
      input.storeId!,
      input.variantId ?? null
    );
    if (availability.totalSellable < qty)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Insufficient available stock after reservations",
      });
    type StockReservationInsert = typeof stockReservations.$inferInsert;
    const insertRes = await tx.insert(stockReservations).values({
      batchId: null,
      orderId: input.orderId ?? null,
      cartId: input.cartId != null ? Number(input.cartId) : null,
      productId: input.productId!,
      variantId: input.variantId ?? null,
      skuId: input.skuId ?? null,
      storeId: input.storeId!,
      qty,
      qtyReserved: qty,
      status: ACTIVE_RESERVATION_STATUS,
      expiresAt,
    } as unknown as StockReservationInsert);
    const [insertHeader] = insertRes as unknown as [ResultSetHeader];
    return { reservationId: insertHeader.insertId };
  });
  const reservationId = result.reservationId;
  await logAudit(
    {
      action: "reservation.created",
      entityType: "stock_reservation",
      entityId: reservationId ?? Number(input.orderId ?? 0),
      afterJson: { ...input, expiresAt },
    },
    input.ctx ?? undefined
  );
  return {
    id: reservationId,
    status: ACTIVE_RESERVATION_STATUS,
    expiresAt,
    ...input,
  };
}

async function applyReservationTerminalAtomic(
  input: ReservationInput,
  status: ReservationReleaseStatus,
  defaultReason: string
) {
  const db = await requireDb();
  const { batchLedger, stockReservations, stockMovements } = await import(
    "../../drizzle/schema"
  );
  const releaseReason = input.releaseReason ?? defaultReason;
  const result = await db.transaction(async (tx: DbTx) => {
    const conds = [eq(stockReservations.status, ACTIVE_RESERVATION_STATUS)];
    if (input.id) conds.push(eq(stockReservations.id, input.id));
    if (input.batchId) conds.push(eq(stockReservations.batchId, input.batchId));
    if (input.orderId) conds.push(eq(stockReservations.orderId, input.orderId));
    if (input.cartId)
      conds.push(eq(stockReservations.cartId, Number(input.cartId)));
    if (input.storeId) conds.push(eq(stockReservations.storeId, input.storeId));
    if (input.productId)
      conds.push(eq(stockReservations.productId, input.productId));
    const reservations = await tx
      .select()
      .from(stockReservations)
      .where(and(...conds))
      .for("update");
    let touched = 0;
    for (const reservation of reservations) {
      const qty = Number(reservation.qtyReserved ?? reservation.qty ?? 0);
      if (qty <= 0) continue;
      if (reservation.batchId) {
        const [batch] = await tx
          .select()
          .from(batchLedger)
          .where(eq(batchLedger.id, reservation.batchId))
          .for("update")
          .limit(1);
        if (!batch)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Reservation batch not found",
          });
        const reservedBefore = Number(batch.qtyReserved ?? 0);
        const onHandBefore = Number(batch.qtyOnHand ?? 0);
        if (reservedBefore < qty)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Reservation release would make reserved stock negative",
          });
        const nextReserved = reservedBefore - qty;
        const nextOnHand =
          status === "consumed" ? onHandBefore - qty : onHandBefore;
        if (nextOnHand < 0)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Reservation consume would make on-hand stock negative",
          });
        await tx
          .update(batchLedger)
          .set(
            status === "consumed"
              ? { qtyReserved: nextReserved, qtyOnHand: nextOnHand }
              : { qtyReserved: nextReserved }
          )
          .where(
            and(
              eq(batchLedger.id, reservation.batchId),
              sql`${batchLedger.qtyReserved} >= ${qty}`
            )
          );
        await tx.insert(stockMovements).values({
          batchId: reservation.batchId,
          storeId: reservation.storeId,
          movementType:
            status === "consumed" ? "sale_fulfil" : "cancellation_release",
          qty: status === "consumed" ? -qty : qty,
          qtyBefore: status === "consumed" ? onHandBefore : reservedBefore,
          qtyAfter: status === "consumed" ? nextOnHand : nextReserved,
          referenceType: "stock_reservation",
          referenceId: reservation.id,
          reason: releaseReason,
          performedBy: input.ctx?.user?.id ?? input.actorId ?? 0,
        });
      }
      await tx
        .update(stockReservations)
        .set({
          status,
          releaseReason,
          qtyReserved: 0,
          fulfilledAt:
            status === "consumed" ? new Date() : reservation.fulfilledAt,
          cancelledAt:
            status === "cancelled" ? new Date() : reservation.cancelledAt,
        })
        .where(
          and(
            eq(stockReservations.id, reservation.id),
            eq(stockReservations.status, ACTIVE_RESERVATION_STATUS)
          )
        );
      touched += 1;
    }
    return { won: touched > 0, touched };
  });
  await logAudit(
    {
      action: `reservation.${status}`,
      entityType: "stock_reservation",
      entityId: Number(input.id ?? input.orderId ?? 0),
      afterJson: { ...input, status, releaseReason, touched: result.touched },
    },
    input.ctx ?? undefined
  );
  const eventType =
    status === "consumed"
      ? "reservation_consumed"
      : status === "expired"
        ? "reservation_expired"
        : "reservation_released";
  await appendCommercialEventBestEffort({
    aggregateType: "reservation",
    aggregateId: input.id ?? input.orderId ?? input.cartId ?? "unknown",
    eventType,
    actorType: input.ctx?.user ? "staff" : "system",
    actorId: input.ctx?.user?.id ?? null,
    storeId: input.storeId ?? null,
    orderId: input.orderId ?? null,
    reservationId: input.id ?? null,
    eventPayload: { status, releaseReason, touched: result.touched },
    idempotencyKey:
      input.idempotencyKey ??
      `${eventType}:${input.id ?? input.orderId ?? input.cartId ?? "unknown"}`,
    correlationId: input.correlationId ?? input.ctx?.requestId ?? null,
  });
  return { status, releaseReason, won: result.won };
}

export function releaseReservationAtomic(input: ReservationInput) {
  return applyReservationTerminalAtomic(
    input,
    "released",
    input.releaseReason ?? "manual_release"
  );
}
export function consumeReservationAtomic(input: ReservationInput) {
  return applyReservationTerminalAtomic(
    input,
    "consumed",
    input.releaseReason ?? "reservation_consumed"
  );
}

function updateReservationStatus(
  input: ReservationInput,
  status: ReservationReleaseStatus,
  defaultReason: string
) {
  return applyReservationTerminalAtomic(input, status, defaultReason);
}
export const claimReservationTerminalState = (input: {
  terminalStatus: ReservationReleaseStatus;
  releaseReason?: string;
}) =>
  updateReservationStatus(
    input,
    input.terminalStatus,
    input.releaseReason ?? input.terminalStatus
  );
export const releaseReservation = (input: ReservationInput) =>
  updateReservationStatus(
    input,
    "released",
    input.releaseReason ?? "manual_release"
  );
export const expireReservation = (input: ReservationInput) =>
  updateReservationStatus(
    input,
    "expired",
    input.releaseReason ?? "reservation_expired"
  );
export const releaseReservationOnPaymentFailure = (input: ReservationInput) =>
  updateReservationStatus(
    input,
    "released",
    input.releaseReason ?? "payment_failed"
  );
export const releaseReservationOnRxReject = (input: ReservationInput) =>
  updateReservationStatus(
    input,
    "released",
    input.releaseReason ?? "rx_rejected"
  );
export const releaseReservationOnOrderCancel = (input: ReservationInput) =>
  updateReservationStatus(
    input,
    "cancelled",
    input.releaseReason ?? "order_cancelled"
  );

export async function expireStaleReservations(now = new Date()) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  await db
    .update(stockReservations)
    .set({ status: "expired", releaseReason: "expiresAt elapsed" })
    .where(
      and(
        eq(stockReservations.status, ACTIVE_RESERVATION_STATUS),
        lt(stockReservations.expiresAt, now)
      )
    );
  return { status: "expired" };
}

export async function getReservationStatus(
  input: Pick<ReservationInput, "id" | "orderId" | "cartId">
) {
  const db = await requireDb();
  const { stockReservations } = await import("../../drizzle/schema");
  const conds = [];
  if (input.id) conds.push(eq(stockReservations.id, input.id));
  if (input.orderId) conds.push(eq(stockReservations.orderId, input.orderId));
  if (input.cartId)
    conds.push(eq(stockReservations.cartId, Number(input.cartId)));
  const rows = await db
    .select()
    .from(stockReservations)
    .where(
      conds.length ? and(...conds) : ne(stockReservations.status, "consumed")
    );
  return rows;
}
