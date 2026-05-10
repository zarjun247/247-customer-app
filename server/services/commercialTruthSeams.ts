import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { batchLedger, counterPayments, paymentRecords, purchaseInvoices, purchaseLines, refunds, saleLines, sales } from "../../drizzle/schema";
import { getDb } from "../db";
import { reserveInvoiceNumber } from "./invoiceNumbering";
import { createMutationFingerprint, withIdempotency } from "./idempotencyService";
import { createBatchWithOpeningStock, decreaseStockForSaleConfirmation, increaseStockForPurchaseCommit } from "./stockInvariant";
import { appendCommercialEventBestEffort } from "./commercialLifecycle";

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function duplicateResult<T extends Record<string, unknown>>(result: T): T & { idempotent: true; duplicate: true; status: "already_processed" } {
  return { ...result, idempotent: true, duplicate: true, status: "already_processed" };
}

export async function commitPurchaseInvoiceExactlyOnce(input: { invoiceId: number; idempotencyKey: string; actorId: number; actorRole?: string | null }) {
  const db = requireDb(await getDb());
  return withIdempotency({
    key: input.idempotencyKey,
    scope: "purchase.commitInvoice",
    operationType: "purchase_commit_invoice",
    actorId: input.actorId,
    entityType: "purchase_invoice",
    entityId: String(input.invoiceId),
    requestHash: createMutationFingerprint({ invoiceId: input.invoiceId }),
  }, async () => {
    const [invoice] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.invoiceId)).limit(1);
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
    if (invoice.status === "committed") return duplicateResult({ success: true, invoiceId: input.invoiceId, committed: false });
    if (invoice.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice not in draft state" });

    const [claim] = await db.update(purchaseInvoices).set({ status: "committed", committedAt: new Date(), approvedBy: input.actorId, approvedAt: new Date() }).where(and(eq(purchaseInvoices.id, input.invoiceId), eq(purchaseInvoices.status, "draft")));
    if (Number((claim as { affectedRows?: number }).affectedRows ?? 0) !== 1) return duplicateResult({ success: true, invoiceId: input.invoiceId, committed: false });

    const lines = await db.select().from(purchaseLines).where(eq(purchaseLines.purchaseInvoiceId, input.invoiceId));
    if (!lines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No lines to commit" });
    for (const line of lines) {
      const qty = Number(line.qty ?? 0) + Number(line.freeQty ?? 0);
      const [existing] = await db.select().from(batchLedger).where(and(eq(batchLedger.storeId, invoice.storeId), eq(batchLedger.productId, line.productId), eq(batchLedger.batchNo, line.batchNo))).limit(1);
      const ledgerId = existing?.id ?? (await createBatchWithOpeningStock({
        batch: {
          productId: line.productId,
          storeId: invoice.storeId,
          supplierId: invoice.supplierId,
          batchNo: line.batchNo,
          expiryDate: line.expiryDate,
          mrp: String(line.mrp),
          purchaseRate: String(line.purchaseRate),
          saleRate: String(line.saleRate ?? line.mrp),
          qtyOnHand: 0,
          purchaseInvoiceId: invoice.id,
          storageCondition: "ambient",
          coldChainFlag: false,
          expiryBucket: "normal",
          status: "active",
          createdBy: input.actorId,
        },
        actor: { actorId: input.actorId, actorRole: input.actorRole, source: "service" },
      })).batchId;
      await increaseStockForPurchaseCommit({ batchId: ledgerId, storeId: invoice.storeId, qtyDelta: qty, referenceType: "purchase_invoice", referenceId: invoice.id, reason: `Purchase commit ${invoice.invoiceNo}`, actor: { actorId: input.actorId, actorRole: input.actorRole, source: "service" }, productId: line.productId });
    }
    await appendCommercialEventBestEffort({ aggregateType: "purchase_invoice", aggregateId: input.invoiceId, eventType: "purchase_committed", actorType: "staff", actorId: input.actorId, storeId: invoice.storeId, eventPayload: { invoiceNo: invoice.invoiceNo }, idempotencyKey: input.idempotencyKey });
    return { success: true, invoiceId: input.invoiceId, committed: true, status: "processed" as const };
  });
}

export async function confirmSaleExactlyOnce(input: { saleId: string; idempotencyKey: string; actorId: number; actorRole?: string | null; paymentMode: "cash" | "upi" | "card" | "credit" | "mixed"; paymentRef?: string | null }) {
  const db = requireDb(await getDb());
  return withIdempotency({ key: input.idempotencyKey, scope: "sales.confirmSale", operationType: "sale_confirm", actorId: input.actorId, entityType: "sale", entityId: input.saleId, requestHash: createMutationFingerprint({ saleId: input.saleId, paymentMode: input.paymentMode, paymentRef: input.paymentRef ?? null }) }, async () => {
    const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
    if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found" });
    if (sale.status === "confirmed") return duplicateResult({ success: true, saleId: input.saleId, billNo: sale.billNo, confirmed: false });
    if (sale.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Sale not in draft state" });
    const finalBillNo = sale.billNo.startsWith("DRF-") ? await reserveInvoiceNumber(db, sale.storeId, "sale_invoice") : sale.billNo;
    const [claim] = await db.update(sales).set({ status: "confirmed", billNo: finalBillNo, paymentMode: input.paymentMode, paymentRef: input.paymentRef ?? null, confirmedAt: Date.now(), updatedAt: Date.now() }).where(and(eq(sales.id, input.saleId), eq(sales.status, "draft")));
    if (Number((claim as { affectedRows?: number }).affectedRows ?? 0) !== 1) {
      const [current] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      return duplicateResult({ success: true, saleId: input.saleId, billNo: current?.billNo ?? finalBillNo, confirmed: false });
    }
    const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, input.saleId));
    for (const line of lines) {
      if (line.batchLedgerId) await decreaseStockForSaleConfirmation({ batchId: Number(line.batchLedgerId), storeId: Number(sale.storeId), qtyDelta: -Number(line.qty), referenceType: "sale", referenceId: Number.parseInt(input.saleId, 10) || 0, reason: `Bill ${finalBillNo}`, actor: { actorId: input.actorId, actorRole: input.actorRole, source: "service" }, productId: Number(line.productId) });
    }
    await db.insert(counterPayments).values({ id: randomUUID(), saleId: input.saleId, paymentMode: input.paymentMode, amount: sale.total, paymentRef: input.paymentRef ?? null, status: "confirmed", createdBy: String(input.actorId), createdAt: Date.now() });
    await appendCommercialEventBestEffort({ aggregateType: "sale", aggregateId: input.saleId, eventType: "order_confirmed", actorType: "staff", actorId: input.actorId, storeId: sale.storeId, saleId: input.saleId, invoiceId: finalBillNo, eventPayload: { billNo: finalBillNo }, idempotencyKey: input.idempotencyKey });
    return { success: true, saleId: input.saleId, billNo: finalBillNo, confirmed: true, status: "processed" as const };
  });
}

export async function settleProviderRefundExactlyOnce(input: { gatewayOrderId: string; providerRefundId: string; amountPaise: number; idempotencyKey: string; reason?: string | null; actorId?: number | null }) {
  const db = requireDb(await getDb());
  return withIdempotency({ key: input.idempotencyKey, scope: "refund.settle", operationType: "refund_settle", actorId: input.actorId ?? null, entityType: "payment", entityId: input.gatewayOrderId, requestHash: createMutationFingerprint({ gatewayOrderId: input.gatewayOrderId, providerRefundId: input.providerRefundId, amountPaise: input.amountPaise }) }, async () => db.transaction(async (tx) => {
    const [payment] = await tx.select().from(paymentRecords).where(eq(paymentRecords.gatewayOrderId, input.gatewayOrderId)).for("update").limit(1);
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment record not found" });
    const [existing] = await tx.select().from(refunds).where(and(eq(refunds.provider, "razorpay"), eq(refunds.providerRefundId, input.providerRefundId))).limit(1);
    if (existing) return duplicateResult({ success: true, refundId: existing.id, refunded: false });
    const [totals] = await tx.select({ total: sql<number>`COALESCE(SUM(${refunds.amountPaise}), 0)` }).from(refunds).where(and(eq(refunds.paymentId, payment.id), inArray(refunds.status, ["pending", "success"])));
    if (Number(totals?.total ?? 0) + input.amountPaise > Number(payment.amount ?? 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Refund exceeds available paid amount" });
    const [result] = await tx.insert(refunds).values({ paymentId: payment.id, orderId: payment.orderId, provider: "razorpay", providerRefundId: input.providerRefundId, amountPaise: input.amountPaise, status: "success", reason: input.reason ?? null, initiatedBy: input.actorId ?? null });
    const refundId = Number((result as { insertId?: number }).insertId);
    const newTotal = Number(totals?.total ?? 0) + input.amountPaise;
    await tx.update(paymentRecords).set({ status: newTotal >= Number(payment.amount ?? 0) ? "refunded" : payment.status, refundId: input.providerRefundId, refundedAt: newTotal >= Number(payment.amount ?? 0) ? new Date() : payment.refundedAt }).where(eq(paymentRecords.id, payment.id));
    await appendCommercialEventBestEffort({ aggregateType: "refund", aggregateId: refundId, eventType: "refund_completed", actorType: "provider", orderId: payment.orderId, paymentId: payment.id, refundId, eventPayload: { amountPaise: input.amountPaise, providerRefundId: input.providerRefundId }, idempotencyKey: input.idempotencyKey, correlationId: input.gatewayOrderId });
    return { success: true, refundId, refunded: true, status: "processed" as const };
  }));
}
