/**
 * salesRouter.ts — PART 7: Sales + Counter Billing V1
 * Counter billing, FEFO batch selection, Rx gate, payment, returns, stock movements.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { eq, and, desc, sql, like, or, asc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logAudit } from "../services/audit";
import { decreaseStockForSaleConfirmation, reverseStockForSaleReturn } from "../services/stockInvariant";
import { assertCanConfirmSale, createOrVerifyH1RegisterEntry } from "../services/complianceGate";
import { applyDiscountCode, assertDiscountWithinCaps, assertNoLossWithoutApproval, recordDiscountCodeUsage } from "../services/marginGuard";
import { resolveBarcodeForSale, resolveBarcodeForReturn } from "../services/barcodeService";
import { buildIdempotencyKey, createMutationFingerprint, getRequestIdFromContext, withIdempotency } from "../services/idempotencyService";
import { getCanonicalAvailability } from "../services/reservationService";
import { reserveInvoiceNumber, generateReturnNoteNumber, buildDraftBillNumber } from "../services/invoiceNumbering";
import { createSaleInvoiceSnapshot, getInvoiceSnapshotPackageForSale } from "../services/invoiceSnapshotService";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function requireSales(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager", "pharmacist", "salesman", "cashier"];
  if (!role || !allowed.includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Sales access required" });
}

function requireManager(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager"];
  if (!role || !allowed.includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Manager role required" });
}

export const salesRouter = router({

  scanBarcodeForSale: protectedProcedure
    .input(z.object({ barcode: z.string().min(1), storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const resolved = await resolveBarcodeForSale(input.barcode, input.storeId);
      return { ...resolved, stockMutation: "deferred_to_confirmSale_stockInvariant", complianceGate: "checked_at_confirm", marginGuard: "checked_at_confirm" };
    }),

  scanBarcodeForReturn: protectedProcedure
    .input(z.object({ barcode: z.string().min(1), storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const resolved = await resolveBarcodeForReturn(input.barcode, input.storeId);
      return { ...resolved, stockMutation: "deferred_to_return_commit_stockInvariant" };
    }),

  // ─── Product Search ──────────────────────────────────────────────────────────
  searchProducts: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      storeId: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { products, batchLedger } = await import("../../drizzle/schema");
      const q = `%${input.query}%`;
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          strength: products.strength,
          dosageForm: products.form,
          packSize: products.packSize,
          gstRate: products.gstRate,
          hsnCode: products.hsnCode,
          scheduleId: products.schedule,
          prescriptionRequired: products.requiresPrescription,
          h1RegisterRequired: products.requiresPrescription,
          primaryBarcode: products.barcode,
        })
        .from(products)
        .where(
          and(
            
            or(
              like(products.name, q),
              like(products.brand, q),
              like(products.barcode, q),
              like(products.canonicalName, q),
            )
          )
        )
        .limit(input.limit);
      return { rows };
    }),

  // ─── FEFO Batch Suggestion ───────────────────────────────────────────────────
  getFefoBatches: protectedProcedure
    .input(z.object({
      productId: z.string(),
      storeId: z.string(),
      qtyNeeded: z.number().min(1).default(1),
    }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { batchLedger } = await import("../../drizzle/schema");
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const batches = await db
        .select()
        .from(batchLedger)
        .where(
          and(
            eq(batchLedger.productId, parseInt(input.productId) || 0),
            eq(batchLedger.storeId, parseInt(input.storeId) || 0),
            sql`${batchLedger.qtyOnHand} > 0`,
            sql`${batchLedger.status} NOT IN ('expired','quarantined','disposed','recalled')`,
          )
        )
        .orderBy(asc(batchLedger.expiryDate))
        .limit(10);

      return {
        batches: batches.map(b => {
          const expiryMs = b.expiryDate ? new Date(b.expiryDate).getTime() : null;
          const daysToExpiry = expiryMs ? Math.ceil((expiryMs - now) / (24 * 60 * 60 * 1000)) : null;
          const isNearExpiry = daysToExpiry !== null && daysToExpiry <= 90;
          const isExpired = daysToExpiry !== null && daysToExpiry <= 0;
          const isCritical = daysToExpiry !== null && daysToExpiry <= 60 && daysToExpiry > 30;
          const isQuarantineCandidate = daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry > 0;
          return {
            ...b,
            daysToExpiry,
            isNearExpiry,
            isExpired,
            isCritical,
            isQuarantineCandidate,
            availableQty: (b.qtyOnHand ?? 0) - (b.qtyReserved ?? 0) - (b.qtyQuarantined ?? 0) - (b.qtyExpired ?? 0),
          };
        }),
      };
    }),

  // ─── Create Draft Sale ───────────────────────────────────────────────────────
  createDraft: protectedProcedure
    .input(z.object({
      storeId: z.string(),
      saleType: z.enum(["counter", "medicine", "app", "whatsapp", "phone_assisted", "prescription", "otc", "chronic_refill"]).default("counter"),
      customerMobile: z.string().optional(),
      customerName: z.string().optional(),
      salesmanCode: z.string().optional(),
      pharmacistCode: z.string().optional(),
      pharmacistName: z.string().optional(),
      pharmacistRegNo: z.string().optional(),
      discountCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { sales } = await import("../../drizzle/schema");
      const now = Date.now();
      const billNo = buildDraftBillNumber(input.storeId);
      const id = randomUUID();
      await db.insert(sales).values({
        id,
        billNo,
        saleType: input.saleType,
        storeId: input.storeId,
        customerMobile: input.customerMobile ?? null,
        customerName: input.customerName ?? null,
        salesmanCode: input.salesmanCode ?? null,
        pharmacistCode: input.pharmacistCode ?? null,
        pharmacistName: input.pharmacistName ?? null,
        pharmacistRegNo: input.pharmacistRegNo ?? null,
        subtotal: "0",
        discountAmount: "0",
        gstAmount: "0",
        total: "0",
        paymentMode: "cash",
        status: "draft",
        billPrinted: 0,
        whatsappSent: 0,
        emailSent: 0,
        createdBy: ctx.user!.id.toString(),
        createdAt: now,
        updatedAt: now,
      });
      await logAudit({ action: "sale.created", entityType: "sale", entityId: null, entityRef: id, beforeJson: null, afterJson: { billNo, storeId: input.storeId, saleRef: id } }, ctx);
      return { id, billNo };
    }),

  // ─── Add Line to Draft ───────────────────────────────────────────────────────
  addLine: protectedProcedure
    .input(z.object({
      saleId: z.string(),
      productId: z.string(),
      batchLedgerId: z.string().optional(),
      batchNo: z.string().optional(),
      expiryDate: z.string().optional(),
      mrp: z.number(),
      saleRate: z.number(),
      qty: z.number().min(1),
      discountPct: z.number().min(0).max(100).default(0),
      gstRate: z.number().min(0).default(0),
      hsnCode: z.string().optional(),
      requiresPrescription: z.boolean().default(false),
      scheduleCode: z.string().optional(),
      rxCleared: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { saleLines, sales } = await import("../../drizzle/schema");
      const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found" });
      if (sale.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Sale already confirmed" });

      // Rx gate: H/H1/X always require pharmacist clearance
      const rxSchedules = ["H", "H1", "X", "Rx", "NRX"];
      if (input.scheduleCode && rxSchedules.includes(input.scheduleCode) && !input.rxCleared) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Schedule ${input.scheduleCode} requires pharmacist clearance before adding to bill` });
      }

      const discountAmount = +(input.saleRate * input.qty * (input.discountPct / 100)).toFixed(2);
      const taxableAmount = +(input.saleRate * input.qty - discountAmount).toFixed(2);
      const gstAmount = +(taxableAmount * (input.gstRate / 100)).toFixed(2);
      const lineTotal = +(taxableAmount + gstAmount).toFixed(2);

      const lineId = randomUUID();
      const now = Date.now();
      await db.insert(saleLines).values({
        id: lineId,
        saleId: input.saleId,
        productId: input.productId,
        batchLedgerId: input.batchLedgerId ?? null,
        batchNo: input.batchNo ?? null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        mrp: String(input.mrp),
        saleRate: String(input.saleRate),
        qty: input.qty,
        discountPct: String(input.discountPct),
        discountAmount: String(discountAmount),
        gstRate: String(input.gstRate),
        gstAmount: String(gstAmount),
        hsnCode: input.hsnCode ?? null,
        lineTotal: String(lineTotal),
        requiresPrescription: input.requiresPrescription ? 1 : 0,
        scheduleCode: input.scheduleCode ?? null,
        rxCleared: input.rxCleared ? 1 : 0,
        createdAt: now,
      });

      // Recalculate sale totals
      const allLines = await db.select().from(saleLines).where(eq(saleLines.saleId, input.saleId));
      const subtotal = allLines.reduce((s, l) => s + parseFloat(l.saleRate ?? "0") * l.qty, 0);
      const totalDiscount = allLines.reduce((s, l) => s + parseFloat(l.discountAmount ?? "0"), 0);
      const totalGst = allLines.reduce((s, l) => s + parseFloat(l.gstAmount ?? "0"), 0);
      const total = allLines.reduce((s, l) => s + parseFloat(l.lineTotal ?? "0"), 0);

      await db.update(sales).set({
        subtotal: String(+subtotal.toFixed(2)),
        discountAmount: String(+totalDiscount.toFixed(2)),
        gstAmount: String(+totalGst.toFixed(2)),
        total: String(+total.toFixed(2)),
        updatedAt: now,
      }).where(eq(sales.id, input.saleId));

      return { lineId, lineTotal };
    }),

  // ─── Remove Line ─────────────────────────────────────────────────────────────
  removeLine: protectedProcedure
    .input(z.object({ saleId: z.string(), lineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { saleLines, sales } = await import("../../drizzle/schema");
      const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale || sale.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot modify confirmed sale" });
      await db.delete(saleLines).where(and(eq(saleLines.id, input.lineId), eq(saleLines.saleId, input.saleId)));
      const allLines = await db.select().from(saleLines).where(eq(saleLines.saleId, input.saleId));
      const subtotal = allLines.reduce((s, l) => s + parseFloat(l.saleRate ?? "0") * l.qty, 0);
      const totalDiscount = allLines.reduce((s, l) => s + parseFloat(l.discountAmount ?? "0"), 0);
      const totalGst = allLines.reduce((s, l) => s + parseFloat(l.gstAmount ?? "0"), 0);
      const total = allLines.reduce((s, l) => s + parseFloat(l.lineTotal ?? "0"), 0);
      await db.update(sales).set({
        subtotal: String(+subtotal.toFixed(2)),
        discountAmount: String(+totalDiscount.toFixed(2)),
        gstAmount: String(+totalGst.toFixed(2)),
        total: String(+total.toFixed(2)),
        updatedAt: Date.now(),
      }).where(eq(sales.id, input.saleId));
      return { ok: true };
    }),

  // ─── Get Draft (with lines) ──────────────────────────────────────────────────
  getDraft: protectedProcedure
    .input(z.object({ saleId: z.string() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { sales, saleLines, products } = await import("../../drizzle/schema");
      const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db
        .select({
          line: saleLines,
          productName: products.name,
          productBrand: products.brand,
        })
        .from(saleLines)
        .leftJoin(products, eq(saleLines.productId, products.id))
        .where(eq(saleLines.saleId, input.saleId));
      return { sale, lines };
    }),

  // ─── Confirm Sale (commit stock) ─────────────────────────────────────────────
  confirmSale: protectedProcedure
    .input(z.object({
      saleId: z.string(),
      paymentMode: z.enum(["cash", "upi", "card", "credit", "mixed"]),
      paymentRef: z.string().optional(),
      pharmacistCode: z.string().optional(),
      pharmacistName: z.string().optional(),
      pharmacistRegNo: z.string().optional(),
      discountCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const {
        sales, saleLines, batchLedger, counterPayments, auditLogs,
      } = await import("../../drizzle/schema");
      const now = Date.now();
      const idemKey = buildIdempotencyKey(["sale","confirm",input.saleId,getRequestIdFromContext(ctx) ?? "no-request-id"]);
      return withIdempotency({ key: idemKey, scope: "sales.confirmSale", operationType: "sale_confirm", actorId: ctx.user!.id, entityType: "sale", entityId: String(input.saleId), requestHash: createMutationFingerprint(input), ctx }, async () => {
      const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (sale.status === "confirmed") return { ok: true, idempotent: true, billNo: sale.billNo, total: sale.total };
      if (sale.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Sale already confirmed" });

      const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, input.saleId));
      if (lines.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No lines on sale" });
      for (const line of lines) {
        const availability = await getCanonicalAvailability(Number(sale.storeId), Number(line.productId), null);
        if (availability.availableQty < line.qty) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Insufficient canonical availability for product ${line.productId}` });
      }

      await assertCanConfirmSale(input.saleId, ctx);
      let discountUsageCodeId: number | null = null;
      if (input.discountCode) {
        const applied = await applyDiscountCode(input.saleId, input.discountCode, ctx);
        await assertDiscountWithinCaps(applied.discountAmount, Number(sale.subtotal ?? 0));
        discountUsageCodeId = applied.codeId;
      }
      await assertNoLossWithoutApproval(input.saleId, ctx.user?.role, ctx);

      // Build GST summary
      const gstMap: Record<string, { taxable: number; gst: number }> = {};
      for (const l of lines) {
        const rate = l.gstRate ?? "0";
        if (!gstMap[rate]) gstMap[rate] = { taxable: 0, gst: 0 };
        const taxable = parseFloat(l.saleRate ?? "0") * l.qty - parseFloat(l.discountAmount ?? "0");
        gstMap[rate].taxable += taxable;
        gstMap[rate].gst += parseFloat(l.gstAmount ?? "0");
      }

      const finalBillNo = sale.billNo?.startsWith("DRF-") ? await reserveInvoiceNumber(db, sale.storeId, "sale_invoice") : sale.billNo;

      // Decrement batch qty and create stock movements
      for (const line of lines) {
        if (line.batchLedgerId) {
          await decreaseStockForSaleConfirmation({ batchId: parseInt(line.batchLedgerId ?? "0") || 0, storeId: parseInt(sale.storeId) || 0, qtyDelta: -line.qty, referenceType: "sale", referenceId: parseInt(sale.id) || 0, reason: `Bill ${finalBillNo}`, actor: { actorId: ctx.user!.id, actorRole: ctx.user!.role, source: "admin" }, productId: Number(line.productId) });
        }
      }

      // Update sale to confirmed
      await db.update(sales).set({
        status: "confirmed",
        paymentMode: input.paymentMode,
        paymentRef: input.paymentRef ?? null,
        pharmacistCode: input.pharmacistCode ?? sale.pharmacistCode,
        pharmacistName: input.pharmacistName ?? sale.pharmacistName,
        pharmacistRegNo: input.pharmacistRegNo ?? sale.pharmacistRegNo,
        billNo: finalBillNo,
        gstSummary: JSON.stringify(gstMap),
        confirmedAt: now,
        updatedAt: now,
      }).where(eq(sales.id, input.saleId));

      // Create payment record
      await db.insert(counterPayments).values({
        id: randomUUID(),
        saleId: input.saleId,
        paymentMode: input.paymentMode,
        amount: sale.total,
        paymentRef: input.paymentRef ?? null,
        status: "confirmed",
        createdBy: ctx.user!.id.toString(),
        createdAt: now,
      });

      await createSaleInvoiceSnapshot(db, input.saleId, { generatedBy: ctx.user?.id });
      if (discountUsageCodeId !== null) await recordDiscountCodeUsage(discountUsageCodeId, input.saleId, ctx);
      await createOrVerifyH1RegisterEntry(input.saleId, Number(ctx.user?.id ?? 0), ctx);
      await logAudit({ action: "compliance.sale_approved", entityType: "sale", entityId: null, entityRef: input.saleId, afterJson: { ok: true } }, ctx);
      await logAudit({ action: "sale.confirmed", entityType: "sale", entityId: null, entityRef: input.saleId, beforeJson: { status: "draft" }, afterJson: { status: "confirmed", paymentMode: input.paymentMode } }, ctx);
      return { ok: true, billNo: finalBillNo, total: sale.total };
      });
    }),

  // ─── Immutable invoice snapshot package ─────────────────────────────────────
  getInvoiceSnapshotPackage: protectedProcedure
    .input(z.object({ saleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      try {
        const invoicePackage = await getInvoiceSnapshotPackageForSale(db, input.saleId, { id: ctx.user!.id, role: ctx.user?.role });
        if (!invoicePackage) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice snapshot not found" });
        return invoicePackage;
      } catch (error) {
        if ((error as any)?.code === "FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN", message: "Invoice snapshot not available for this customer" });
        throw error;
      }
    }),

  // ─── List Sales ──────────────────────────────────────────────────────────────
  listSales: protectedProcedure
    .input(z.object({
      storeId: z.string().optional(),
      status: z.enum(["draft", "confirmed", "returned", "cancelled"]).optional(),
      dateFrom: z.number().optional(),
      dateTo: z.number().optional(),
      search: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { sales } = await import("../../drizzle/schema");
      const conditions = [];
      if (input.storeId) conditions.push(eq(sales.storeId, input.storeId));
      if (input.status) conditions.push(eq(sales.status, input.status));
      if (input.dateFrom) conditions.push(sql`${sales.createdAt} >= ${input.dateFrom}`);
      if (input.dateTo) conditions.push(sql`${sales.createdAt} <= ${input.dateTo}`);
      if (input.search) {
        const q = `%${input.search}%`;
        conditions.push(or(like(sales.billNo, q), like(sales.customerMobile, q), like(sales.customerName, q)));
      }
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.select().from(sales)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(sales.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(sales)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: count, page: input.page, pageSize: input.pageSize };
    }),

  // ─── Get Sale Detail ─────────────────────────────────────────────────────────
  getSale: protectedProcedure
    .input(z.object({ saleId: z.string() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { sales, saleLines, products } = await import("../../drizzle/schema");
      const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db
        .select({
          line: saleLines,
          productName: products.name,
          productBrand: products.brand,
          productStrength: products.strength,
          productDosageForm: products.form,
        })
        .from(saleLines)
        .leftJoin(products, eq(saleLines.productId, products.id))
        .where(eq(saleLines.saleId, input.saleId));
      return { sale, lines };
    }),

  // ─── Cancel Draft ────────────────────────────────────────────────────────────
  cancelDraft: protectedProcedure
    .input(z.object({ saleId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { sales } = await import("../../drizzle/schema");
      const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (sale.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft sales can be cancelled" });
      await db.update(sales).set({ status: "cancelled", updatedAt: Date.now() }).where(eq(sales.id, input.saleId));
      await logAudit({ action: "sale.cancelled", entityType: "sale", entityId: null, entityRef: input.saleId, beforeJson: { status: "draft" }, afterJson: { status: "cancelled" }, reason: input.reason }, ctx);
      return { ok: true };
    }),


  cancelSale: protectedProcedure
    .input(z.object({ saleId: z.string(), reason: z.string().min(3), actorNote: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { sales, counterPayments } = await import("../../drizzle/schema");
      const { recordCancellationTruth } = await import("../services/reconciliationTruth");
      const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (sale.status === "confirmed" && String(sale.notes ?? "").includes("delivered")) {
        await logAudit({ action: "sale.cancel_denied", entityType: "sale", entityId: null, entityRef: input.saleId, beforeJson: sale, reason: input.reason }, ctx);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Delivered sale cannot be cancelled; use return flow" });
      }
      if (sale.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Sale already cancelled" });
      const payments = await db.select().from(counterPayments).where(eq(counterPayments.saleId, input.saleId));
      const paid = payments.filter((p) => p.status === "confirmed").reduce((a, p) => a + Number(p.amount ?? 0), 0);
      const cancellationCost = ["packed","out_for_delivery"].includes(String(sale.status)) ? +(paid * 0.05).toFixed(2) : 0;
      const refundAmount = Math.max(0, +(paid - cancellationCost).toFixed(2));
      await logAudit({ action: "sale.cancel_requested", entityType: "sale", entityId: null, entityRef: input.saleId, beforeJson: sale, reason: input.reason }, ctx);
      const truth = await recordCancellationTruth({ saleId: input.saleId, reason: input.reason, actorId: ctx.user!.id, cancellationCost, refundAmount });
      await logAudit({ action: "sale.cancelled", entityType: "sale", entityId: null, entityRef: input.saleId, afterJson: truth, reason: input.reason }, ctx);
      if (paid > 0) await logAudit({ action: "refund.recorded", entityType: "sale", entityId: null, entityRef: input.saleId, afterJson: { paid, refundAmount, cancellationCost } }, ctx);
      return { ok: true, paid, refundAmount, cancellationCost };
    }),

  // ─── Create Return ───────────────────────────────────────────────────────────
  createReturn: protectedProcedure
    .input(z.object({
      saleId: z.string(),
      reason: z.string().min(1),
      refundMode: z.enum(["cash", "upi", "card", "credit_note"]).default("cash"),
      refundRef: z.string().optional(),
      lines: z.array(z.object({
        saleLineId: z.string(),
        productId: z.string(),
        batchLedgerId: z.string().optional(),
        returnQty: z.number().min(1),
        unitPrice: z.number(),
        gstRate: z.number().default(0),
        stockDisposition: z.enum(["resaleable", "quarantine", "disposal"]).default("resaleable"),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const {
        sales, saleReturns, saleReturnLines, batchLedger, stockMovements,
      } = await import("../../drizzle/schema");
      const [sale] = await db.select().from(sales).where(eq(sales.id, input.saleId)).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (sale.status !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "Can only return confirmed sales" });
      const [existingReturn] = await db.select().from(saleReturns).where(and(eq(saleReturns.saleId, input.saleId), eq(saleReturns.status, "pending"))).limit(1);
      if (existingReturn) return { returnId: existingReturn.id, returnNo: existingReturn.returnNo, totalRefund: Number(existingReturn.totalRefund ?? 0), idempotent: true };
      const now = Date.now();
      const returnNo = await generateReturnNoteNumber(db, sale.storeId);
      const returnId = randomUUID();

      let totalRefund = 0;
      let totalGstReversal = 0;
      for (const l of input.lines) {
        const taxable = l.unitPrice * l.returnQty;
        const gstReversal = +(taxable * (l.gstRate / 100)).toFixed(2);
        const refundAmount = +(taxable + gstReversal).toFixed(2);
        totalRefund += refundAmount;
        totalGstReversal += gstReversal;
      }

      await db.insert(saleReturns).values({
        id: returnId,
        returnNo,
        saleId: input.saleId,
        storeId: sale.storeId,
        reason: input.reason,
        refundMode: input.refundMode,
        refundRef: input.refundRef ?? null,
        totalRefund: String(+totalRefund.toFixed(2)),
        gstReversal: String(+totalGstReversal.toFixed(2)),
        status: "pending",
        createdBy: ctx.user!.id.toString(),
        createdAt: now,
        updatedAt: now,
      });

      for (const l of input.lines) {
        const taxable = l.unitPrice * l.returnQty;
        const gstReversal = +(taxable * (l.gstRate / 100)).toFixed(2);
        const refundAmount = +(taxable + gstReversal).toFixed(2);
        await db.insert(saleReturnLines).values({
          id: randomUUID(),
          returnId,
          saleLineId: l.saleLineId,
          productId: l.productId,
          batchLedgerId: l.batchLedgerId ?? null,
          returnQty: l.returnQty,
          unitPrice: String(l.unitPrice),
          refundAmount: String(refundAmount),
          gstReversal: String(gstReversal),
          stockDisposition: l.stockDisposition,
          createdAt: now,
        });
      }

      await logAudit({ action: "sale.returned", entityType: "sale_return", entityId: null, entityRef: returnId, afterJson: { saleId: input.saleId, returnRef: returnId, totalRefund, returnNo } }, ctx);
      return { returnId, returnNo, totalRefund: +totalRefund.toFixed(2) };
    }),

  // ─── Approve Return (manager) ────────────────────────────────────────────────
  approveReturn: protectedProcedure
    .input(z.object({ returnId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user?.role);
      const db = await getDbSafe();
      const {
        saleReturns, saleReturnLines, batchLedger, sales,
      } = await import("../../drizzle/schema");
      const now = Date.now();
      const [ret] = await db.select().from(saleReturns).where(eq(saleReturns.id, input.returnId)).limit(1);
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      if (ret.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Return already processed" });

      const lines = await db.select().from(saleReturnLines).where(eq(saleReturnLines.returnId, input.returnId));
      const [sale] = await db.select().from(sales).where(eq(sales.id, ret.saleId)).limit(1);

      // Re-enter stock for resaleable items
      for (const l of lines) {
        if (l.batchLedgerId) {
          if (l.stockDisposition === "resaleable") {
            await reverseStockForSaleReturn({ batchId: parseInt(l.batchLedgerId ?? "0") || 0, storeId: parseInt(sale?.storeId ?? "0") || 0, qtyDelta: l.returnQty, referenceType: "sale_return", referenceId: parseInt(input.returnId) || 0, reason: `Return ${ret.returnNo}`, actor: { actorId: ctx.user!.id, actorRole: ctx.user!.role, source: "admin" }, productId: Number(l.productId) });
          } else if (l.stockDisposition === "quarantine") {
            await db.update(batchLedger)
              .set({ qtyQuarantined: sql`${batchLedger.qtyQuarantined} + ${l.returnQty}` })
              .where(eq(batchLedger.id, parseInt(l.batchLedgerId ?? "0") || 0));
          }
          // disposal: no stock re-entry
        }
      }

      await db.update(saleReturns).set({
        status: "approved",
        approvedBy: ctx.user!.id.toString(),
        approvedAt: now,
        updatedAt: now,
      }).where(eq(saleReturns.id, input.returnId));

      // Mark original sale as returned
      await db.update(sales).set({ status: "returned", updatedAt: now }).where(eq(sales.id, ret.saleId));
      await logAudit({ action: "sale.return_approved", entityType: "sale_return", entityId: null, entityRef: input.returnId, beforeJson: { status: "pending" }, afterJson: { status: "approved" } }, ctx);
      return { ok: true };
    }),

  // ─── List Returns ────────────────────────────────────────────────────────────
  listReturns: protectedProcedure
    .input(z.object({
      storeId: z.string().optional(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { saleReturns } = await import("../../drizzle/schema");
      const conditions = [];
      if (input.storeId) conditions.push(eq(saleReturns.storeId, input.storeId));
      if (input.status) conditions.push(eq(saleReturns.status, input.status));
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.select().from(saleReturns)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(saleReturns.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(saleReturns)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: count };
    }),

  // ─── Get Return Detail ───────────────────────────────────────────────────────
  getReturn: protectedProcedure
    .input(z.object({ returnId: z.string() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { saleReturns, saleReturnLines, products } = await import("../../drizzle/schema");
      const [ret] = await db.select().from(saleReturns).where(eq(saleReturns.id, input.returnId)).limit(1);
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db
        .select({ line: saleReturnLines, productName: products.name })
        .from(saleReturnLines)
        .leftJoin(products, eq(saleReturnLines.productId, products.id))
        .where(eq(saleReturnLines.returnId, input.returnId));
      return { ret, lines };
    }),

  // ─── Sales Reports ───────────────────────────────────────────────────────────
  reports: router({
    dailySummary: protectedProcedure
      .input(z.object({
        storeId: z.string().optional(),
        dateFrom: z.number(),
        dateTo: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
        const db = await getDbSafe();
        const { sales } = await import("../../drizzle/schema");
        const conditions = [
          sql`${sales.status} = 'confirmed'`,
          sql`${sales.createdAt} >= ${input.dateFrom}`,
          sql`${sales.createdAt} <= ${input.dateTo}`,
        ];
        if (input.storeId) conditions.push(eq(sales.storeId, input.storeId));
        const rows = await db
          .select({
            date: sql<string>`DATE(FROM_UNIXTIME(${sales.createdAt}/1000))`,
            billCount: sql<number>`COUNT(*)`,
            totalSales: sql<number>`SUM(${sales.total})`,
            totalGst: sql<number>`SUM(${sales.gstAmount})`,
            totalDiscount: sql<number>`SUM(${sales.discountAmount})`,
          })
          .from(sales)
          .where(and(...conditions))
          .groupBy(sql`DATE(FROM_UNIXTIME(created_at/1000))`)
          .orderBy(sql`DATE(FROM_UNIXTIME(created_at/1000))`);
        return { rows };
      }),

    paymentModeSummary: protectedProcedure
      .input(z.object({
        storeId: z.string().optional(),
        dateFrom: z.number(),
        dateTo: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        requireSales(ctx.user?.role);
      if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));
        const db = await getDbSafe();
        const { sales } = await import("../../drizzle/schema");
        const conditions = [
          sql`${sales.status} = 'confirmed'`,
          sql`${sales.createdAt} >= ${input.dateFrom}`,
          sql`${sales.createdAt} <= ${input.dateTo}`,
        ];
        if (input.storeId) conditions.push(eq(sales.storeId, input.storeId));
        const rows = await db
          .select({
            paymentMode: sales.paymentMode,
            billCount: sql<number>`COUNT(*)`,
            totalAmount: sql<number>`SUM(${sales.total})`,
          })
          .from(sales)
          .where(and(...conditions))
          .groupBy(sales.paymentMode);
        return { rows };
      }),
  }),
});
