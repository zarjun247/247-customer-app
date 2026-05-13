/**
 * salesRouterExtension.ts — second half of salesRouter procedures
 * Covers: listSales, getSale, cancelDraft, cancelSale, createReturn,
 *         approveReturn, listReturns, getReturn, reports
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { eq, and, desc, sql, like, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logAudit } from "../services/audit";
import { reverseStockForSaleReturn } from "../services/stockInvariant";
import { generateReturnNoteNumber } from "../services/invoiceNumbering";
import { requireStoreAccessForEntity } from "../_core/storeAccessHelpers";

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

function requireSales(role: string | null | undefined) {
  const allowed = [
    "admin",
    "super_admin",
    "store_manager",
    "pharmacist",
    "salesman",
    "cashier",
  ];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Sales access required",
    });
}

function requireManager(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager"];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager role required",
    });
}

export const salesRouterExtension = {
  // ─── List Sales ──────────────────────────────────────────────────────────────
  listSales: protectedProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        status: z
          .enum(["draft", "confirmed", "returned", "cancelled"])
          .optional(),
        dateFrom: z.number().optional(),
        dateTo: z.number().optional(),
        search: z.string().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, Number(input.storeId));
      const db = await getDbSafe();
      const { sales } = await import("../../drizzle/schema");
      const conditions = [];
      if (input.storeId) conditions.push(eq(sales.storeId, input.storeId));
      if (input.status) conditions.push(eq(sales.status, input.status));
      if (input.dateFrom)
        conditions.push(sql`${sales.createdAt} >= ${input.dateFrom}`);
      if (input.dateTo)
        conditions.push(sql`${sales.createdAt} <= ${input.dateTo}`);
      if (input.search) {
        const q = `%${input.search}%`;
        conditions.push(
          or(
            like(sales.billNo, q),
            like(sales.customerMobile, q),
            like(sales.customerName, q)
          )
        );
      }
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db
        .select()
        .from(sales)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(sales.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(sales)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: count, page: input.page, pageSize: input.pageSize };
    }),

  // ─── Get Sale Detail ─────────────────────────────────────────────────────────
  getSale: protectedProcedure
    .input(z.object({ saleId: z.string() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      const db = await getDbSafe();
      const { sales, saleLines, products } = await import(
        "../../drizzle/schema"
      );
      const [sale] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .limit(1);
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
      await requireStoreAccessForEntity(
        "sale",
        input.saleId as unknown as number,
        ctx
      );
      const db = await getDbSafe();
      const { sales } = await import("../../drizzle/schema");
      const [sale] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (sale.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft sales can be cancelled",
        });
      await db
        .update(sales)
        .set({ status: "cancelled", updatedAt: Date.now() })
        .where(eq(sales.id, input.saleId));
      await logAudit(
        {
          action: "sale.cancelled",
          entityType: "sale",
          entityId: null,
          entityRef: input.saleId,
          beforeJson: { status: "draft" },
          afterJson: { status: "cancelled" },
          reason: input.reason,
        },
        ctx
      );
      return { ok: true };
    }),

  cancelSale: protectedProcedure
    .input(
      z.object({
        saleId: z.string(),
        reason: z.string().min(3),
        actorNote: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      await requireStoreAccessForEntity(
        "sale",
        input.saleId as unknown as number,
        ctx
      );
      const db = await getDbSafe();
      const { sales, counterPayments } = await import("../../drizzle/schema");
      const { recordCancellationTruth } = await import(
        "../services/reconciliationTruth"
      );
      const [sale] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (
        sale.status === "confirmed" &&
        String(sale.notes ?? "").includes("delivered")
      ) {
        await logAudit(
          {
            action: "sale.cancel_denied",
            entityType: "sale",
            entityId: null,
            entityRef: input.saleId,
            beforeJson: sale,
            reason: input.reason,
          },
          ctx
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Delivered sale cannot be cancelled; use return flow",
        });
      }
      if (sale.status === "cancelled")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sale already cancelled",
        });
      const payments = await db
        .select()
        .from(counterPayments)
        .where(eq(counterPayments.saleId, input.saleId));
      const paid = payments
        .filter(p => p.status === "confirmed")
        .reduce((a, p) => a + Number(p.amount ?? 0), 0);
      const cancellationCost = ["packed", "out_for_delivery"].includes(
        String(sale.status)
      )
        ? +(paid * 0.05).toFixed(2)
        : 0;
      const refundAmount = Math.max(0, +(paid - cancellationCost).toFixed(2));
      await logAudit(
        {
          action: "sale.cancel_requested",
          entityType: "sale",
          entityId: null,
          entityRef: input.saleId,
          beforeJson: sale,
          reason: input.reason,
        },
        ctx
      );
      const truth = await recordCancellationTruth({
        saleId: input.saleId,
        reason: input.reason,
        actorId: ctx.user.id,
        cancellationCost,
        refundAmount,
      });
      await logAudit(
        {
          action: "sale.cancelled",
          entityType: "sale",
          entityId: null,
          entityRef: input.saleId,
          afterJson: truth,
          reason: input.reason,
        },
        ctx
      );
      if (paid > 0)
        await logAudit(
          {
            action: "refund.recorded",
            entityType: "sale",
            entityId: null,
            entityRef: input.saleId,
            afterJson: { paid, refundAmount, cancellationCost },
          },
          ctx
        );
      return { ok: true, paid, refundAmount, cancellationCost };
    }),

  // ─── Create Return ───────────────────────────────────────────────────────────
  createReturn: protectedProcedure
    .input(
      z.object({
        saleId: z.string(),
        reason: z.string().min(1),
        refundMode: z
          .enum(["cash", "upi", "card", "credit_note"])
          .default("cash"),
        refundRef: z.string().optional(),
        lines: z.array(
          z.object({
            saleLineId: z.string(),
            productId: z.string(),
            batchLedgerId: z.string().optional(),
            returnQty: z.number().min(1),
            unitPrice: z.number(),
            gstRate: z.number().default(0),
            stockDisposition: z
              .enum(["resaleable", "quarantine", "disposal"])
              .default("resaleable"),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      await requireStoreAccessForEntity(
        "sale",
        input.saleId as unknown as number,
        ctx
      );
      const db = await getDbSafe();
      const {
        sales,
        saleReturns,
        saleReturnLines,
        batchLedger: _batchLedger,
        stockMovements: _stockMovements,
      } = await import("../../drizzle/schema");
      const [sale] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      if (sale.status !== "confirmed")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only return confirmed sales",
        });
      const [existingReturn] = await db
        .select()
        .from(saleReturns)
        .where(
          and(
            eq(saleReturns.saleId, input.saleId),
            eq(saleReturns.status, "pending")
          )
        )
        .limit(1);
      if (existingReturn)
        return {
          returnId: existingReturn.id,
          returnNo: existingReturn.returnNo,
          totalRefund: Number(existingReturn.totalRefund ?? 0),
          idempotent: true,
        };
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
        createdBy: ctx.user.id.toString(),
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

      await logAudit(
        {
          action: "sale.returned",
          entityType: "sale_return",
          entityId: null,
          entityRef: returnId,
          afterJson: {
            saleId: input.saleId,
            returnRef: returnId,
            totalRefund,
            returnNo,
          },
        },
        ctx
      );
      return { returnId, returnNo, totalRefund: +totalRefund.toFixed(2) };
    }),

  // ─── Approve Return (manager) ────────────────────────────────────────────────
  approveReturn: protectedProcedure
    .input(z.object({ returnId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user?.role);
      const db = await getDbSafe();
      const { saleReturns, saleReturnLines, batchLedger, sales } = await import(
        "../../drizzle/schema"
      );
      const now = Date.now();
      const [ret] = await db
        .select()
        .from(saleReturns)
        .where(eq(saleReturns.id, input.returnId))
        .limit(1);
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      if (ret.status !== "pending")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Return already processed",
        });

      const lines = await db
        .select()
        .from(saleReturnLines)
        .where(eq(saleReturnLines.returnId, input.returnId));
      const [sale] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, ret.saleId))
        .limit(1);

      // Re-enter stock for resaleable items
      for (const l of lines) {
        if (l.batchLedgerId) {
          if (l.stockDisposition === "resaleable") {
            await reverseStockForSaleReturn({
              batchId: parseInt(l.batchLedgerId ?? "0") || 0,
              storeId: parseInt(sale?.storeId ?? "0") || 0,
              qtyDelta: l.returnQty,
              referenceType: "sale_return",
              referenceId: parseInt(input.returnId) || 0,
              reason: `Return ${ret.returnNo}`,
              actor: {
                actorId: ctx.user.id,
                actorRole: ctx.user.role,
                source: "admin",
              },
              productId: Number(l.productId),
            });
          } else if (l.stockDisposition === "quarantine") {
            await db
              .update(batchLedger)
              .set({
                qtyQuarantined: sql`${batchLedger.qtyQuarantined} + ${l.returnQty}`,
              })
              .where(eq(batchLedger.id, parseInt(l.batchLedgerId ?? "0") || 0));
          }
          // disposal: no stock re-entry
        }
      }

      await db
        .update(saleReturns)
        .set({
          status: "approved",
          approvedBy: ctx.user.id.toString(),
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(saleReturns.id, input.returnId));

      // Mark original sale as returned
      await db
        .update(sales)
        .set({ status: "returned", updatedAt: now })
        .where(eq(sales.id, ret.saleId));
      await logAudit(
        {
          action: "sale.return_approved",
          entityType: "sale_return",
          entityId: null,
          entityRef: input.returnId,
          beforeJson: { status: "pending" },
          afterJson: { status: "approved" },
        },
        ctx
      );
      return { ok: true };
    }),

  // ─── List Returns ────────────────────────────────────────────────────────────
  listReturns: protectedProcedure
    .input(
      z.object({
        storeId: z.string().optional(),
        status: z.enum(["pending", "approved", "rejected"]).optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, Number(input.storeId));
      const db = await getDbSafe();
      const { saleReturns } = await import("../../drizzle/schema");
      const conditions = [];
      if (input.storeId)
        conditions.push(eq(saleReturns.storeId, input.storeId));
      if (input.status) conditions.push(eq(saleReturns.status, input.status));
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db
        .select()
        .from(saleReturns)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(saleReturns.createdAt))
        .limit(input.pageSize)
        .offset(offset);
      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(saleReturns)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: count };
    }),

  // ─── Get Return Detail ───────────────────────────────────────────────────────
  getReturn: protectedProcedure
    .input(z.object({ returnId: z.string() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      const db = await getDbSafe();
      const { saleReturns, saleReturnLines, products } = await import(
        "../../drizzle/schema"
      );
      const [ret] = await db
        .select()
        .from(saleReturns)
        .where(eq(saleReturns.id, input.returnId))
        .limit(1);
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
      .input(
        z.object({
          storeId: z.string().optional(),
          dateFrom: z.number(),
          dateTo: z.number(),
        })
      )
      .query(async ({ ctx, input }) => {
        requireSales(ctx.user?.role);
        if (input.storeId !== undefined)
          requireStoreAccess(ctx.user, Number(input.storeId));
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
      .input(
        z.object({
          storeId: z.string().optional(),
          dateFrom: z.number(),
          dateTo: z.number(),
        })
      )
      .query(async ({ ctx, input }) => {
        requireSales(ctx.user?.role);
        if (input.storeId !== undefined)
          requireStoreAccess(ctx.user, Number(input.storeId));
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
};
