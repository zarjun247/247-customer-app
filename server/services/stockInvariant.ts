import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { logAudit } from "./audit";

export type StockActor = { actorId?: number | null; actorRole?: string | null; source?: string };

async function getDb() {
  const { getDb: _getDb } = await import("../db");
  const db = await _getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

export async function assertNoNegativeStock(qtyAfter: number) {
  if (qtyAfter < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient stock: negative quantity not allowed" });
}

export async function getCurrentBatchQty(db: Awaited<ReturnType<typeof getDb>>, batchId: number) {
  const { batchLedger } = await import("../../drizzle/schema");
  const [batch] = await db.select().from(batchLedger).where(eq(batchLedger.id, batchId)).limit(1);
  if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
  return batch;
}

export async function applyStockMovement(input: {
  batchId: number; storeId: number; qtyDelta: number; movementType: "purchase_inward"|"sale_fulfil"|"sale_return"|"purchase_return"|"stock_adjustment"|"quarantine"|"disposal";
  referenceType?: string; referenceId?: number; reason?: string; actor: StockActor; productId?: number;
}) {
  const db = await getDb();
  const { batchLedger, stockMovements } = await import("../../drizzle/schema");
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batchLedger).where(eq(batchLedger.id, input.batchId)).limit(1);
    if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
    const qtyBefore = batch.qtyOnHand ?? 0;
    const qtyAfter = qtyBefore + input.qtyDelta;
    await assertNoNegativeStock(qtyAfter);
    await tx.update(batchLedger).set({ qtyOnHand: qtyAfter }).where(eq(batchLedger.id, input.batchId));
    await tx.insert(stockMovements).values({
      batchId: input.batchId, storeId: input.storeId, movementType: input.movementType, qty: input.qtyDelta,
      qtyBefore, qtyAfter, referenceType: input.referenceType, referenceId: input.referenceId, reason: input.reason,
      performedBy: input.actor.actorId ?? 0,
    });
    await logAudit({ action: `stock.${input.movementType}`, entityType: "batch_ledger", entityId: input.batchId, actorId: input.actor.actorId ?? undefined, actorRole: input.actor.actorRole ?? undefined, source: input.actor.source ?? "admin", beforeJson: { qtyOnHand: qtyBefore }, afterJson: { qtyOnHand: qtyAfter }, reason: input.reason, metadata: { storeId: input.storeId, qtyDelta: input.qtyDelta, referenceType: input.referenceType, referenceId: input.referenceId, productId: input.productId } });
    return { qtyBefore, qtyAfter };
  });
}

export const increaseStockForPurchaseCommit = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "purchase_inward" });
export const decreaseStockForSaleConfirmation = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "sale_fulfil" });
export const reverseStockForSaleReturn = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "sale_return" });
export const decreaseStockForPurchaseReturn = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "purchase_return" });
export const adjustStock = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType"> & { adjustmentType: "increase"|"decrease" }) => applyStockMovement({ ...i, qtyDelta: i.adjustmentType === "increase" ? Math.abs(i.qtyDelta) : -Math.abs(i.qtyDelta), movementType: "stock_adjustment" });
