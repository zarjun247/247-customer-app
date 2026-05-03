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
  const [result] = await db.insert(batchLedger).values(input.batch);
  const batchId = result.insertId;
  if (input.batch.qtyOnHand > 0) {
    await applyStockMovement({ batchId, storeId: input.batch.storeId, qtyDelta: input.batch.qtyOnHand, movementType: "purchase_inward", referenceType: input.batch.purchaseInvoiceId ? "purchase_invoice" : "batch_create", referenceId: input.batch.purchaseInvoiceId ?? batchId, reason: `Batch ${input.batch.batchNo} opening stock`, actor: input.actor, productId: input.batch.productId });
  }
  await logAudit({ action: "inventory.batch_created_with_opening_stock", entityType: "batch_ledger", entityId: batchId, actorId: input.actor.actorId ?? undefined, actorRole: input.actor.actorRole ?? undefined, source: input.actor.source ?? "admin", afterJson: { ...input.batch }, metadata: { openingStockQty: input.batch.qtyOnHand } });
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
  const sourceMovement = await applyStockMovement({
    batchId: input.sourceBatchId,
    storeId: input.sourceStoreId,
    qtyDelta: -qty,
    movementType: "stock_adjustment",
    referenceType: "stock_transfer",
    referenceId: input.referenceId,
    reason: input.reason ?? "Transfer out",
    actor: input.actor,
    productId: input.productId,
  });
  const destinationMovement = await applyStockMovement({
    batchId: input.destinationBatchId,
    storeId: input.destinationStoreId,
    qtyDelta: qty,
    movementType: "stock_adjustment",
    referenceType: "stock_transfer",
    referenceId: input.referenceId,
    reason: input.reason ?? "Transfer in",
    actor: input.actor,
    productId: input.productId,
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
