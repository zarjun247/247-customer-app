/**
 * purchaseRouter.ts — PART 5: Purchase Module
 * Full purchase flow: invoices, lines, GST calc, commit, returns, payments, reports.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { logAudit } from "../services/audit";
import { increaseStockForPurchaseCommit, decreaseStockForPurchaseReturn } from "../services/stockInvariant";
import { recordSupplierPayable, recordSupplierPayment, getSupplierOutstanding } from "../services/supplierLedger";
import { createLabelPrintJob, generateInternalBarcode, getBarcodeLabelPayload, registerBarcodeAlias } from "../services/barcodeService";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function requirePurchase(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager", "purchase_manager", "pharmacist", "inventory_operator"];
  if (!role || !allowed.includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Purchase access required" });
}
function requireManager(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager", "purchase_manager"];
  if (!role || !allowed.includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Manager role required" });
}

function calcGst(purchaseRate: number, gstRate: number, qty: number, schemeDiscount: number, cashDiscount: number) {
  const baseAmount = purchaseRate * qty;
  const schemeDis = baseAmount * (schemeDiscount / 100);
  const cashDis = (baseAmount - schemeDis) * (cashDiscount / 100);
  const taxableAmount = baseAmount - schemeDis - cashDis;
  const gstAmount = taxableAmount * (gstRate / 100);
  const landingCost = qty > 0 ? (taxableAmount + gstAmount) / qty : 0;
  return {
    baseAmount: +baseAmount.toFixed(2),
    schemeDis: +schemeDis.toFixed(2),
    cashDis: +cashDis.toFixed(2),
    taxableAmount: +taxableAmount.toFixed(2),
    gstAmount: +gstAmount.toFixed(2),
    landingCost: +landingCost.toFixed(2),
  };
}

function computeExpiryBucket(expiryDate: Date | string | null): "normal" | "warning" | "critical" | "quarantine_candidate" | "expired" {
  if (!expiryDate) return "normal";
  const expiry = new Date(expiryDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return "expired";
  if (days <= 30) return "quarantine_candidate";
  if (days <= 60) return "critical";
  if (days <= 90) return "warning";
  return "normal";
}

async function recalcInvoiceTotals(db: Awaited<ReturnType<typeof getDbSafe>>, invoiceId: number) {
  const { purchaseLines, purchaseInvoices } = await import("../../drizzle/schema");
  const lines = await db.select().from(purchaseLines).where(eq(purchaseLines.purchaseInvoiceId, invoiceId));
  let totalAmount = 0, totalGst = 0, totalDiscount = 0;
  for (const l of lines) {
    const pr = parseFloat(l.purchaseRate ?? "0");
    const gr = parseFloat(l.gstRate ?? "12");
    const sd = parseFloat(l.schemeDiscount ?? "0");
    const cd = parseFloat(l.cashDiscount ?? "0");
    const { gstAmount, schemeDis, cashDis } = calcGst(pr, gr, l.qty, sd, cd);
    totalAmount += pr * l.qty;
    totalGst += gstAmount;
    totalDiscount += schemeDis + cashDis;
  }
  const netAmount = totalAmount - totalDiscount + totalGst;
  await db.update(purchaseInvoices).set({ totalAmount: totalAmount.toFixed(2), totalGst: totalGst.toFixed(2), totalDiscount: totalDiscount.toFixed(2), netAmount: netAmount.toFixed(2) }).where(eq(purchaseInvoices.id, invoiceId));
}

export const purchaseRouter = router({

  ensureScannerReadyForBatch: protectedProcedure
    .input(z.object({ productId: z.number(), batchId: z.number().optional(), batchNo: z.string().optional(), storeId: z.number(), expiryDate: z.string().optional(), mrp: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const internalBarcode = generateInternalBarcode({ productId: input.productId, batchId: input.batchId, storeId: input.storeId });
      await registerBarcodeAlias({ barcode: internalBarcode, productId: input.productId, batchId: input.batchId, storeId: input.storeId, aliasType: "internal" });
      const payload = getBarcodeLabelPayload({ productName: `Product-${input.productId}`, batchNo: input.batchNo ?? null, expiryDate: input.expiryDate ?? null, mrp: input.mrp ?? null, internalBarcode, storeId: input.storeId });
      await createLabelPrintJob({ productId: input.productId, batchId: input.batchId ?? null, storeId: input.storeId, labelType: "batch", payloadJson: payload, requestedBy: ctx.user!.id });
      return { internalBarcode, queued: true };
    }),

  listLabelQueue: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }))
    .query(async ({ ctx, input }) => { requirePurchase(ctx.user!.role); const { getLabelPrintQueue } = await import("../services/barcodeService"); return { rows: await getLabelPrintQueue(input.storeId) }; }),

  reprintLabel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => { requirePurchase(ctx.user!.role); const { reprintLabel } = await import("../services/barcodeService"); await reprintLabel(input.id); return { ok: true }; }),

  listInvoices: protectedProcedure
    .input(z.object({ storeId: z.number().optional(), supplierId: z.number().optional(), status: z.enum(["draft","committed","partially_returned","returned","cancelled"]).optional(), invoiceNo: z.string().optional(), dateFrom: z.date().optional(), dateTo: z.date().optional(), limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseInvoices, suppliers, users } = await import("../../drizzle/schema");
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId) conds.push(eq(purchaseInvoices.storeId, input.storeId));
      if (input.supplierId) conds.push(eq(purchaseInvoices.supplierId, input.supplierId));
      if (input.status) conds.push(eq(purchaseInvoices.status, input.status));
      if (input.dateFrom) conds.push(gte(purchaseInvoices.invoiceDate, input.dateFrom));
      if (input.dateTo) conds.push(lte(purchaseInvoices.invoiceDate, input.dateTo));
      const rows = await db.select({ invoice: purchaseInvoices, supplierName: suppliers.supplierName, createdByName: users.name })
        .from(purchaseInvoices).leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id)).leftJoin(users, eq(purchaseInvoices.createdBy, users.id))
        .where(conds.length ? and(...conds) : undefined).orderBy(desc(purchaseInvoices.createdAt)).limit(input.limit).offset(input.offset);
      const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(purchaseInvoices).where(conds.length ? and(...conds) : undefined);
      return { rows, total };
    }),

  getInvoice: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseInvoices, purchaseLines, products, suppliers } = await import("../../drizzle/schema");
      const [row] = await db.select({ invoice: purchaseInvoices, supplierName: suppliers.supplierName }).from(purchaseInvoices).leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id)).where(eq(purchaseInvoices.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db.select({ line: purchaseLines, productName: products.name }).from(purchaseLines).leftJoin(products, eq(purchaseLines.productId, products.id)).where(eq(purchaseLines.purchaseInvoiceId, input.id));
      return { ...row, lines };
    }),

  createInvoice: protectedProcedure
    .input(z.object({ supplierId: z.number(), storeId: z.number(), invoiceNo: z.string().min(1), invoiceDate: z.date(), supplierGstin: z.string().optional(), sourceType: z.enum(["manual","ocr","import","whatsapp"]).default("manual"), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseInvoices } = await import("../../drizzle/schema");
      const [result] = await db.insert(purchaseInvoices).values({ supplierId: input.supplierId, storeId: input.storeId, invoiceNo: input.invoiceNo, invoiceDate: input.invoiceDate, supplierGstin: input.supplierGstin ?? null, sourceType: input.sourceType, notes: input.notes ?? null, createdBy: ctx.user!.id, status: "draft" });
      const id = (result as { insertId: number }).insertId;
      await logAudit({ action: "purchase.created", entityType: "purchase_invoice", entityId: id, afterJson: { invoiceNo: input.invoiceNo } }, ctx);
      return { id };
    }),

  updateInvoice: protectedProcedure
    .input(z.object({ id: z.number(), invoiceNo: z.string().optional(), invoiceDate: z.date().optional(), supplierGstin: z.string().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseInvoices } = await import("../../drizzle/schema");
      const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.id));
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Can only update draft invoices" });
      const updates: Record<string, unknown> = {};
      if (input.invoiceNo) updates.invoiceNo = input.invoiceNo;
      if (input.invoiceDate) updates.invoiceDate = input.invoiceDate;
      if (input.supplierGstin !== undefined) updates.supplierGstin = input.supplierGstin;
      if (input.notes !== undefined) updates.notes = input.notes;
      await db.update(purchaseInvoices).set(updates).where(eq(purchaseInvoices.id, input.id));
      await logAudit({ action: "purchase.updated", entityType: "purchase_invoice", entityId: input.id, beforeJson: inv, afterJson: updates }, ctx);
      return { success: true };
    }),

  cancelInvoice: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { purchaseInvoices } = await import("../../drizzle/schema");
      const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.id));
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.status === "committed") throw new TRPCError({ code: "BAD_REQUEST", message: "Committed invoices cannot be cancelled — use purchase return" });
      await db.update(purchaseInvoices).set({ status: "cancelled" }).where(eq(purchaseInvoices.id, input.id));
      await logAudit({ action: "purchase.cancelled", entityType: "purchase_invoice", entityId: input.id, beforeJson: inv, afterJson: { status: "cancelled" }, reason: input.reason }, ctx);
      return { success: true };
    }),

  addLine: protectedProcedure
    .input(z.object({ purchaseInvoiceId: z.number(), productId: z.number(), batchNo: z.string().min(1), mfgDate: z.date().optional(), expiryDate: z.date(), mrp: z.string(), purchaseRate: z.string(), saleRate: z.string().optional(), qty: z.number().min(1), freeQty: z.number().default(0), schemeDiscount: z.string().default("0"), cashDiscount: z.string().default("0"), gstRate: z.string().default("12"), hsnCode: z.string().optional(), rawLineText: z.string().optional(), confidence: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseInvoices, purchaseLines } = await import("../../drizzle/schema");
      const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.purchaseInvoiceId));
      if (!inv || inv.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice not in draft state" });
      const pr = parseFloat(input.purchaseRate), gr = parseFloat(input.gstRate), sd = parseFloat(input.schemeDiscount), cd = parseFloat(input.cashDiscount);
      const { landingCost, gstAmount, taxableAmount } = calcGst(pr, gr, input.qty, sd, cd);
      const mrp = parseFloat(input.mrp);
      const margin = mrp > 0 ? +((mrp - landingCost) / mrp * 100).toFixed(2) : 0;
      const [result] = await db.insert(purchaseLines).values({ purchaseInvoiceId: input.purchaseInvoiceId, productId: input.productId, batchNo: input.batchNo, mfgDate: input.mfgDate ?? null, expiryDate: input.expiryDate, mrp: input.mrp, purchaseRate: input.purchaseRate, saleRate: input.saleRate ?? null, qty: input.qty, freeQty: input.freeQty, schemeDiscount: input.schemeDiscount, cashDiscount: input.cashDiscount, gstRate: input.gstRate, hsnCode: input.hsnCode ?? null, landingCost: landingCost.toString(), margin: margin.toString(), rawLineText: input.rawLineText ?? null, confidence: input.confidence ?? null });
      await recalcInvoiceTotals(db, input.purchaseInvoiceId);
      return { id: (result as { insertId: number }).insertId, landingCost, margin, gstAmount, taxableAmount };
    }),

  updateLine: protectedProcedure
    .input(z.object({ id: z.number(), purchaseRate: z.string().optional(), mrp: z.string().optional(), saleRate: z.string().optional(), qty: z.number().optional(), freeQty: z.number().optional(), schemeDiscount: z.string().optional(), cashDiscount: z.string().optional(), gstRate: z.string().optional(), hsnCode: z.string().optional(), batchNo: z.string().optional(), mfgDate: z.date().optional(), expiryDate: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseLines, purchaseInvoices } = await import("../../drizzle/schema");
      const [line] = await db.select().from(purchaseLines).where(eq(purchaseLines.id, input.id));
      if (!line) throw new TRPCError({ code: "NOT_FOUND" });
      const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, line.purchaseInvoiceId));
      if (!inv || inv.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice not in draft state" });
      const pr = parseFloat(input.purchaseRate ?? line.purchaseRate ?? "0");
      const gr = parseFloat(input.gstRate ?? line.gstRate ?? "12");
      const sd = parseFloat(input.schemeDiscount ?? line.schemeDiscount ?? "0");
      const cd = parseFloat(input.cashDiscount ?? line.cashDiscount ?? "0");
      const qty = input.qty ?? line.qty;
      const mrp = parseFloat(input.mrp ?? line.mrp ?? "0");
      const { landingCost } = calcGst(pr, gr, qty, sd, cd);
      const margin = mrp > 0 ? +((mrp - landingCost) / mrp * 100).toFixed(2) : 0;
      const updates: Record<string, unknown> = { landingCost: landingCost.toString(), margin: margin.toString() };
      if (input.purchaseRate) updates.purchaseRate = input.purchaseRate;
      if (input.mrp) updates.mrp = input.mrp;
      if (input.saleRate !== undefined) updates.saleRate = input.saleRate;
      if (input.qty) updates.qty = input.qty;
      if (input.freeQty !== undefined) updates.freeQty = input.freeQty;
      if (input.schemeDiscount !== undefined) updates.schemeDiscount = input.schemeDiscount;
      if (input.cashDiscount !== undefined) updates.cashDiscount = input.cashDiscount;
      if (input.gstRate !== undefined) updates.gstRate = input.gstRate;
      if (input.hsnCode !== undefined) updates.hsnCode = input.hsnCode;
      if (input.batchNo) updates.batchNo = input.batchNo;
      if (input.mfgDate) updates.mfgDate = input.mfgDate;
      if (input.expiryDate) updates.expiryDate = input.expiryDate;
      await db.update(purchaseLines).set(updates).where(eq(purchaseLines.id, input.id));
      await recalcInvoiceTotals(db, line.purchaseInvoiceId);
      return { success: true, landingCost, margin };
    }),

  deleteLine: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseLines, purchaseInvoices } = await import("../../drizzle/schema");
      const [line] = await db.select().from(purchaseLines).where(eq(purchaseLines.id, input.id));
      if (!line) throw new TRPCError({ code: "NOT_FOUND" });
      const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, line.purchaseInvoiceId));
      if (!inv || inv.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice not in draft state" });
      await db.delete(purchaseLines).where(eq(purchaseLines.id, input.id));
      await recalcInvoiceTotals(db, line.purchaseInvoiceId);
      return { success: true };
    }),

  commitInvoice: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseInvoices, purchaseLines, batchLedger, batches, storeSkus } = await import("../../drizzle/schema");
      const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.id));
      if (!inv || inv.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice not in draft state" });
      const lines = await db.select().from(purchaseLines).where(eq(purchaseLines.purchaseInvoiceId, input.id));
      if (!lines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No lines to commit" });
      const gstSummary: Record<string, { taxable: number; gst: number; total: number }> = {};
      for (const line of lines) {
        const pr = parseFloat(line.purchaseRate ?? "0"), gr = parseFloat(line.gstRate ?? "12"), sd = parseFloat(line.schemeDiscount ?? "0"), cd = parseFloat(line.cashDiscount ?? "0");
        const qty = line.qty + (line.freeQty ?? 0);
        const { landingCost, gstAmount, taxableAmount } = calcGst(pr, gr, line.qty, sd, cd);
        const mrp = parseFloat(line.mrp ?? "0");
        const margin = mrp > 0 ? +((mrp - landingCost) / mrp * 100).toFixed(2) : 0;
        const bucket = computeExpiryBucket(line.expiryDate);
        // Upsert batch_ledger
        const [existingLedger] = await db.select().from(batchLedger).where(and(eq(batchLedger.batchNo, line.batchNo), eq(batchLedger.storeId, inv.storeId), eq(batchLedger.productId, line.productId))).limit(1);
        if (existingLedger) {
          await db.update(batchLedger).set({ qtyOnHand: (existingLedger.qtyOnHand ?? 0) + qty, mrp: line.mrp, purchaseRate: line.purchaseRate, saleRate: line.saleRate ?? line.mrp, landingCost: landingCost.toString(), margin: margin.toString(), expiryBucket: bucket, purchaseInvoiceId: inv.id }).where(eq(batchLedger.id, existingLedger.id));
        } else {
          await db.insert(batchLedger).values({ productId: line.productId, storeId: inv.storeId, supplierId: inv.supplierId, batchNo: line.batchNo, mfgDate: line.mfgDate ?? null, expiryDate: line.expiryDate, mrp: line.mrp, purchaseRate: line.purchaseRate, saleRate: line.saleRate ?? line.mrp, schemeDiscount: line.schemeDiscount ?? "0", cashDiscount: line.cashDiscount ?? "0", landingCost: landingCost.toString(), margin: margin.toString(), qtyOnHand: qty, qtyReserved: 0, qtyQuarantined: 0, qtyExpired: 0, purchaseInvoiceId: inv.id, expiryBucket: bucket, status: "active", createdBy: ctx.user!.id });
        }
        // Upsert legacy batches
        const [existingBatch] = await db.select().from(batches).where(and(eq(batches.batchNumber, line.batchNo), eq(batches.storeId, inv.storeId))).limit(1);
        let batchId: number;
        if (existingBatch) {
          batchId = existingBatch.id;
          await db.update(batches).set({ quantity: (existingBatch.quantity ?? 0) + qty }).where(eq(batches.id, batchId));
        } else {
          const [br] = await db.insert(batches).values({ productId: line.productId, batchNumber: line.batchNo, expiryDate: line.expiryDate, unitCost: line.purchaseRate, quantity: qty, storeId: inv.storeId, status: "active" });
          batchId = (br as { insertId: number }).insertId;
        }
        await db.update(purchaseLines).set({ batchId }).where(eq(purchaseLines.id, line.id));
        await increaseStockForPurchaseCommit({ batchId, storeId: inv.storeId, qtyDelta: qty, referenceType: "purchase_invoice", referenceId: inv.id, reason: `Purchase commit ${inv.invoiceNo}`, actor: { actorId: ctx.user!.id, actorRole: ctx.user!.role, source: "admin" }, productId: line.productId });
        const [sku] = await db.select().from(storeSkus).where(eq(storeSkus.productId, line.productId)).limit(1);
        if (sku) await db.update(storeSkus).set({ stockQty: (sku.stockQty ?? 0) + qty }).where(eq(storeSkus.id, sku.id));
        const rateKey = `${gr}%`;
        if (!gstSummary[rateKey]) gstSummary[rateKey] = { taxable: 0, gst: 0, total: 0 };
        gstSummary[rateKey].taxable += taxableAmount;
        gstSummary[rateKey].gst += gstAmount;
        gstSummary[rateKey].total += taxableAmount + gstAmount;
      }
      await db.update(purchaseInvoices).set({ status: "committed", committedAt: new Date(), approvedBy: ctx.user!.id, approvedAt: new Date(), gstSummary: JSON.stringify(gstSummary) }).where(eq(purchaseInvoices.id, input.id));
      await recordSupplierPayable(db, { supplierId: inv.supplierId, purchaseInvoiceId: inv.id, storeId: inv.storeId, amount: Number(inv.netAmount ?? 0), actorId: ctx.user!.id, actorRole: ctx.user!.role, source: "admin" }, ctx);
      await logAudit({ action: "purchase.committed", entityType: "purchase_invoice", entityId: input.id, beforeJson: { status: "draft" }, afterJson: { status: "committed", gstSummary } }, ctx);
      return { success: true, gstSummary };
    }),

  stockMovements: protectedProcedure
    .input(z.object({ purchaseInvoiceId: z.number().optional(), storeId: z.number().optional(), batchId: z.number().optional(), limit: z.number().default(100), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { stockMovements, batches, products } = await import("../../drizzle/schema");
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId) conds.push(eq(stockMovements.storeId, input.storeId));
      if (input.batchId) conds.push(eq(stockMovements.batchId, input.batchId));
      if (input.purchaseInvoiceId) conds.push(and(eq(stockMovements.referenceType, "purchase_invoice"), eq(stockMovements.referenceId, input.purchaseInvoiceId))!);
      return db.select({ movement: stockMovements, batchNumber: batches.batchNumber, productName: products.name })
        .from(stockMovements).leftJoin(batches, eq(stockMovements.batchId, batches.id)).leftJoin(products, eq(batches.productId, products.id))
        .where(conds.length ? and(...conds) : undefined).orderBy(desc(stockMovements.createdAt)).limit(input.limit).offset(input.offset);
    }),

  createReturn: protectedProcedure
    .input(z.object({ purchaseInvoiceId: z.number(), supplierId: z.number(), storeId: z.number(), reason: z.string().optional(), debitNoteNo: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseReturns } = await import("../../drizzle/schema");
      const [result] = await db.insert(purchaseReturns).values({ purchaseInvoiceId: input.purchaseInvoiceId, supplierId: input.supplierId, storeId: input.storeId, reason: input.reason ?? null, debitNoteNo: input.debitNoteNo ?? null, createdBy: ctx.user!.id, status: "draft" });
      const id = (result as { insertId: number }).insertId;
      await logAudit({ action: "purchase.returned", entityType: "purchase_return", entityId: id, afterJson: { purchaseInvoiceId: input.purchaseInvoiceId } }, ctx);
      return { id };
    }),

  addReturnLine: protectedProcedure
    .input(z.object({ purchaseReturnId: z.number(), purchaseLineId: z.number(), batchId: z.number(), qty: z.number().min(1), returnRate: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseReturnLines, purchaseReturns } = await import("../../drizzle/schema");
      const [ret] = await db.select().from(purchaseReturns).where(eq(purchaseReturns.id, input.purchaseReturnId));
      if (!ret || ret.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Return not in draft state" });
      const [result] = await db.insert(purchaseReturnLines).values({ purchaseReturnId: input.purchaseReturnId, purchaseLineId: input.purchaseLineId, batchId: input.batchId, qty: input.qty, returnRate: input.returnRate, reason: input.reason ?? null });
      const lines = await db.select().from(purchaseReturnLines).where(eq(purchaseReturnLines.purchaseReturnId, input.purchaseReturnId));
      const total = lines.reduce((s, l) => s + parseFloat(l.returnRate ?? "0") * l.qty, 0);
      await db.update(purchaseReturns).set({ totalAmount: total.toFixed(2) }).where(eq(purchaseReturns.id, input.purchaseReturnId));
      return { id: (result as { insertId: number }).insertId };
    }),

  commitReturn: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { purchaseReturns, purchaseReturnLines, batchLedger, batches, storeSkus, purchaseInvoices } = await import("../../drizzle/schema");
      const [ret] = await db.select().from(purchaseReturns).where(eq(purchaseReturns.id, input.id));
      if (!ret || ret.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Return not in draft state" });
      const lines = await db.select().from(purchaseReturnLines).where(eq(purchaseReturnLines.purchaseReturnId, input.id));
      if (!lines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No return lines" });
      for (const line of lines) {
        const [b] = await db.select().from(batches).where(eq(batches.id, line.batchId)).limit(1);
        if (b) {
          if ((b.quantity ?? 0) < line.qty) throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient stock in batch ${b.batchNumber}` });
          const movement = await decreaseStockForPurchaseReturn({ batchId: b.id, storeId: ret.storeId, qtyDelta: line.qty, referenceType: "purchase_return", referenceId: ret.id, reason: line.reason ?? `Purchase return ${ret.id}`, actor: { actorId: ctx.user!.id, actorRole: ctx.user!.role, source: "admin" }, productId: b.productId });
          const [bl] = await db.select().from(batchLedger).where(eq(batchLedger.id, line.batchId)).limit(1);
          if (bl) await db.update(batchLedger).set({ qtyOnHand: movement.qtyAfter }).where(eq(batchLedger.id, bl.id));
          const newQty = movement.qtyAfter;
          await db.update(batches).set({ quantity: newQty }).where(eq(batches.id, b.id));
          const [sku] = await db.select().from(storeSkus).where(eq(storeSkus.productId, b.productId)).limit(1);
          if (sku) await db.update(storeSkus).set({ stockQty: Math.max(0, (sku.stockQty ?? 0) - line.qty) }).where(eq(storeSkus.id, sku.id));
        }
      }
      await db.update(purchaseReturns).set({ status: "committed", committedAt: new Date(), approvedBy: ctx.user!.id }).where(eq(purchaseReturns.id, input.id));
      await db.update(purchaseInvoices).set({ status: "partially_returned" }).where(eq(purchaseInvoices.id, ret.purchaseInvoiceId));
      await logAudit({ action: "purchase.return_committed", entityType: "purchase_return", entityId: input.id, beforeJson: { status: "draft" }, afterJson: { status: "committed" } }, ctx);
      return { success: true };
    }),

  listReturns: protectedProcedure
    .input(z.object({ storeId: z.number().optional(), supplierId: z.number().optional(), status: z.enum(["draft","committed"]).optional(), limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseReturns, suppliers, purchaseInvoices } = await import("../../drizzle/schema");
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId) conds.push(eq(purchaseReturns.storeId, input.storeId));
      if (input.supplierId) conds.push(eq(purchaseReturns.supplierId, input.supplierId));
      if (input.status) conds.push(eq(purchaseReturns.status, input.status));
      return db.select({ ret: purchaseReturns, supplierName: suppliers.supplierName, invoiceNo: purchaseInvoices.invoiceNo })
        .from(purchaseReturns).leftJoin(suppliers, eq(purchaseReturns.supplierId, suppliers.id)).leftJoin(purchaseInvoices, eq(purchaseReturns.purchaseInvoiceId, purchaseInvoices.id))
        .where(conds.length ? and(...conds) : undefined).orderBy(desc(purchaseReturns.createdAt)).limit(input.limit).offset(input.offset);
    }),

  getReturn: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseReturns, purchaseReturnLines, purchaseLines, products, batches } = await import("../../drizzle/schema");
      const [ret] = await db.select().from(purchaseReturns).where(eq(purchaseReturns.id, input.id));
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db.select({ line: purchaseReturnLines, productName: products.name, batchNumber: batches.batchNumber })
        .from(purchaseReturnLines).leftJoin(purchaseLines, eq(purchaseReturnLines.purchaseLineId, purchaseLines.id)).leftJoin(products, eq(purchaseLines.productId, products.id)).leftJoin(batches, eq(purchaseReturnLines.batchId, batches.id))
        .where(eq(purchaseReturnLines.purchaseReturnId, input.id));
      return { ret, lines };
    }),

  listPayments: protectedProcedure
    .input(z.object({ supplierId: z.number().optional(), storeId: z.number().optional(), limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { supplierPayments, suppliers } = await import("../../drizzle/schema");
      const conds: ReturnType<typeof eq>[] = [];
      if (input.supplierId) conds.push(eq(supplierPayments.supplierId, input.supplierId));
      if (input.storeId) conds.push(eq(supplierPayments.storeId, input.storeId));
      return db.select({ payment: supplierPayments, supplierName: suppliers.supplierName })
        .from(supplierPayments).leftJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
        .where(conds.length ? and(...conds) : undefined).orderBy(desc(supplierPayments.paymentDate)).limit(input.limit).offset(input.offset);
    }),

  recordPayment: protectedProcedure
    .input(z.object({ supplierId: z.number(), storeId: z.number(), purchaseInvoiceId: z.number().optional(), amount: z.string(), paymentMode: z.enum(["cash","cheque","upi","neft","rtgs"]), referenceNo: z.string().optional(), voucherNo: z.string().optional(), bankRef: z.string().optional(), paymentDate: z.date().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const result = await recordSupplierPayment(db, { supplierId: input.supplierId, storeId: input.storeId, purchaseInvoiceId: input.purchaseInvoiceId ?? null, amount: input.amount, paymentMode: input.paymentMode, referenceNo: input.referenceNo ?? null, voucherNo: input.voucherNo ?? null, bankRef: input.bankRef ?? null, paymentDate: input.paymentDate ?? new Date(), notes: input.notes ?? null, createdBy: ctx.user!.id }, ctx);
      return { id: result.id };
    }),

  supplierOutstanding: protectedProcedure
    .input(z.object({ supplierId: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const row = await getSupplierOutstanding(db, input.supplierId);
      const rows = [row];
      return { rows, totals: { outstanding: row.outstanding }, csvData: `supplierId,outstanding\n${row.supplierId},${row.outstanding}` };
    }),

  reports: router({
    register: protectedProcedure
      .input(z.object({ storeId: z.number().optional(), supplierId: z.number().optional(), dateFrom: z.date().optional(), dateTo: z.date().optional(), status: z.enum(["draft","committed","partially_returned","returned","cancelled"]).optional(), limit: z.number().default(100), offset: z.number().default(0) }))
      .query(async ({ ctx, input }) => {
        requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
        const db = await getDbSafe();
        const { purchaseInvoices, suppliers, users } = await import("../../drizzle/schema");
        const conds: ReturnType<typeof eq>[] = [];
        if (input.storeId) conds.push(eq(purchaseInvoices.storeId, input.storeId));
        if (input.supplierId) conds.push(eq(purchaseInvoices.supplierId, input.supplierId));
        if (input.status) conds.push(eq(purchaseInvoices.status, input.status));
        if (input.dateFrom) conds.push(gte(purchaseInvoices.invoiceDate, input.dateFrom));
        if (input.dateTo) conds.push(lte(purchaseInvoices.invoiceDate, input.dateTo));
        const rows = await db.select({ invoice: purchaseInvoices, supplierName: suppliers.supplierName, createdByName: users.name })
          .from(purchaseInvoices).leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id)).leftJoin(users, eq(purchaseInvoices.createdBy, users.id))
          .where(conds.length ? and(...conds) : undefined).orderBy(desc(purchaseInvoices.invoiceDate)).limit(input.limit).offset(input.offset);
        const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(purchaseInvoices).where(conds.length ? and(...conds) : undefined);
        const [{ totalValue }] = await db.select({ totalValue: sql<number>`COALESCE(SUM(net_amount), 0)` }).from(purchaseInvoices).where(conds.length ? and(...conds) : undefined);
        return { rows, total, totalValue };
      }),

    supplierWise: protectedProcedure
      .input(z.object({ storeId: z.number().optional(), dateFrom: z.date().optional(), dateTo: z.date().optional() }))
      .query(async ({ ctx, input }) => {
        requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
        const db = await getDbSafe();
        const { purchaseInvoices, suppliers } = await import("../../drizzle/schema");
        const conds: ReturnType<typeof eq>[] = [eq(purchaseInvoices.status, "committed")];
        if (input.storeId) conds.push(eq(purchaseInvoices.storeId, input.storeId));
        if (input.dateFrom) conds.push(gte(purchaseInvoices.invoiceDate, input.dateFrom));
        if (input.dateTo) conds.push(lte(purchaseInvoices.invoiceDate, input.dateTo));
        return db.select({ supplierId: purchaseInvoices.supplierId, supplierName: suppliers.supplierName, invoiceCount: sql<number>`count(*)`, totalAmount: sql<number>`COALESCE(SUM(${purchaseInvoices.netAmount}), 0)`, totalGst: sql<number>`COALESCE(SUM(${purchaseInvoices.totalGst}), 0)` })
          .from(purchaseInvoices).leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
          .where(and(...conds)).groupBy(purchaseInvoices.supplierId, suppliers.supplierName).orderBy(desc(sql`SUM(${purchaseInvoices.netAmount})`));
      }),

    productWise: protectedProcedure
      .input(z.object({ storeId: z.number().optional(), dateFrom: z.date().optional(), dateTo: z.date().optional() }))
      .query(async ({ ctx, input }) => {
        requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
        const db = await getDbSafe();
        const { purchaseLines, purchaseInvoices, products } = await import("../../drizzle/schema");
        const conds: ReturnType<typeof eq>[] = [eq(purchaseInvoices.status, "committed")];
        if (input.storeId) conds.push(eq(purchaseInvoices.storeId, input.storeId));
        if (input.dateFrom) conds.push(gte(purchaseInvoices.invoiceDate, input.dateFrom));
        if (input.dateTo) conds.push(lte(purchaseInvoices.invoiceDate, input.dateTo));
        return db.select({ productId: purchaseLines.productId, productName: products.name, totalQty: sql<number>`COALESCE(SUM(${purchaseLines.qty}), 0)`, totalFreeQty: sql<number>`COALESCE(SUM(${purchaseLines.freeQty}), 0)`, totalValue: sql<number>`COALESCE(SUM(${purchaseLines.qty} * ${purchaseLines.purchaseRate}), 0)`, avgMargin: sql<number>`COALESCE(AVG(${purchaseLines.margin}), 0)` })
          .from(purchaseLines).innerJoin(purchaseInvoices, eq(purchaseLines.purchaseInvoiceId, purchaseInvoices.id)).leftJoin(products, eq(purchaseLines.productId, products.id))
          .where(and(...conds)).groupBy(purchaseLines.productId, products.name).orderBy(desc(sql`SUM(${purchaseLines.qty} * ${purchaseLines.purchaseRate})`)).limit(200);
      }),

    batchwiseReport: protectedProcedure
      .input(z.object({ storeId: z.number().optional(), productId: z.number().optional(), supplierId: z.number().optional(), dateFrom: z.date().optional(), dateTo: z.date().optional(), limit: z.number().default(100), offset: z.number().default(0) }))
      .query(async ({ ctx, input }) => {
        requirePurchase(ctx.user!.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
        const db = await getDbSafe();
        const { purchaseLines, purchaseInvoices, products, suppliers } = await import("../../drizzle/schema");
        const conds: ReturnType<typeof eq>[] = [eq(purchaseInvoices.status, "committed")];
        if (input.storeId) conds.push(eq(purchaseInvoices.storeId, input.storeId));
        if (input.productId) conds.push(eq(purchaseLines.productId, input.productId));
        if (input.supplierId) conds.push(eq(purchaseInvoices.supplierId, input.supplierId));
        if (input.dateFrom) conds.push(gte(purchaseInvoices.invoiceDate, input.dateFrom));
        if (input.dateTo) conds.push(lte(purchaseInvoices.invoiceDate, input.dateTo));
        return db.select({ line: purchaseLines, productName: products.name, supplierName: suppliers.supplierName, invoiceNo: purchaseInvoices.invoiceNo, invoiceDate: purchaseInvoices.invoiceDate })
          .from(purchaseLines).innerJoin(purchaseInvoices, eq(purchaseLines.purchaseInvoiceId, purchaseInvoices.id)).leftJoin(products, eq(purchaseLines.productId, products.id)).leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
          .where(and(...conds)).orderBy(desc(purchaseInvoices.invoiceDate)).limit(input.limit).offset(input.offset);
      }),
  }),
});
