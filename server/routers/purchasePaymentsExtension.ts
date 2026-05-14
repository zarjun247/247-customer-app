import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { requireStoreAccess } from "../_core/rbac";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import {
  recordSupplierPayment,
  getSupplierOutstanding,
  allocatePaymentToInvoice,
  allocateSupplierPayment,
  getSupplierAgeing,
  getSupplierReconciliationReport,
} from "../services/supplierLedger";
import { getDbSafe, requirePurchase } from "./purchaseUtils";

export const purchasePaymentsExtension = {
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
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, Number(input.storeId));
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
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, Number(input.storeId));
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
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, Number(input.storeId));
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
        if (input.storeId !== undefined)
          requireStoreAccess(ctx.user, input.storeId);
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
        if (input.storeId !== undefined)
          requireStoreAccess(ctx.user, input.storeId);
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
        if (input.storeId !== undefined)
          requireStoreAccess(ctx.user, input.storeId);
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
