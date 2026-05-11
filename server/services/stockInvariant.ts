import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { logAudit } from "./audit";

export type StockActor = {
  actorId?: number | null;
  actorRole?: string | null;
  source?: string;
};

async function getDb() {
  const { getDb: _getDb } = await import("../db");
  const db = await _getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

export async function assertNoNegativeStock(qtyAfter: number) {
  if (qtyAfter < 0)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Insufficient stock: negative quantity not allowed",
    });
}

export async function getCurrentBatchQty(
  db: Awaited<ReturnType<typeof getDb>>,
  batchId: number
) {
  const { batchLedger } = await import("../../drizzle/schema");
  const [batch] = await db
    .select()
    .from(batchLedger)
    .where(eq(batchLedger.id, batchId))
    .limit(1);
  if (!batch)
    throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
  return batch;
}

export async function applyStockMovement(input: {
  // Optional outer transaction — when provided the caller's transaction context is reused,
  // avoiding a nested transaction that would break atomicity with the surrounding operation.
  // When absent, this function starts its own transaction (original behaviour, fully backward-compatible).
  tx?: any;
  batchId: number;
  storeId: number;
  qtyDelta: number;
  movementType:
    | "purchase_inward"
    | "sale_fulfil"
    | "sale_return"
    | "purchase_return"
    | "stock_adjustment"
    | "quarantine"
    | "disposal";
  referenceType?: string;
  referenceId?: number;
  reason?: string;
  actor: StockActor;
  productId?: number;
}) {
  const { batchLedger, stockMovements } = await import("../../drizzle/schema");

  const runMovement = async (conn: any) => {
    const [batch] = await conn
      .select()
      .from(batchLedger)
      .where(eq(batchLedger.id, input.batchId))
      .limit(1);
    if (!batch)
      throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
    const qtyBefore = batch.qtyOnHand ?? 0;
    const qtyAfter = qtyBefore + input.qtyDelta;
    await assertNoNegativeStock(qtyAfter);
    await conn
      .update(batchLedger)
      .set({ qtyOnHand: qtyAfter })
      .where(eq(batchLedger.id, input.batchId));
    await conn.insert(stockMovements).values({
      batchId: input.batchId,
      storeId: input.storeId,
      movementType: input.movementType,
      qty: input.qtyDelta,
      qtyBefore,
      qtyAfter,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      reason: input.reason,
      performedBy: input.actor.actorId ?? 0,
    });
    // logAudit uses its own connection (best-effort); intentionally outside the transaction context.
    await logAudit({
      action: `stock.${input.movementType}`,
      entityType: "batch_ledger",
      entityId: input.batchId,
      actorId: input.actor.actorId ?? undefined,
      actorRole: input.actor.actorRole ?? undefined,
      source: input.actor.source ?? "admin",
      beforeJson: { qtyOnHand: qtyBefore },
      afterJson: { qtyOnHand: qtyAfter },
      reason: input.reason,
      metadata: {
        storeId: input.storeId,
        qtyDelta: input.qtyDelta,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        productId: input.productId,
      },
    });
    return { qtyBefore, qtyAfter };
  };

  if (input.tx) {
    // Caller owns the transaction — use it directly without starting a nested one.
    return runMovement(input.tx);
  }
  const db = await getDb();
  return db.transaction(runMovement);
}

export const increaseStockForPurchaseCommit = (
  i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">
) => applyStockMovement({ ...i, movementType: "purchase_inward" });
export const decreaseStockForSaleConfirmation = (
  i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">
) => applyStockMovement({ ...i, movementType: "sale_fulfil" });
export const reverseStockForSaleReturn = (
  i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">
) => applyStockMovement({ ...i, movementType: "sale_return" });
export const decreaseStockForPurchaseReturn = (
  i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">
) => applyStockMovement({ ...i, movementType: "purchase_return" });
export const adjustStock = (
  i: Omit<Parameters<typeof applyStockMovement>[0], "movementType"> & {
    adjustmentType: "increase" | "decrease";
  }
) =>
  applyStockMovement({
    ...i,
    qtyDelta:
      i.adjustmentType === "increase"
        ? Math.abs(i.qtyDelta)
        : -Math.abs(i.qtyDelta),
    movementType: "stock_adjustment",
  });
export const quarantineBatch = (
  i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">
) =>
  applyStockMovement({
    ...i,
    movementType: "quarantine",
    qtyDelta: -Math.abs(i.qtyDelta),
  });
export const disposeBatch = (
  i: Omit<Parameters<typeof applyStockMovement>[0], "movementType">
) =>
  applyStockMovement({
    ...i,
    movementType: "disposal",
    qtyDelta: -Math.abs(i.qtyDelta),
  });

export async function releaseQuarantine(input: {
  batchId: number;
  qty: number;
  note?: string;
  actor: StockActor;
}) {
  const db = await getDb();
  const { batchLedger, stockMovements } = await import("../../drizzle/schema");
  return db.transaction(async tx => {
    const [batch] = await tx
      .select()
      .from(batchLedger)
      .where(eq(batchLedger.id, input.batchId))
      .limit(1);
    if (!batch)
      throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
    const qty = Math.abs(input.qty);
    if ((batch.qtyQuarantined ?? 0) < qty)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Only ${batch.qtyQuarantined} units quarantined`,
      });
    const qtyBefore = batch.qtyOnHand ?? 0;
    const qtyAfter = qtyBefore + qty;
    const qtyQuarantinedAfter = (batch.qtyQuarantined ?? 0) - qty;
    await assertNoNegativeStock(qtyAfter);
    await assertNoNegativeStock(qtyQuarantinedAfter);
    await tx
      .update(batchLedger)
      .set({
        qtyOnHand: qtyAfter,
        qtyQuarantined: qtyQuarantinedAfter,
        status: "active",
      })
      .where(eq(batchLedger.id, input.batchId));
    await tx
      .insert(stockMovements)
      .values({
        batchId: input.batchId,
        storeId: batch.storeId,
        movementType: "audit_correction",
        qty,
        qtyBefore,
        qtyAfter,
        reason: `Release from quarantine. ${input.note ?? ""}`.trim(),
        performedBy: input.actor.actorId ?? 0,
        referenceType: "batch_quarantine",
        referenceId: input.batchId,
      });
    await logAudit({
      action: "inventory.batch_released_from_quarantine",
      entityType: "batch_ledger",
      entityId: input.batchId,
      actorId: input.actor.actorId ?? undefined,
      actorRole: input.actor.actorRole ?? undefined,
      source: input.actor.source ?? "admin",
      beforeJson: {
        qtyOnHand: qtyBefore,
        qtyQuarantined: batch.qtyQuarantined,
      },
      afterJson: { qtyOnHand: qtyAfter, qtyQuarantined: qtyQuarantinedAfter },
      reason: input.note,
      metadata: {
        qtyReleased: qty,
        storeId: batch.storeId,
        productId: batch.productId,
      },
    });
    return { qtyBefore, qtyAfter, qtyQuarantinedAfter };
  });
}

export async function createBatchWithOpeningStock(input: {
  // Optional outer transaction — reused when called from within an already-open transaction.
  tx?: any;
  batch: {
    productId: number;
    variantId?: number;
    storeId: number;
    supplierId?: number;
    batchNo: string;
    mfgDate?: Date;
    expiryDate: Date;
    mrp: string;
    purchaseRate: string;
    saleRate: string;
    schemeDiscount?: string;
    cashDiscount?: string;
    landingCost?: string;
    margin?: string;
    qtyOnHand: number;
    internalBarcode?: string;
    manufacturerBarcode?: string;
    purchaseInvoiceId?: number;
    grnId?: number;
    storageCondition: "ambient" | "cold_chain" | "controlled" | "frozen";
    coldChainFlag: boolean;
    expiryBucket:
      | "normal"
      | "warning"
      | "critical"
      | "quarantine_candidate"
      | "expired";
    status:
      | "active"
      | "quarantined"
      | "depleted"
      | "expired"
      | "recalled"
      | "damaged"
      | "returned_to_supplier";
    createdBy: number;
  };
  actor: StockActor;
}) {
  const { batchLedger } = await import("../../drizzle/schema");
  const openingQty = Math.max(0, input.batch.qtyOnHand ?? 0);

  const run = async (conn: any) => {
    const [result] = await conn
      .insert(batchLedger)
      .values({ ...input.batch, qtyOnHand: 0 });
    const batchId = result.insertId;
    if (openingQty > 0) {
      await applyStockMovement({
        tx: conn,
        batchId,
        storeId: input.batch.storeId,
        qtyDelta: openingQty,
        movementType: "purchase_inward",
        referenceType: input.batch.purchaseInvoiceId
          ? "purchase_invoice"
          : "batch_create",
        referenceId: input.batch.purchaseInvoiceId ?? batchId,
        reason: `Batch ${input.batch.batchNo} opening stock`,
        actor: input.actor,
        productId: input.batch.productId,
      });
    }
    return batchId;
  };

  const batchId = input.tx
    ? await run(input.tx)
    : await (await getDb()).transaction(run);
  // logAudit uses its own connection (best-effort); intentionally outside the transaction context.
  await logAudit({
    action: "inventory.batch_created_with_opening_stock",
    entityType: "batch_ledger",
    entityId: batchId,
    actorId: input.actor.actorId ?? undefined,
    actorRole: input.actor.actorRole ?? undefined,
    source: input.actor.source ?? "admin",
    afterJson: { ...input.batch },
    metadata: { openingStockQty: openingQty },
  });
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
  const [batch] = await db
    .select()
    .from(batchLedger)
    .where(eq(batchLedger.id, input.batchId))
    .limit(1);
  if (!batch)
    throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
  const qtyDelta = input.countedQty - (batch.qtyOnHand ?? 0);
  const movement = await applyStockMovement({
    batchId: input.batchId,
    storeId: input.storeId,
    qtyDelta,
    movementType: "stock_adjustment",
    referenceType: "stock_audit",
    referenceId: input.auditId,
    reason: "Stock audit correction",
    actor: input.actor,
    productId: input.productId ?? batch.productId,
  });
  await db
    .update(stockAuditLines)
    .set({ status: "adjusted" })
    .where(eq(stockAuditLines.id, input.lineId));
  await logAudit({
    action: "inventory.stock_audit_corrected",
    entityType: "stock_audit",
    entityId: input.auditId,
    actorId: input.actor.actorId ?? undefined,
    actorRole: input.actor.actorRole ?? undefined,
    source: input.actor.source ?? "admin",
    beforeJson: { qtyOnHand: movement.qtyBefore },
    afterJson: { qtyOnHand: movement.qtyAfter },
    metadata: { lineId: input.lineId, batchId: input.batchId, qtyDelta },
  });
  return movement;
}

export async function receiveTransferStockAtomic(input: {
  transferId: number;
  actor: StockActor;
}) {
  const db = await getDb();
  const { batchLedger, stockMovements, stockReservations, stockTransfers } =
    await import("../../drizzle/schema");
  const { sourceMovement, destinationMovement, destinationBatchId, transfer } =
    await db.transaction(async (tx: any) => {
      const [lockedTransfer] = await tx
        .select()
        .from(stockTransfers)
        .where(eq(stockTransfers.id, input.transferId))
        .for("update")
        .limit(1);
      if (!lockedTransfer || lockedTransfer.status !== "in_transit")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transfer is not in transit",
        });
      const [src] = await tx
        .select()
        .from(batchLedger)
        .where(eq(batchLedger.id, lockedTransfer.batchId))
        .for("update")
        .limit(1);
      if (!src)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Source batch not found",
        });
      if (
        src.storeId !== lockedTransfer.fromStoreId ||
        src.productId !== lockedTransfer.productId
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transfer source batch mismatch",
        });
      const qty = Number(lockedTransfer.qtyTransferred ?? 0);
      const reservedBefore = Number(src.qtyReserved ?? 0);
      const sourceBefore = Number(src.qtyOnHand ?? 0);
      if (qty <= 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transfer quantity must be positive",
        });
      const transferReservations = await tx
        .select()
        .from(stockReservations)
        .where(
          and(
            eq(stockReservations.batchId, lockedTransfer.batchId),
            eq(stockReservations.storeId, lockedTransfer.fromStoreId),
            eq(stockReservations.productId, lockedTransfer.productId),
            eq(stockReservations.status, "active"),
            eq(stockReservations.releaseReason, "transfer_initiated")
          )
        )
        .for("update");
      const transferReservation = transferReservations.find(
        (reservation: any) =>
          Number(reservation.qtyReserved ?? reservation.qty ?? 0) === qty
      );
      if (reservedBefore < qty || !transferReservation)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Transfer reservation missing or already released",
        });
      const sourceAfter = sourceBefore - qty;
      await assertNoNegativeStock(sourceAfter);
      const [created] = await tx.insert(batchLedger).values({
        productId: src.productId,
        variantId: src.variantId,
        storeId: lockedTransfer.toStoreId,
        supplierId: src.supplierId,
        batchNo: src.batchNo,
        mfgDate: src.mfgDate,
        expiryDate: src.expiryDate,
        mrp: src.mrp,
        purchaseRate: src.purchaseRate,
        saleRate: src.saleRate,
        qtyOnHand: qty,
        storageCondition: src.storageCondition,
        coldChainFlag: src.coldChainFlag,
        expiryBucket: src.expiryBucket,
        status: "active",
        createdBy: input.actor.actorId ?? 0,
      });
      const destinationBatchId = Number(created.insertId);
      const destinationBefore = Number(0);
      const destinationAfter = destinationBefore + qty;
      await tx
        .update(batchLedger)
        .set({ qtyOnHand: sourceAfter, qtyReserved: reservedBefore - qty })
        .where(
          and(
            eq(batchLedger.id, lockedTransfer.batchId),
            sql`${batchLedger.qtyOnHand} >= ${qty}`,
            sql`${batchLedger.qtyReserved} >= ${qty}`
          )
        );
      await tx
        .update(stockReservations)
        .set({
          status: "consumed",
          qtyReserved: 0,
          releaseReason: `transfer_receive_${input.transferId}`,
          fulfilledAt: new Date(),
        })
        .where(
          and(
            eq(stockReservations.id, transferReservation.id),
            eq(stockReservations.status, "active")
          )
        );
      await tx.insert(stockMovements).values([
        {
          batchId: lockedTransfer.batchId,
          storeId: lockedTransfer.fromStoreId,
          movementType: "stock_transfer",
          qty: -qty,
          qtyBefore: sourceBefore,
          qtyAfter: sourceAfter,
          referenceType: "stock_transfer",
          referenceId: input.transferId,
          reason: `Transfer receive ${input.transferId}`,
          performedBy: input.actor.actorId ?? 0,
        },
        {
          batchId: destinationBatchId,
          storeId: lockedTransfer.toStoreId,
          movementType: "stock_transfer",
          qty,
          qtyBefore: destinationBefore,
          qtyAfter: destinationAfter,
          referenceType: "stock_transfer",
          referenceId: input.transferId,
          reason: `Transfer receive ${input.transferId}`,
          performedBy: input.actor.actorId ?? 0,
        },
      ]);
      await tx
        .update(stockTransfers)
        .set({
          status: "received",
          receivedBy: input.actor.actorId ?? 0,
          receivedAt: new Date(),
        })
        .where(eq(stockTransfers.id, input.transferId));
      return {
        destinationBatchId,
        sourceMovement: { qtyBefore: sourceBefore, qtyAfter: sourceAfter },
        destinationMovement: {
          qtyBefore: destinationBefore,
          qtyAfter: destinationAfter,
        },
        transfer: lockedTransfer,
      };
    });
  await logAudit({
    action: "inventory.transfer.completed",
    entityType: "stock_transfer",
    entityId: input.transferId,
    actorId: input.actor.actorId ?? undefined,
    actorRole: input.actor.actorRole ?? undefined,
    source: input.actor.source ?? "admin",
    beforeJson: {
      sourceQtyBefore: sourceMovement.qtyBefore,
      destinationQtyBefore: destinationMovement.qtyBefore,
    },
    afterJson: {
      sourceQtyAfter: sourceMovement.qtyAfter,
      destinationQtyAfter: destinationMovement.qtyAfter,
      qty: transfer.qtyTransferred,
    },
    reason: `Transfer receive ${input.transferId}`,
    metadata: {
      sourceBatchId: transfer.batchId,
      destinationBatchId,
      sourceStoreId: transfer.fromStoreId,
      destinationStoreId: transfer.toStoreId,
      productId: transfer.productId,
    },
  });
  return { destinationBatchId, sourceMovement, destinationMovement };
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
  const { sourceMovement, destinationMovement } = await db.transaction(
    async (tx: any) => {
      const [sourceBatch] = await tx
        .select()
        .from(batchLedger)
        .where(eq(batchLedger.id, input.sourceBatchId))
        .limit(1);
      const [destinationBatch] = await tx
        .select()
        .from(batchLedger)
        .where(eq(batchLedger.id, input.destinationBatchId))
        .limit(1);
      if (!sourceBatch || !destinationBatch)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transfer batch not found",
        });
      const sourceBefore = sourceBatch.qtyOnHand ?? 0;
      const sourceAfter = sourceBefore - qty;
      await assertNoNegativeStock(sourceAfter);
      await tx
        .update(batchLedger)
        .set({ qtyOnHand: sourceAfter })
        .where(eq(batchLedger.id, input.sourceBatchId));
      await tx
        .insert(stockMovements)
        .values({
          batchId: input.sourceBatchId,
          storeId: input.sourceStoreId,
          movementType: "stock_adjustment",
          qty: -qty,
          qtyBefore: sourceBefore,
          qtyAfter: sourceAfter,
          referenceType: "stock_transfer",
          referenceId: input.referenceId,
          reason: input.reason ?? "Transfer out",
          performedBy: input.actor.actorId ?? 0,
        });
      const destBefore = destinationBatch.qtyOnHand ?? 0;
      const destAfter = destBefore + qty;
      await tx
        .update(batchLedger)
        .set({ qtyOnHand: destAfter })
        .where(eq(batchLedger.id, input.destinationBatchId));
      await tx
        .insert(stockMovements)
        .values({
          batchId: input.destinationBatchId,
          storeId: input.destinationStoreId,
          movementType: "stock_adjustment",
          qty,
          qtyBefore: destBefore,
          qtyAfter: destAfter,
          referenceType: "stock_transfer",
          referenceId: input.referenceId,
          reason: input.reason ?? "Transfer in",
          performedBy: input.actor.actorId ?? 0,
        });
      return {
        sourceMovement: { qtyBefore: sourceBefore, qtyAfter: sourceAfter },
        destinationMovement: { qtyBefore: destBefore, qtyAfter: destAfter },
      };
    }
  );
  await logAudit({
    action: "inventory.transfer.completed",
    entityType: "stock_transfer",
    entityId: input.referenceId,
    actorId: input.actor.actorId ?? undefined,
    actorRole: input.actor.actorRole ?? undefined,
    source: input.actor.source ?? "admin",
    beforeJson: {
      sourceQtyBefore: sourceMovement.qtyBefore,
      destinationQtyBefore: destinationMovement.qtyBefore,
    },
    afterJson: {
      sourceQtyAfter: sourceMovement.qtyAfter,
      destinationQtyAfter: destinationMovement.qtyAfter,
      qty,
    },
    reason: input.reason,
    metadata: {
      sourceBatchId: input.sourceBatchId,
      destinationBatchId: input.destinationBatchId,
      sourceStoreId: input.sourceStoreId,
      destinationStoreId: input.destinationStoreId,
      productId: input.productId,
    },
  });
  return { sourceMovement, destinationMovement };
}
