import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";

export async function requireReservationDb() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

export async function syncStoreSkuSoftLocks(input?: {
  storeId?: number;
  productId?: number;
  variantId?: number | null;
}) {
  const db = await requireReservationDb();
  const { storeSkus } = await import("../../drizzle/schema");
  const conds = [];
  if (input?.storeId) conds.push(eq(storeSkus.storeId, input.storeId));
  if (input?.productId) conds.push(eq(storeSkus.productId, input.productId));
  if (input?.variantId != null)
    conds.push(eq(storeSkus.variantId, input.variantId));
  await db
    .update(storeSkus)
    .set({ softLockedQty: 0 })
    .where(conds.length ? and(...conds) : sql`1=1`);
  return {
    synced: true,
    note: "Soft locks reconciled; durable stock_reservations are canonical.",
  };
}

export function computeAvailableQty(input: {
  onHandQty: number;
  reservedQty?: number;
  softLockedQty?: number;
  quarantinedQty?: number;
  expiredQty?: number;
}) {
  return (
    input.onHandQty -
    (input.reservedQty ?? 0) -
    (input.softLockedQty ?? 0) -
    (input.quarantinedQty ?? 0) -
    (input.expiredQty ?? 0)
  );
}

export function explainAvailability(
  input: Parameters<typeof computeAvailableQty>[0]
) {
  const available = computeAvailableQty(input);
  return {
    ...input,
    availableQty: Math.max(0, available),
    rawAvailableQty: available,
    formula:
      "availableQty = onHandQty - reservedQty - softLockedQty - quarantinedQty - expiredQty",
  };
}
