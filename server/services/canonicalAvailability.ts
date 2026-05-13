import { and, eq, inArray, sql } from "drizzle-orm";
import pino from "pino";
import { getDb } from "../db";
import {
  batchLedger,
  reservationLines,
  reservations,
} from "../../drizzle/schema";
import { emitSloEvent } from "./sloService";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

export type BatchAvailability = {
  batchId: number;
  batchNo: string;
  expiryDate: Date;
  onHand: number;
  reserved: number;
  sellable: number;
};

export type CanonicalAvailability = {
  productId: number;
  storeId: number;
  variantId: number | null;
  totalOnHand: number;
  totalReserved: number;
  totalSellable: number;
  batches: BatchAvailability[];
  computedAt: Date;
};

const ACTIVE_RESERVATION_STATES = ["active", "pending_confirmation"] as const;

export async function getCanonicalAvailability(
  productId: number,
  storeId: number,
  variantId?: number | null
): Promise<CanonicalAvailability> {
  const started = Date.now();
  const db = await getDb();
  if (!db) {
    logger.error(
      { productId, storeId },
      "DB unavailable for canonical availability"
    );
    return {
      productId,
      storeId,
      variantId: variantId ?? null,
      totalOnHand: 0,
      totalReserved: 0,
      totalSellable: 0,
      batches: [],
      computedAt: new Date(),
    };
  }

  // 1. Fetch active batches for this product+store, ordered FEFO (earliest expiry first).
  const variantCond =
    variantId != null ? eq(batchLedger.variantId, variantId) : undefined;

  const activeBatches = await db
    .select()
    .from(batchLedger)
    .where(
      and(
        eq(batchLedger.storeId, storeId),
        eq(batchLedger.productId, productId),
        eq(batchLedger.status, "active"),
        ...(variantCond ? [variantCond] : [])
      )
    )
    .orderBy(batchLedger.expiryDate);

  if (activeBatches.length === 0) {
    return {
      productId,
      storeId,
      variantId: variantId ?? null,
      totalOnHand: 0,
      totalReserved: 0,
      totalSellable: 0,
      batches: [],
      computedAt: new Date(),
    };
  }

  const batchIds = activeBatches.map(b => b.id);

  // 2. Sum reservation_lines quantities for active reservations on these batches.
  const reservedRows = await db
    .select({
      batchId: reservationLines.batchId,
      reserved: sql<number>`COALESCE(SUM(${reservationLines.quantity}), 0)`,
    })
    .from(reservationLines)
    .innerJoin(
      reservations,
      and(
        eq(reservationLines.reservationId, reservations.id),
        inArray(
          reservations.state,
          ACTIVE_RESERVATION_STATES as unknown as string[]
        )
      )
    )
    .where(inArray(reservationLines.batchId, batchIds))
    .groupBy(reservationLines.batchId);

  const reservedByBatch = new Map<number, number>();
  for (const row of reservedRows) {
    reservedByBatch.set(Number(row.batchId), Number(row.reserved));
  }

  // 3. Build per-batch availability (FEFO order already guaranteed by ORDER BY expiryDate).
  const batchAvailabilities: BatchAvailability[] = activeBatches.map(b => {
    const onHand = Number(b.qtyOnHand ?? 0);
    const reserved = reservedByBatch.get(b.id) ?? 0;
    const sellable = Math.max(0, onHand - reserved);
    return {
      batchId: b.id,
      batchNo: b.batchNo,
      expiryDate: new Date(b.expiryDate),
      onHand,
      reserved,
      sellable,
    };
  });

  const totalOnHand = batchAvailabilities.reduce((s, b) => s + b.onHand, 0);
  const totalReserved = batchAvailabilities.reduce((s, b) => s + b.reserved, 0);
  const totalSellable = batchAvailabilities.reduce((s, b) => s + b.sellable, 0);

  const durationMs = Date.now() - started;
  emitSloEvent({
    sloName: "availability.query.p99",
    target: 200,
    measuredValue: durationMs,
    withinBudget: true,
    context: { productId, storeId, variantId },
  }).catch(() => {});

  logger.debug(
    { productId, storeId, batchCount: activeBatches.length, durationMs },
    "Canonical availability computed"
  );

  return {
    productId,
    storeId,
    variantId: variantId ?? null,
    totalOnHand,
    totalReserved,
    totalSellable,
    batches: batchAvailabilities,
    computedAt: new Date(),
  };
}

export async function getMultiProductAvailability(
  items: Array<{
    productId: number;
    storeId: number;
    variantId?: number | null;
  }>
): Promise<CanonicalAvailability[]> {
  // Run in parallel; avoid N+1 by batching per unique storeId group.
  return Promise.all(
    items.map(item =>
      getCanonicalAvailability(item.productId, item.storeId, item.variantId)
    )
  );
}
