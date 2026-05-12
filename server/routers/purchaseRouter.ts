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
import { commitPurchaseInvoiceExactlyOnce } from "../services/commercialTruthSeams";
import {
  createLabelPrintJob,
  generateInternalBarcode,
  getBarcodeLabelPayload,
  registerBarcodeAlias,
} from "../services/barcodeService";
import {
  buildIdempotencyKey,
  getRequestIdFromContext,
} from "../services/idempotencyService";
import {
  assertRuntimeGate,
  productToMasterLike,
  validatePurchaseLineMaster,
} from "../services/productMasterValidation";
import { executeCommand } from "../services/executeCommand";
import { purchaseRouterExtension } from "./purchaseRouterExtension";
import { requireStoreAccessForEntity } from "../_core/storeAccessHelpers";
import { emitSloEvent } from "../services/sloService";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

function requirePurchase(role: string | null | undefined) {
  const allowed = [
    "admin",
    "super_admin",
    "store_manager",
    "purchase_manager",
    "pharmacist",
    "inventory_operator",
  ];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Purchase access required",
    });
}
function requireManager(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager", "purchase_manager"];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager role required",
    });
}

function calcGst(
  purchaseRate: number,
  gstRate: number,
  qty: number,
  schemeDiscount: number,
  cashDiscount: number
) {
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

function _computeExpiryBucket(
  expiryDate: Date | string | null
): "normal" | "warning" | "critical" | "quarantine_candidate" | "expired" {
  if (!expiryDate) return "normal";
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return "expired";
  if (days <= 30) return "quarantine_candidate";
  if (days <= 60) return "critical";
  if (days <= 90) return "warning";
  return "normal";
}

async function recalcInvoiceTotals(
  db: Awaited<ReturnType<typeof getDbSafe>>,
  invoiceId: number
) {
  const { purchaseLines, purchaseInvoices } = await import(
    "../../drizzle/schema"
  );
  const lines = await db
    .select()
    .from(purchaseLines)
    .where(eq(purchaseLines.purchaseInvoiceId, invoiceId));
  let totalAmount = 0,
    totalGst = 0,
    totalDiscount = 0;
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
  await db
    .update(purchaseInvoices)
    .set({
      totalAmount: totalAmount.toFixed(2),
      totalGst: totalGst.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      netAmount: netAmount.toFixed(2),
    })
    .where(eq(purchaseInvoices.id, invoiceId));
}

export const purchaseRouter = router({
  ensureScannerReadyForBatch: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        batchId: z.number().optional(),
        batchNo: z.string().optional(),
        storeId: z.number(),
        expiryDate: z.string().optional(),
        mrp: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      requireStoreAccess(ctx.user, input.storeId);
      const internalBarcode = generateInternalBarcode({
        productId: input.productId,
        batchId: input.batchId,
        storeId: input.storeId,
      });
      await registerBarcodeAlias({
        barcode: internalBarcode,
        productId: input.productId,
        batchId: input.batchId,
        storeId: input.storeId,
        aliasType: "internal",
      });
      const payload = getBarcodeLabelPayload({
        productName: `Product-${input.productId}`,
        batchNo: input.batchNo ?? null,
        expiryDate: input.expiryDate ?? null,
        mrp: input.mrp ?? null,
        internalBarcode,
        storeId: input.storeId,
      });
      await createLabelPrintJob({
        productId: input.productId,
        batchId: input.batchId ?? null,
        storeId: input.storeId,
        labelType: "batch",
        payloadJson: payload,
        requestedBy: ctx.user.id,
      });
      return { internalBarcode, queued: true };
    }),

  listLabelQueue: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      const { getLabelPrintQueue } = await import("../services/barcodeService");
      return { rows: await getLabelPrintQueue(input.storeId) };
    }),

  reprintLabel: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      const { reprintLabel } = await import("../services/barcodeService");
      await reprintLabel(input.id);
      return { ok: true };
    }),

  listInvoices: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        supplierId: z.number().optional(),
        status: z
          .enum([
            "draft",
            "committed",
            "partially_returned",
            "returned",
            "cancelled",
          ])
          .optional(),
        invoiceNo: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { purchaseInvoices, suppliers, users } = await import(
        "../../drizzle/schema"
      );
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId)
        conds.push(eq(purchaseInvoices.storeId, input.storeId));
      if (input.supplierId)
        conds.push(eq(purchaseInvoices.supplierId, input.supplierId));
      if (input.status) conds.push(eq(purchaseInvoices.status, input.status));
      if (input.dateFrom)
        conds.push(gte(purchaseInvoices.invoiceDate, input.dateFrom));
      if (input.dateTo)
        conds.push(lte(purchaseInvoices.invoiceDate, input.dateTo));
      const rows = await db
        .select({
          invoice: purchaseInvoices,
          supplierName: suppliers.supplierName,
          createdByName: users.name,
        })
        .from(purchaseInvoices)
        .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
        .leftJoin(users, eq(purchaseInvoices.createdBy, users.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(purchaseInvoices.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(purchaseInvoices)
        .where(conds.length ? and(...conds) : undefined);
      return { rows, total };
    }),

  getInvoice: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      const db = await getDbSafe();
      const { purchaseInvoices, purchaseLines, products, suppliers } =
        await import("../../drizzle/schema");
      const [row] = await db
        .select({
          invoice: purchaseInvoices,
          supplierName: suppliers.supplierName,
        })
        .from(purchaseInvoices)
        .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
        .where(eq(purchaseInvoices.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db
        .select({ line: purchaseLines, productName: products.name })
        .from(purchaseLines)
        .leftJoin(products, eq(purchaseLines.productId, products.id))
        .where(eq(purchaseLines.purchaseInvoiceId, input.id));
      return { ...row, lines };
    }),

  createInvoice: protectedProcedure
    .input(
      z.object({
        supplierId: z.number(),
        storeId: z.number(),
        invoiceNo: z.string().min(1),
        invoiceDate: z.date(),
        supplierGstin: z.string().optional(),
        sourceType: z
          .enum(["manual", "ocr", "import", "whatsapp"])
          .default("manual"),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      requireStoreAccess(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { purchaseInvoices } = await import("../../drizzle/schema");
      const [result] = await db.insert(purchaseInvoices).values({
        supplierId: input.supplierId,
        storeId: input.storeId,
        invoiceNo: input.invoiceNo,
        invoiceDate: input.invoiceDate,
        supplierGstin: input.supplierGstin ?? null,
        sourceType: input.sourceType,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
        status: "draft",
      });
      const id = (result as { insertId: number }).insertId;
      await logAudit(
        {
          action: "purchase.created",
          entityType: "purchase_invoice",
          entityId: id,
          afterJson: { invoiceNo: input.invoiceNo },
        },
        ctx
      );
      return { id };
    }),

  updateInvoice: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        invoiceNo: z.string().optional(),
        invoiceDate: z.date().optional(),
        supplierGstin: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      await requireStoreAccessForEntity("purchase_invoice", input.id, ctx);
      const db = await getDbSafe();
      const { purchaseInvoices } = await import("../../drizzle/schema");
      const [inv] = await db
        .select()
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, input.id));
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only update draft invoices",
        });
      const updates: Record<string, unknown> = {};
      if (input.invoiceNo) updates.invoiceNo = input.invoiceNo;
      if (input.invoiceDate) updates.invoiceDate = input.invoiceDate;
      if (input.supplierGstin !== undefined)
        updates.supplierGstin = input.supplierGstin;
      if (input.notes !== undefined) updates.notes = input.notes;
      await db
        .update(purchaseInvoices)
        .set(updates)
        .where(eq(purchaseInvoices.id, input.id));
      await logAudit(
        {
          action: "purchase.updated",
          entityType: "purchase_invoice",
          entityId: input.id,
          beforeJson: inv,
          afterJson: updates,
        },
        ctx
      );
      return { success: true };
    }),

  cancelInvoice: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      await requireStoreAccessForEntity("purchase_invoice", input.id, ctx);
      const db = await getDbSafe();
      const { purchaseInvoices } = await import("../../drizzle/schema");
      const [inv] = await db
        .select()
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, input.id));
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.status === "committed")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Committed invoices cannot be cancelled — use purchase return",
        });
      await db
        .update(purchaseInvoices)
        .set({ status: "cancelled" })
        .where(eq(purchaseInvoices.id, input.id));
      await logAudit(
        {
          action: "purchase.cancelled",
          entityType: "purchase_invoice",
          entityId: input.id,
          beforeJson: inv,
          afterJson: { status: "cancelled" },
          reason: input.reason,
        },
        ctx
      );
      return { success: true };
    }),

  addLine: protectedProcedure
    .input(
      z.object({
        purchaseInvoiceId: z.number(),
        productId: z.number(),
        batchNo: z.string().min(1),
        mfgDate: z.date().optional(),
        expiryDate: z.date(),
        mrp: z.string(),
        purchaseRate: z.string(),
        saleRate: z.string().optional(),
        qty: z.number().min(1),
        freeQty: z.number().default(0),
        schemeDiscount: z.string().default("0"),
        cashDiscount: z.string().default("0"),
        gstRate: z.string().default("12"),
        hsnCode: z.string().optional(),
        rawLineText: z.string().optional(),
        confidence: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      await requireStoreAccessForEntity(
        "purchase_invoice",
        input.purchaseInvoiceId,
        ctx
      );
      const db = await getDbSafe();
      const { purchaseInvoices, purchaseLines, products } = await import(
        "../../drizzle/schema"
      );
      const [inv] = await db
        .select()
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, input.purchaseInvoiceId));
      if (!inv || inv.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invoice not in draft state",
        });
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, input.productId))
        .limit(1);
      assertRuntimeGate(
        validatePurchaseLineMaster({
          product: product ? productToMasterLike(product) : null,
          productId: input.productId,
          batchNo: input.batchNo,
          expiryDate: input.expiryDate,
          mrp: input.mrp,
          purchaseRate: input.purchaseRate,
          hsnCode: input.hsnCode,
          gstRate: input.gstRate,
        }),
        "Purchase line has incomplete product master or batch metadata"
      );
      const pr = parseFloat(input.purchaseRate),
        gr = parseFloat(input.gstRate),
        sd = parseFloat(input.schemeDiscount),
        cd = parseFloat(input.cashDiscount);
      const { landingCost, gstAmount, taxableAmount } = calcGst(
        pr,
        gr,
        input.qty,
        sd,
        cd
      );
      const mrp = parseFloat(input.mrp);
      const margin =
        mrp > 0 ? +(((mrp - landingCost) / mrp) * 100).toFixed(2) : 0;
      const [result] = await db.insert(purchaseLines).values({
        purchaseInvoiceId: input.purchaseInvoiceId,
        productId: input.productId,
        batchNo: input.batchNo,
        mfgDate: input.mfgDate ?? null,
        expiryDate: input.expiryDate,
        mrp: input.mrp,
        purchaseRate: input.purchaseRate,
        saleRate: input.saleRate ?? null,
        qty: input.qty,
        freeQty: input.freeQty,
        schemeDiscount: input.schemeDiscount,
        cashDiscount: input.cashDiscount,
        gstRate: input.gstRate,
        hsnCode: input.hsnCode ?? null,
        landingCost: landingCost.toString(),
        margin: margin.toString(),
        rawLineText: input.rawLineText ?? null,
        confidence: input.confidence ?? null,
      });
      await recalcInvoiceTotals(db, input.purchaseInvoiceId);
      return {
        id: (result as { insertId: number }).insertId,
        landingCost,
        margin,
        gstAmount,
        taxableAmount,
      };
    }),

  updateLine: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        purchaseRate: z.string().optional(),
        mrp: z.string().optional(),
        saleRate: z.string().optional(),
        qty: z.number().optional(),
        freeQty: z.number().optional(),
        schemeDiscount: z.string().optional(),
        cashDiscount: z.string().optional(),
        gstRate: z.string().optional(),
        hsnCode: z.string().optional(),
        batchNo: z.string().optional(),
        mfgDate: z.date().optional(),
        expiryDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      const db = await getDbSafe();
      const { purchaseLines, purchaseInvoices } = await import(
        "../../drizzle/schema"
      );
      const [line] = await db
        .select()
        .from(purchaseLines)
        .where(eq(purchaseLines.id, input.id));
      if (!line) throw new TRPCError({ code: "NOT_FOUND" });
      await requireStoreAccessForEntity(
        "purchase_invoice",
        line.purchaseInvoiceId,
        ctx
      );
      const [inv] = await db
        .select()
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, line.purchaseInvoiceId));
      if (!inv || inv.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invoice not in draft state",
        });
      const pr = parseFloat(input.purchaseRate ?? line.purchaseRate ?? "0");
      const gr = parseFloat(input.gstRate ?? line.gstRate ?? "12");
      const sd = parseFloat(input.schemeDiscount ?? line.schemeDiscount ?? "0");
      const cd = parseFloat(input.cashDiscount ?? line.cashDiscount ?? "0");
      const qty = input.qty ?? line.qty;
      const mrp = parseFloat(input.mrp ?? line.mrp ?? "0");
      const { landingCost } = calcGst(pr, gr, qty, sd, cd);
      const margin =
        mrp > 0 ? +(((mrp - landingCost) / mrp) * 100).toFixed(2) : 0;
      const updates: Record<string, unknown> = {
        landingCost: landingCost.toString(),
        margin: margin.toString(),
      };
      if (input.purchaseRate) updates.purchaseRate = input.purchaseRate;
      if (input.mrp) updates.mrp = input.mrp;
      if (input.saleRate !== undefined) updates.saleRate = input.saleRate;
      if (input.qty) updates.qty = input.qty;
      if (input.freeQty !== undefined) updates.freeQty = input.freeQty;
      if (input.schemeDiscount !== undefined)
        updates.schemeDiscount = input.schemeDiscount;
      if (input.cashDiscount !== undefined)
        updates.cashDiscount = input.cashDiscount;
      if (input.gstRate !== undefined) updates.gstRate = input.gstRate;
      if (input.hsnCode !== undefined) updates.hsnCode = input.hsnCode;
      if (input.batchNo) updates.batchNo = input.batchNo;
      if (input.mfgDate) updates.mfgDate = input.mfgDate;
      if (input.expiryDate) updates.expiryDate = input.expiryDate;
      await db
        .update(purchaseLines)
        .set(updates)
        .where(eq(purchaseLines.id, input.id));
      await recalcInvoiceTotals(db, line.purchaseInvoiceId);
      return { success: true, landingCost, margin };
    }),

  deleteLine: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      const db = await getDbSafe();
      const { purchaseLines, purchaseInvoices } = await import(
        "../../drizzle/schema"
      );
      const [line] = await db
        .select()
        .from(purchaseLines)
        .where(eq(purchaseLines.id, input.id));
      if (!line) throw new TRPCError({ code: "NOT_FOUND" });
      await requireStoreAccessForEntity(
        "purchase_invoice",
        line.purchaseInvoiceId,
        ctx
      );
      const [inv] = await db
        .select()
        .from(purchaseInvoices)
        .where(eq(purchaseInvoices.id, line.purchaseInvoiceId));
      if (!inv || inv.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invoice not in draft state",
        });
      await db.delete(purchaseLines).where(eq(purchaseLines.id, input.id));
      await recalcInvoiceTotals(db, line.purchaseInvoiceId);
      return { success: true };
    }),

  commitInvoice: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const started = Date.now();
      let withinBudget = false;
      try {
        requirePurchase(ctx.user.role);
        const result = await executeCommand({
          name: "purchase.commitInvoice",
          version: 1,
          idempotencyKey: `purchase:commit:${input.id}`,
          input,
          context: {
            actorUserId: String(ctx.user.id),
            actorRole: ctx.user.role,
            storeId: null,
            traceId: null,
          },
          handler: async (_inp, _tx, _commandCtx) => {
            // syncStoreSkuAggregate({ storeId: inv.storeId, productId: line.productId, variantId: null }) is reconciled after canonical seam stock movements.
            const result = await commitPurchaseInvoiceExactlyOnce({
              invoiceId: input.id,
              idempotencyKey: buildIdempotencyKey([
                "purchase",
                "commit",
                input.id,
                (getRequestIdFromContext(ctx) as string | null) ??
                  "no-request-id",
              ]),
              actorId: ctx.user.id,
              actorRole: ctx.user.role,
            });
            const db = await getDbSafe();
            const { purchaseInvoices } = await import("../../drizzle/schema");
            const [invoice] = await db
              .select()
              .from(purchaseInvoices)
              .where(eq(purchaseInvoices.id, input.id))
              .limit(1);
            const r = result as {
              gstSummary?: unknown;
              idempotent?: boolean;
              duplicate?: boolean;
              status?: string;
            };
            return {
              output: {
                success: result.success,
                gstSummary: invoice?.gstSummary ?? r.gstSummary ?? null,
                idempotent: r.idempotent,
                duplicate: r.duplicate,
                status: r.status,
              },
              sideEffects: [
                {
                  kind: "inventory.snapshot-refresh",
                  payload: { invoiceId: input.id },
                },
              ],
            };
          },
          sloName: "trpc.purchase.commit.p99",
        });
        withinBudget = Date.now() - started <= 500;
        return result;
      } finally {
        void emitSloEvent({
          sloName: "purchase.commitPurchaseInvoice.latency",
          target: 0.95,
          measuredValue: Date.now() - started,
          withinBudget,
          sampleCount: 1,
          windowSeconds: 60,
        });
      }
    }),

  ...purchaseRouterExtension,
});
