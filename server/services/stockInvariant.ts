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
    const qtyQuarantinedBefore = batch.qtyQuarantined ?? 0;
    const qtyExpiredBefore = batch.qtyExpired ?? 0;

    // Compute canonical qtyAfter for on-hand
    const qtyAfter = qtyBefore + input.qtyDelta;
    // Compute derived columns depending on movement type
    let qtyQuarantinedAfter = qtyQuarantinedBefore;
    let qtyExpiredAfter = qtyExpiredBefore;

    if (input.movementType === "quarantine") {
      // quarantine: move from on-hand into quarantined bucket
      const delta = Math.abs(input.qtyDelta);
      qtyQuarantinedAfter = qtyQuarantinedBefore + delta;
    }
    if (input.movementType === "disposal") {
      // disposal: increment expired/removed tally
      const delta = Math.abs(input.qtyDelta);
      qtyExpiredAfter = qtyExpiredBefore + delta;
    }

    await assertNoNegativeStock(qtyAfter);

    // Build update payload for batchLedger
    const updatePayload: any = { qtyOnHand: qtyAfter };
    // Only set derived counters when they changed to avoid unintended overwrites
    if (qtyQuarantinedAfter !== qtyQuarantinedBefore) updatePayload.qtyQuarantined = qtyQuarantinedAfter;
    if (qtyExpiredAfter !== qtyExpiredBefore) updatePayload.qtyExpired = qtyExpiredAfter;

    await tx.update(batchLedger).set(updatePayload).where(eq(batchLedger.id, input.batchId));

    await tx.insert(stockMovements).values({
      batchId: input.batchId, storeId: input.storeId, movementType: input.movementType, qty: input.qtyDelta,
      qtyBefore, qtyAfter, referenceType: input.referenceType, referenceId: input.referenceId, reason: input.reason,
      performedBy: input.actor.actorId ?? 0,
    });

    await logAudit({ action: `stock.${input.movementType}`, entityType: "batch_ledger", entityId: input.batchId, actorId: input.actor.actorId ?? undefined, actorRole: input.actor.actorRole ?? undefined, source: input.actor.source ?? "admin", beforeJson: { qtyOnHand: qtyBefore, qtyQuarantined: qtyQuarantinedBefore, qtyExpired: qtyExpiredBefore }, afterJson: { qtyOnHand: qtyAfter, qtyQuarantined: qtyQuarantinedAfter, qtyExpired: qtyExpiredAfter }, reason: input.reason, metadata: { storeId: input.storeId, qtyDelta: input.qtyDelta, referenceType: input.referenceType, referenceId: input.referenceId, productId: input.productId } });

    return { qtyBefore, qtyAfter, qtyQuarantinedAfter, qtyExpiredAfter };
  });
}

export const increaseStockForPurchaseCommit = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "purchase_inward" });
export const decreaseStockForSaleConfirmation = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "sale_fulfil" });
export const reverseStockForSaleReturn = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "sale_return" });
export const decreaseStockForPurchaseReturn = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "purchase_return" });
export const adjustStock = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType"> & { adjustmentType: "increase"|"decrease" }) => applyStockMovement({ ...i, qtyDelta: i.adjustmentType === "increase" ? Math.abs(i.qtyDelta) : -Math.abs(i.qtyDelta), movementType: "stock_adjustment" });
export const quarantineBatch = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "quarantine", qtyDelta: -Math.abs(i.qtyDelta) });
export const disposeBatch = (i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">) => applyStockMovement({ ...i, movementType: "disposal", qtyDelta: -Math.abs(i.qtyDelta) });

export async function releaseQuarantine(input: {
  batchId: number;
  qty: number;
  note?: string;
  actor: StockActor;
}) {
  const db = await getDb();
  const { batchLedger, stockMovements } = await import("../../drizzle/schema");
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batchLedger).where(eq(batchLedger.id, input.batchId)).limit(1);
    if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
    const qty = Math.abs(input.qty);
    if ((batch.qtyQuarantined ?? 0) < qty) throw new TRPCError({ code: "BAD_REQUEST", message: `Only ${batch.qtyQuarantined} units quarantined` });
    const qtyBefore = batch.qtyOnHand ?? 0;
    const qtyAfter = qtyBefore + qty;
    const qtyQuarantinedAfter = (batch.qtyQuarantined ?? 0) - qty;
    await assertNoNegativeStock(qtyAfter);
    await assertNoNegativeStock(qtyQuarantinedAfter);
    await tx.update(batchLedger).set({ qtyOnHand: qtyAfter, qtyQuarantined: qtyQuarantinedAfter, status: "active" }).where(eq(batchLedger.id, input.batchId));
    await tx.insert(stockMovements).values({ batchId: input.batchId, storeId: batch.storeId, movementType: "audit_correction", qty, qtyBefore, qtyAfter, reason: `Release from quarantine. ${input.note ?? ""}`.trim(), performedBy: input.actor.actorId ?? 0, referenceType: "batch_quarantine", referenceId: input.batchId });
    await logAudit({ action: "inventory.batch_released_from_quarantine", entityType: "batch_ledger", entityId: input.batchId, actorId: input.actor.actorId ?? undefined, actorRole: input.actor.actorRole ?? undefined, source: input.actor.source ?? "admin", beforeJson: { qtyOnHand: qtyBefore, qtyQuarantined: batch.qtyQuarantined }, afterJson: { qtyOnHand: qtyAfter, qtyQuarantined: qtyQuarantinedAfter }, reason: input.note, metadata: { qtyReleased: qty, storeId: batch.storeId, productId: batch.productId } });
    return { qtyBefore, qtyAfter, qtyQuarantinedAfter };
  });
}

export async function createBatchWithOpeningStock(input: {
  batch: { productId: number; variantId?: number; storeId: number; supplierId?: number; batchNo: string; mfgDate?: Date; expiryDate: Date; mrp: string; purchaseRate: string; saleRate: string; schemeDiscount?: string; cashDiscount?: string; landingCost?: string; margin?: string; qtyOnHand: number; internalBarcode?: string; manufacturerBarcode?: string; purchaseInvoiceId?: number; grnId?: number; storageCondition: "ambient" | "cold_chain" | "controlled" | "frozen"; coldChainFlag: boolean; expiryBucket: "normal" | "warning" | "critical" | "quarantine_candidate" | "expired"; status: "active" | "quarantined" | "depleted" | "expired" | "recalled" | "damaged" | "returned_to_supplier"; createdBy: number };
  actor: StockActor;
}) {
  const db = await getDb();
  const { batchLedger } = await import("../../drizzle/schema");
  const openingQty = Math.max(0, input.batch.qtyOnHand ?? 0);
  const [result] = await db.insert(batchLedger).values({ ...input.batch, qtyOnHand: 0 });
  const batchId = result.insertId;
  if (openingQty > 0) {
    await applyStockMovement({ batchId, storeId: input.batch.storeId, qtyDelta: openingQty, movementType: "purchase_inward", referenceType: input.batch.purchaseInvoiceId ? "purchase_invoice" : "batch_create", referenceId: input.batch.purchaseInvoiceId ?? batchId, reason: `Batch ${input.batch.batchNo} opening stock`, actor: input.actor, productId: input.batch.productId });
  }
  await logAudit({ action: "inventory.batch_created_with_opening_stock", entityType: "batch_ledger", entityId: batchId, actorId: input.actor.actorId ?? undefined, actorRole: input.actor.actorRole ?? undefined, source: input.actor.source ?? "admin", afterJson: { ...input.batch }, metadata: { openingStockQty: openingQty } });
  return { batchId };
}

export async function applyStockAuditCorrection(input: {
  auditId: number;
  lineId: number;
  batchId: number;
  storeId: number;
  countedQty: number;
  actor: StockActor;
  productId?: number;
}) {
  const db = await getDb();
  const { stockAuditLines, batchLedger } = await import("../../drizzle/schema");
  const [batch] = await db.select().from(batchLedger).where(eq(batchLedger.id, input.batchId)).limit(1);
  if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
  const qtyDelta = input.countedQty - (batch.qtyOnHand ?? 0);
  const movement = await applyStockMovement({ batchId: input.batchId, storeId: input.storeId, qtyDelta, movementType: "stock_adjustment", referenceType: "stock_audit", referenceId: input.auditId, reason: "Stock audit correction", actor: input.actor, productId: input.productId ?? batch.productId });
  await db.update(stockAuditLines).set({ status: "adjusted" }).where(eq(stockAuditLines.id, input.lineId));
  await logAudit({ action: "inventory.stock_audit_corrected", entityType: "stock_audit", entityId: input.auditId, actorId: input.actor.actorId ?? undefined, actorRole: input.actor.actorRole ?? undefined, source: input.actor.source ?? "admin", beforeJson: { qtyOnHand: movement.qtyBefore }, afterJson: { qtyOnHand: movement.qtyAfter }, metadata: { lineId: input.lineId, batchId: input.batchId, qtyDelta } });
  return movement;
}

export async function syncLegacyBatchQuantity(db: Awaited<ReturnType<typeof getDb>> | null, batchLegacyId: number, qtyAfter: number, actor?: StockActor) {
  const _db = db ?? await getDb();
  const { batches } = await import("../../drizzle/schema");
  await _db.update(batches).set({ quantity: qtyAfter }).where(eq(batches.id, batchLegacyId));
  await logAudit({ action: "inventory.legacy_batch_sync", entityType: "batches", entityId: batchLegacyId, source: actor?.source ?? "system", beforeJson: {}, afterJson: { quantity: qtyAfter }, reason: "Sync legacy batch quantity from canonical stockInvariant", metadata: { qtyAfter } });
}

export async function reserveBatchAtomic(batchId: number, storeId: number, qty: number, actor?: StockActor) {
  const db = await getDb();
  const { batchLedger, stockMovements } = await import("../../drizzle/schema");
  return db.transaction(async (tx) => {
    // Conditional update to avoid race: only succeed if available >= qty
    const sql = "UPDATE batch_ledger SET qtyReserved = COALESCE(qtyReserved, 0) + ? WHERE id = ? AND COALESCE(qtyOnHand, 0) - COALESCE(qtyReserved, 0) - COALESCE(qtyQuarantined, 0) - COALESCE(qtyExpired, 0) >= ?";
    const [res]: any = await (tx as any).execute(sql, [qty, batchId, qty]);
    if (!res || res.affectedRows === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Insufficient available stock to reserve" });
    const [batch] = await tx.select().from(batchLedger).where(eq(batchLedger.id, batchId)).limit(1);
    const qtyReservedAfter = batch.qtyReserved ?? 0;
    await tx.insert(stockMovements).values({ batchId, storeId, movementType: "sale_reserve", qty, qtyBefore: batch.qtyOnHand ?? 0, qtyAfter: batch.qtyOnHand ?? 0, referenceType: "reservation", referenceId: null, reason: "reservation", performedBy: actor?.actorId ?? 0 });
    await logAudit({ action: "inventory.reserve", entityType: "batch_ledger", entityId: batchId, actorId: actor?.actorId ?? undefined, actorRole: actor?.actorRole ?? undefined, source: actor?.source ?? "system", beforeJson: { qtyReserved: (batch.qtyReserved ?? 0) - qty }, afterJson: { qtyReserved: qtyReservedAfter }, reason: "atomic reservation", metadata: { qty } });
    return { batchId, qtyReservedAfter };
  });
}

export async function releaseReservedAtomic(batchId: number, storeId: number, qty: number, actor?: StockActor) {
  const db = await getDb();
  const { batchLedger, stockMovements } = await import("../../drizzle/schema");
  return db.transaction(async (tx) => {
    const sql = "UPDATE batch_ledger SET qtyReserved = GREATEST(COALESCE(qtyReserved,0) - ?, 0) WHERE id = ? AND COALESCE(qtyReserved,0) >= ?";
    const [res]: any = await (tx as any).execute(sql, [qty, batchId, qty]);
    if (!res || res.affectedRows === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No reserved quantity available to release" });
    const [batch] = await tx.select().from(batchLedger).where(eq(batchLedger.id, batchId)).limit(1);
    await tx.insert(stockMovements).values({ batchId, storeId, movementType: "cancellation_release", qty: -qty, qtyBefore: batch.qtyOnHand ?? 0, qtyAfter: batch.qtyOnHand ?? 0, referenceType: "reservation_release", referenceId: null, reason: "reservation_release", performedBy: actor?.actorId ?? 0 });
    await logAudit({ action: "inventory.release_reservation", entityType: "batch_ledger", entityId: batchId, actorId: actor?.actorId ?? undefined, actorRole: actor?.actorRole ?? undefined, source: actor?.source ?? "system", beforeJson: {}, afterJson: {}, reason: "release reserved", metadata: { qty } });
    return { batchId };
  });
}

export async function consumeReservedBatchAtomic(batchId: number, storeId: number, qty: number, actor?: StockActor, opts?: { referenceType?: string; referenceId?: number; reason?: string }) {
  const db = await getDb();
  const { batchLedger, stockMovements } = await import("../../drizzle/schema");
  return db.transaction(async (tx) => {
    // Ensure qtyReserved >= qty before consuming
    const sql = "UPDATE batch_ledger SET qtyOnHand = COALESCE(qtyOnHand,0) - ?, qtyReserved = COALESCE(qtyReserved,0) - ? WHERE id = ? AND COALESCE(qtyReserved,0) >= ? AND COALESCE(qtyOnHand,0) - COALESCE(qtyReserved,0) >= 0";
    const [res]: any = await (tx as any).execute(sql, [qty, qty, batchId, qty]);
    if (!res || res.affectedRows === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Unable to consume reserved quantity (insufficient reserved or on-hand)" });
    const [batch] = await tx.select().from(batchLedger).where(eq(batchLedger.id, batchId)).limit(1);
    const qtyBefore = (batch.qtyOnHand ?? 0) + qty; // since we subtracted
    const qtyAfter = batch.qtyOnHand ?? 0;
    await tx.insert(stockMovements).values({ batchId, storeId, movementType: "sale_fulfil", qty: -qty, qtyBefore, qtyAfter, referenceType: opts?.referenceType ?? "sale", referenceId: opts?.referenceId ?? null, reason: opts?.reason ?? "consume reserved", performedBy: actor?.actorId ?? 0 });
    await logAudit({ action: "inventory.consume_reserved", entityType: "batch_ledger", entityId: batchId, actorId: actor?.actorId ?? undefined, actorRole: actor?.actorRole ?? undefined, source: actor?.source ?? "system", beforeJson: { qtyBefore }, afterJson: { qtyAfter }, reason: opts?.reason ?? "consume_reserved", metadata: { qty } });
    return { batchId, qtyAfter };
  });
}

export async function transferStock(input: {
  sourceBatchId: number;
  sourceStoreId: number;
  destinationBatchId: number;
  destinationStoreId: number;
  qty: number;
  referenceId: number;
  reason?: string;
  actor: StockActor;
  productId?: number;
}) {
  const qty = Math.abs(input.qty);
  const db = await getDb();
  const { batchLedger, stockMovements } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const { sourceMovement, destinationMovement } = await db.transaction(async (tx: any) => {
    const [sourceBatch] = await tx.select().from(batchLedger).where(eq(batchLedger.id, input.sourceBatchId)).limit(1);
    const [destinationBatch] = await tx.select().from(batchLedger).where(eq(batchLedger.id, input.destinationBatchId)).limit(1);
    if (!sourceBatch || !destinationBatch) throw new TRPCError({ code: "NOT_FOUND", message: "Transfer batch not found" });
    const sourceBefore = sourceBatch.qtyOnHand ?? 0;
    const sourceAfter = sourceBefore - qty;
    await assertNoNegativeStock(sourceAfter);
    await tx.update(batchLedger).set({ qtyOnHand: sourceAfter }).where(eq(batchLedger.id, input.sourceBatchId));
    await tx.insert(stockMovements).values({ batchId: input.sourceBatchId, storeId: input.sourceStoreId, movementType: "stock_adjustment", qty: -qty, qtyBefore: sourceBefore, qtyAfter: sourceAfter, referenceType: "stock_transfer", referenceId: input.referenceId, reason: input.reason ?? "Transfer out", performedBy: input.actor.actorId ?? 0 });
    const destBefore = destinationBatch.qtyOnHand ?? 0;
    const destAfter = destBefore + qty;
    await tx.update(batchLedger).set({ qtyOnHand: destAfter }).where(eq(batchLedger.id, input.destinationBatchId));
    await tx.insert(stockMovements).values({ batchId: input.destinationBatchId, storeId: input.destinationStoreId, movementType: "stock_adjustment", qty, qtyBefore: destBefore, qtyAfter: destAfter, referenceType: "stock_transfer", referenceId: input.referenceId, reason: input.reason ?? "Transfer in", performedBy: input.actor.actorId ?? 0 });
    return { sourceMovement: { qtyBefore: sourceBefore, qtyAfter: sourceAfter }, destinationMovement: { qtyBefore: destBefore, qtyAfter: destAfter } };
  });
  await logAudit({
    action: "inventory.transfer.completed",
    entityType: "stock_transfer",
    entityId: input.referenceId,
    actorId: input.actor.actorId ?? undefined,
    actorRole: input.actor.actorRole ?? undefined,
    source: input.actor.source ?? "admin",
    beforeJson: { sourceQtyBefore: sourceMovement.qtyBefore, destinationQtyBefore: destinationMovement.qtyBefore },
    afterJson: { sourceQtyAfter: sourceMovement.qtyAfter, destinationQtyAfter: destinationMovement.qtyAfter, qty },
    reason: input.reason,
    metadata: { sourceBatchId: input.sourceBatchId, destinationBatchId: input.destinationBatchId, sourceStoreId: input.sourceStoreId, destinationStoreId: input.destinationStoreId, productId: input.productId },
  });
  return { sourceMovement, destinationMovement };
}
