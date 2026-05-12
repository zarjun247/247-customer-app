/**
 * purchaseRouterExtension.ts — Extension for purchaseRouter.ts
 *
 * Contains: stockMovements, createReturn, addReturnLine, commitReturn,
 *           listReturns, getReturn, listPayments, recordPayment, allocatePayment,
 *           supplierOutstanding, ageing, reconciliation, reports
 * These are spread into purchaseRouter in purchaseRouter.ts.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { logAudit } from "../services/audit";
import { withIdempotency } from "../services/idempotencyService";
import {
  decreaseStockForPurchaseReturn,
  increaseStockForPurchaseCommit,
} from "../services/stockInvariant";
import { syncStoreSkuAggregate } from "../services/reservationService";
import { requireStoreAccessForEntity } from "../_core/storeAccessHelpers";
import {
  recordSupplierPayable,
  recordSupplierPayment,
  getSupplierOutstanding,
  allocatePaymentToInvoice,
  allocateSupplierPayment,
  applyPurchaseReturnCredit,
  getSupplierAgeing,
  getSupplierReconciliationReport,
} from "../services/supplierLedger";

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

export const purchaseRouterExtension = {
  stockMovements: protectedProcedure
    .input(
      z.object({
        purchaseInvoiceId: z.number().optional(),
        storeId: z.number().optional(),
        batchId: z.number().optional(),
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { stockMovements, batches, products } = await import(
        "../../drizzle/schema"
      );
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId) conds.push(eq(stockMovements.storeId, input.storeId));
      if (input.batchId) conds.push(eq(stockMovements.batchId, input.batchId));
      if (input.purchaseInvoiceId)
        conds.push(
          and(
            eq(stockMovements.referenceType, "purchase_invoice"),
            eq(stockMovements.referenceId, input.purchaseInvoiceId)
          )!
        );
      return db
        .select({
          movement: stockMovements,
          batchNumber: batches.batchNumber,
          productName: products.name,
        })
        .from(stockMovements)
        .leftJoin(batches, eq(stockMovements.batchId, batches.id))
        .leftJoin(products, eq(batches.productId, products.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(stockMovements.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  createReturn: protectedProcedure
    .input(
      z.object({
        purchaseInvoiceId: z.number(),
        supplierId: z.number(),
        storeId: z.number(),
        reason: z.string().optional(),
        debitNoteNo: z.string().optional(),
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
      const { purchaseReturns } = await import("../../drizzle/schema");
      const [result] = await db.insert(purchaseReturns).values({
        purchaseInvoiceId: input.purchaseInvoiceId,
        supplierId: input.supplierId,
        storeId: input.storeId,
        reason: input.reason ?? null,
        debitNoteNo: input.debitNoteNo ?? null,
        createdBy: ctx.user.id,
        status: "draft",
      });
      const id = (result as { insertId: number }).insertId;
      await logAudit(
        {
          action: "purchase.returned",
          entityType: "purchase_return",
          entityId: id,
          afterJson: { purchaseInvoiceId: input.purchaseInvoiceId },
        },
        ctx
      );
      return { id };
    }),

  addReturnLine: protectedProcedure
    .input(
      z.object({
        purchaseReturnId: z.number(),
        purchaseLineId: z.number(),
        batchId: z.number(),
        qty: z.number().min(1),
        returnRate: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseReturnLines, purchaseReturns } = await import(
        "../../drizzle/schema"
      );
      const [ret] = await db
        .select()
        .from(purchaseReturns)
        .where(eq(purchaseReturns.id, input.purchaseReturnId));
      if (!ret || ret.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Return not in draft state",
        });
      const [result] = await db.insert(purchaseReturnLines).values({
        purchaseReturnId: input.purchaseReturnId,
        purchaseLineId: input.purchaseLineId,
        batchId: input.batchId,
        qty: input.qty,
        returnRate: input.returnRate,
        reason: input.reason ?? null,
      });
      const lines = await db
        .select()
        .from(purchaseReturnLines)
        .where(
          eq(purchaseReturnLines.purchaseReturnId, input.purchaseReturnId)
        );
      const total = lines.reduce(
        (s, l) => s + parseFloat(l.returnRate ?? "0") * l.qty,
        0
      );
      await db
        .update(purchaseReturns)
        .set({ totalAmount: total.toFixed(2) })
        .where(eq(purchaseReturns.id, input.purchaseReturnId));
      return { id: (result as { insertId: number }).insertId };
    }),

  commitReturn: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const {
        purchaseReturns,
        purchaseReturnLines,
        batchLedger,
        batches,
        purchaseInvoices,
      } = await import("../../drizzle/schema");
      const [ret] = await db
        .select()
        .from(purchaseReturns)
        .where(eq(purchaseReturns.id, input.id));
      if (!ret || ret.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Return not in draft state",
        });
      const lines = await db
        .select()
        .from(purchaseReturnLines)
        .where(eq(purchaseReturnLines.purchaseReturnId, input.id));
      if (!lines.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No return lines",
        });
      for (const line of lines) {
        const [b] = await db
          .select()
          .from(batches)
          .where(eq(batches.id, line.batchId))
          .limit(1);
        if (b) {
          const [ledger] = await db
            .select()
            .from(batchLedger)
            .where(
              and(
                eq(batchLedger.batchNo, b.batchNumber),
                eq(batchLedger.storeId, ret.storeId),
                eq(batchLedger.productId, b.productId)
              )
            )
            .limit(1);
          if (!ledger)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Canonical ledger missing for batch ${b.batchNumber}`,
            });
          const canonicalBatchAvailable =
            (ledger.qtyOnHand ?? 0) -
            (ledger.qtyReserved ?? 0) -
            (ledger.qtyQuarantined ?? 0) -
            (ledger.qtyExpired ?? 0);
          if (canonicalBatchAvailable < line.qty)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient canonical stock in batch ${b.batchNumber}`,
            });
          const movement = await decreaseStockForPurchaseReturn({
            batchId: ledger.id,
            storeId: ret.storeId,
            qtyDelta: line.qty,
            referenceType: "purchase_return",
            referenceId: ret.id,
            reason: line.reason ?? `Purchase return ${ret.id}`,
            actor: {
              actorId: ctx.user.id,
              actorRole: ctx.user.role,
              source: "admin",
            },
            productId: b.productId,
          });
          await db
            .update(batches)
            .set({ quantity: movement.qtyAfter })
            .where(eq(batches.id, b.id));
          await syncStoreSkuAggregate({
            storeId: ret.storeId,
            productId: b.productId,
            variantId: b.variantId ?? null,
          });
        }
      }
      await db
        .update(purchaseReturns)
        .set({
          status: "committed",
          committedAt: new Date(),
          approvedBy: ctx.user.id,
        })
        .where(eq(purchaseReturns.id, input.id));
      await db
        .update(purchaseInvoices)
        .set({ status: "partially_returned" })
        .where(eq(purchaseInvoices.id, ret.purchaseInvoiceId));
      await applyPurchaseReturnCredit(
        db,
        {
          supplierId: ret.supplierId,
          purchaseInvoiceId: ret.purchaseInvoiceId,
          purchaseReturnId: ret.id,
          storeId: ret.storeId,
          amount: Number(ret.totalAmount ?? 0),
          createdBy: ctx.user.id,
        },
        ctx
      );
      await logAudit(
        {
          action: "purchase.return_committed",
          entityType: "purchase_return",
          entityId: input.id,
          beforeJson: { status: "draft" },
          afterJson: { status: "committed" },
        },
        ctx
      );
      return { success: true };
    }),

  listReturns: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        supplierId: z.number().optional(),
        status: z.enum(["draft", "committed"]).optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { purchaseReturns, suppliers, purchaseInvoices } = await import(
        "../../drizzle/schema"
      );
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId) conds.push(eq(purchaseReturns.storeId, input.storeId));
      if (input.supplierId)
        conds.push(eq(purchaseReturns.supplierId, input.supplierId));
      if (input.status) conds.push(eq(purchaseReturns.status, input.status));
      return db
        .select({
          ret: purchaseReturns,
          supplierName: suppliers.supplierName,
          invoiceNo: purchaseInvoices.invoiceNo,
        })
        .from(purchaseReturns)
        .leftJoin(suppliers, eq(purchaseReturns.supplierId, suppliers.id))
        .leftJoin(
          purchaseInvoices,
          eq(purchaseReturns.purchaseInvoiceId, purchaseInvoices.id)
        )
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(purchaseReturns.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getReturn: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const {
        purchaseReturns,
        purchaseReturnLines,
        purchaseLines,
        products,
        batches,
      } = await import("../../drizzle/schema");
      const [ret] = await db
        .select()
        .from(purchaseReturns)
        .where(eq(purchaseReturns.id, input.id));
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db
        .select({
          line: purchaseReturnLines,
          productName: products.name,
          batchNumber: batches.batchNumber,
        })
        .from(purchaseReturnLines)
        .leftJoin(
          purchaseLines,
          eq(purchaseReturnLines.purchaseLineId, purchaseLines.id)
        )
        .leftJoin(products, eq(purchaseLines.productId, products.id))
        .leftJoin(batches, eq(purchaseReturnLines.batchId, batches.id))
        .where(eq(purchaseReturnLines.purchaseReturnId, input.id));
      return { ret, lines };
    }),

  listPayments: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        storeId: z.number().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const { supplierPayments, suppliers } = await import(
        "../../drizzle/schema"
      );
      const conds: ReturnType<typeof eq>[] = [];
      if (input.supplierId)
        conds.push(eq(supplierPayments.supplierId, input.supplierId));
      if (input.storeId)
        conds.push(eq(supplierPayments.storeId, input.storeId));
      return db
        .select({
          payment: supplierPayments,
          supplierName: suppliers.supplierName,
        })
        .from(supplierPayments)
        .leftJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(supplierPayments.paymentDate))
        .limit(input.limit)
        .offset(input.offset);
    }),

  recordPayment: protectedProcedure
    .input(
      z.object({
        supplierId: z.number(),
        storeId: z.number(),
        purchaseInvoiceId: z.number().optional(),
        amount: z.string(),
        paymentMode: z.enum(["cash", "cheque", "upi", "neft", "rtgs"]),
        referenceNo: z.string().optional(),
        voucherNo: z.string().optional(),
        bankRef: z.string().optional(),
        paymentDate: z.date().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const result = await recordSupplierPayment(
        db,
        {
          supplierId: input.supplierId,
          storeId: input.storeId,
          purchaseInvoiceId: input.purchaseInvoiceId ?? null,
          amount: input.amount,
          paymentMode: input.paymentMode,
          referenceNo: input.referenceNo ?? null,
          voucherNo: input.voucherNo ?? null,
          bankRef: input.bankRef ?? null,
          paymentDate: input.paymentDate ?? new Date(),
          notes: input.notes ?? null,
          createdBy: ctx.user.id,
        },
        ctx
      );
      if (input.purchaseInvoiceId) {
        await allocatePaymentToInvoice(
          db,
          {
            supplierPaymentId: result.id,
            purchaseInvoiceId: input.purchaseInvoiceId,
            amount: Number(input.amount),
            allocationType: "invoice_payment",
            allocatedBy: ctx.user.id,
          },
          ctx
        );
      }
      return { id: result.id };
    }),

  allocatePayment: protectedProcedure
    .input(
      z.object({
        supplierPaymentId: z.number(),
        supplierId: z.number(),
        invoiceIds: z.array(z.number()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      const db = await getDbSafe();
      return allocateSupplierPayment(
        db,
        {
          supplierPaymentId: input.supplierPaymentId,
          supplierId: input.supplierId,
          invoiceIds: input.invoiceIds,
          createdBy: ctx.user.id,
        },
        ctx
      );
    }),

  supplierOutstanding: protectedProcedure
    .input(z.object({ supplierId: z.number(), storeId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDbSafe();
      const row = await getSupplierOutstanding(
        db,
        input.supplierId,
        input.storeId
      );
      const rows = [row];
      return {
        rows,
        totals: { outstanding: row.outstanding },
        csvData: `supplierId,outstanding\n${row.supplierId},${row.outstanding}`,
      };
    }),

  ageing: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        storeId: z.number().optional(),
        asOfDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDbSafe();
      return getSupplierAgeing(db, input);
    }),

  reconciliation: protectedProcedure
    .input(
      z.object({
        supplierId: z.number().optional(),
        storeId: z.number().optional(),
        asOfDate: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDbSafe();
      return getSupplierReconciliationReport(db, input);
    }),

  reports: router({
    register: protectedProcedure
      .input(
        z.object({
          storeId: z.number().optional(),
          supplierId: z.number().optional(),
          dateFrom: z.date().optional(),
          dateTo: z.date().optional(),
          status: z
            .enum([
              "draft",
              "committed",
              "partially_returned",
              "returned",
              "cancelled",
            ])
            .optional(),
          limit: z.number().default(100),
          offset: z.number().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        requirePurchase(ctx.user.role);
        if ((input as any).storeId !== undefined)
          requireStoreAccess(ctx.user, Number((input as any).storeId));
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
            id: purchaseInvoices.id,
            invoiceNo: purchaseInvoices.invoiceNo,
            invoiceDate: purchaseInvoices.invoiceDate,
            supplierId: purchaseInvoices.supplierId,
            supplierName: suppliers.supplierName,
            status: purchaseInvoices.status,
            netAmount: purchaseInvoices.netAmount,
            totalGst: purchaseInvoices.totalGst,
            createdBy: purchaseInvoices.createdBy,
            createdByName: users.name,
          })
          .from(purchaseInvoices)
          .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
          .leftJoin(users, eq(purchaseInvoices.createdBy, users.id))
          .where(conds.length ? and(...conds) : undefined)
          .orderBy(desc(purchaseInvoices.invoiceDate))
          .limit(input.limit)
          .offset(input.offset);
        return { rows };
      }),

    supplierWise: protectedProcedure
      .input(
        z.object({
          storeId: z.number().optional(),
          dateFrom: z.date().optional(),
          dateTo: z.date().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        requirePurchase(ctx.user.role);
        if ((input as any).storeId !== undefined)
          requireStoreAccess(ctx.user, Number((input as any).storeId));
        const db = await getDbSafe();
        const { purchaseInvoices, suppliers } = await import(
          "../../drizzle/schema"
        );
        const conds: ReturnType<typeof eq>[] = [
          eq(purchaseInvoices.status, "committed"),
        ];
        if (input.storeId)
          conds.push(eq(purchaseInvoices.storeId, input.storeId));
        if (input.dateFrom)
          conds.push(gte(purchaseInvoices.invoiceDate, input.dateFrom));
        if (input.dateTo)
          conds.push(lte(purchaseInvoices.invoiceDate, input.dateTo));
        return db
          .select({
            supplierId: purchaseInvoices.supplierId,
            supplierName: suppliers.supplierName,
            invoiceCount: sql<number>`count(*)`,
            totalAmount: sql<number>`COALESCE(SUM(${purchaseInvoices.netAmount}), 0)`,
            totalGst: sql<number>`COALESCE(SUM(${purchaseInvoices.totalGst}), 0)`,
          })
          .from(purchaseInvoices)
          .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
          .where(and(...conds))
          .groupBy(purchaseInvoices.supplierId, suppliers.supplierName)
          .orderBy(desc(sql`SUM(${purchaseInvoices.netAmount})`));
      }),

    productWise: protectedProcedure
      .input(
        z.object({
          storeId: z.number().optional(),
          dateFrom: z.date().optional(),
          dateTo: z.date().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        requirePurchase(ctx.user.role);
        if ((input as any).storeId !== undefined)
          requireStoreAccess(ctx.user, Number((input as any).storeId));
        const db = await getDbSafe();
        const { purchaseLines, purchaseInvoices, products } = await import(
          "../../drizzle/schema"
        );
        const conds: ReturnType<typeof eq>[] = [
          eq(purchaseInvoices.status, "committed"),
        ];
        if (input.storeId)
          conds.push(eq(purchaseInvoices.storeId, input.storeId));
        if (input.dateFrom)
          conds.push(gte(purchaseInvoices.invoiceDate, input.dateFrom));
        if (input.dateTo)
          conds.push(lte(purchaseInvoices.invoiceDate, input.dateTo));
        return db
          .select({
            productId: purchaseLines.productId,
            productName: products.name,
            totalQty: sql<number>`COALESCE(SUM(${purchaseLines.qty}), 0)`,
            totalFreeQty: sql<number>`COALESCE(SUM(${purchaseLines.freeQty}), 0)`,
            totalValue: sql<number>`COALESCE(SUM(${purchaseLines.qty} * ${purchaseLines.purchaseRate}), 0)`,
            avgMargin: sql<number>`COALESCE(AVG(${purchaseLines.margin}), 0)`,
          })
          .from(purchaseLines)
          .innerJoin(
            purchaseInvoices,
            eq(purchaseLines.purchaseInvoiceId, purchaseInvoices.id)
          )
          .leftJoin(products, eq(purchaseLines.productId, products.id))
          .where(and(...conds))
          .groupBy(purchaseLines.productId, products.name)
          .orderBy(
            desc(sql`SUM(${purchaseLines.qty} * ${purchaseLines.purchaseRate})`)
          )
          .limit(200);
      }),

    batchwiseReport: protectedProcedure
      .input(
        z.object({
          storeId: z.number().optional(),
          productId: z.number().optional(),
          supplierId: z.number().optional(),
          dateFrom: z.date().optional(),
          dateTo: z.date().optional(),
          limit: z.number().default(100),
          offset: z.number().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        requirePurchase(ctx.user.role);
        if ((input as any).storeId !== undefined)
          requireStoreAccess(ctx.user, Number((input as any).storeId));
        const db = await getDbSafe();
        const { purchaseLines, purchaseInvoices, products, suppliers } =
          await import("../../drizzle/schema");
        const conds: ReturnType<typeof eq>[] = [
          eq(purchaseInvoices.status, "committed"),
        ];
        if (input.storeId)
          conds.push(eq(purchaseInvoices.storeId, input.storeId));
        if (input.productId)
          conds.push(eq(purchaseLines.productId, input.productId));
        if (input.supplierId)
          conds.push(eq(purchaseInvoices.supplierId, input.supplierId));
        if (input.dateFrom)
          conds.push(gte(purchaseInvoices.invoiceDate, input.dateFrom));
        if (input.dateTo)
          conds.push(lte(purchaseInvoices.invoiceDate, input.dateTo));
        return db
          .select({
            line: purchaseLines,
            productName: products.name,
            supplierName: suppliers.supplierName,
            invoiceNo: purchaseInvoices.invoiceNo,
            invoiceDate: purchaseInvoices.invoiceDate,
          })
          .from(purchaseLines)
          .innerJoin(
            purchaseInvoices,
            eq(purchaseLines.purchaseInvoiceId, purchaseInvoices.id)
          )
          .leftJoin(products, eq(purchaseLines.productId, products.id))
          .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
          .where(and(...conds))
          .orderBy(desc(purchaseInvoices.invoiceDate))
          .limit(input.limit)
          .offset(input.offset);
      }),
  }),
};
