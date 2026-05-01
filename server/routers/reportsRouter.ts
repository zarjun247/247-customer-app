/**
 * reportsRouter.ts
 * Modular reports engine: daily sale, daily purchase, GST summary,
 * HSN-wise, stock valuation, H1 register, SLA performance.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function requireStaff(role: string) {
  const STAFF = ["admin", "super_admin", "store_manager", "pharmacist", "purchase_manager", "accountant", "cashier", "salesman", "inventory_operator", "delivery_operator", "auditor"];
  if (!STAFF.includes(role)) throw new TRPCError({ code: "FORBIDDEN" });
}

const dateRangeInput = z.object({
  fromDate: z.string(),
  toDate: z.string(),
  storeId: z.number().optional(),
});

export const reportsRouter = router({
  // ── Daily Sale Summary ────────────────────────────────────────────────────
  dailySale: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { orders, orderItems, products } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, sql, sum, count } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate); to.setHours(23, 59, 59, 999);
      const conditions = [
        gte(orders.createdAt, from),
        lte(orders.createdAt, to),
        eq(orders.status, "delivered"),
      ];
      if (input.storeId) conditions.push(eq(orders.storeId, input.storeId));

      const summary = await db.select({
        totalOrders: count(orders.id),
        totalRevenue: sum(orders.total),
        totalItems: sum(orderItems.quantity),
      })
        .from(orders)
        .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
        .where(and(...conditions));

      const byCategory = await db.select({
        category: products.category,
        revenue: sum(orderItems.lineTotal),
        units: sum(orderItems.quantity),
      })
        .from(orderItems)
        .leftJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(and(
          gte(orders.createdAt, from),
          lte(orders.createdAt, to),
          eq(orders.status, "delivered"),
          ...(input.storeId ? [eq(orders.storeId, input.storeId)] : []),
        ))
        .groupBy(products.category);

      return { rows: byCategory, csvData: byCategory, totals: summary[0] };
    }),

  // ── Daily Purchase Summary ────────────────────────────────────────────────
  dailyPurchase: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { purchaseInvoices, suppliers } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, sum, count, desc } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate); to.setHours(23, 59, 59, 999);
      const conditions = [
        gte(purchaseInvoices.createdAt, from),
        lte(purchaseInvoices.createdAt, to),
        eq(purchaseInvoices.status, "committed"),
      ];
      if (input.storeId) conditions.push(eq(purchaseInvoices.storeId, input.storeId));

      const invoices = await db.select({
        invoice: purchaseInvoices,
        supplierName: suppliers.supplierName,
      })
        .from(purchaseInvoices)
        .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
        .where(and(...conditions))
        .orderBy(desc(purchaseInvoices.invoiceDate));

      const totals = await db.select({
        totalInvoices: count(purchaseInvoices.id),
        totalAmount: sum(purchaseInvoices.netAmount),
        totalGst: sum(purchaseInvoices.totalGst),
      })
        .from(purchaseInvoices)
        .where(and(...conditions));

      const rows = invoices.map((r) => ({ ...r.invoice, supplierName: r.supplierName }));
      return { rows, csvData: rows, totals: totals[0] };
    }),

  // ── GST Summary (GSTR-style) ──────────────────────────────────────────────
  gstSummary: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { orders, orderItems, products } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, sum, sql } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate); to.setHours(23, 59, 59, 999);

      const hsnRows = await db.select({
        hsnCode: products.hsnCode,
        gstRate: products.gstRate,
        taxableValue: sum(sql`${orderItems.lineTotal} / (1 + ${products.gstRate}/100)`),
        gstAmount: sum(sql`${orderItems.lineTotal} - ${orderItems.lineTotal} / (1 + ${products.gstRate}/100)`),
        totalValue: sum(orderItems.lineTotal),
        units: sum(orderItems.quantity),
      })
        .from(orderItems)
        .leftJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(and(
          gte(orders.createdAt, from),
          lte(orders.createdAt, to),
          eq(orders.status, "delivered"),
          ...(input.storeId ? [eq(orders.storeId, input.storeId)] : []),
        ))
        .groupBy(products.hsnCode, products.gstRate);

      return { rows: hsnRows, csvData: hsnRows };
    }),

  // ── Stock Valuation ───────────────────────────────────────────────────────
  stockValuation: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { batches, products, storeSkus } = await import("../../drizzle/schema");
      const { eq, and, gt, sum, sql } = await import("drizzle-orm");

      const conditions = [gt(batches.quantity, 0)];
      if (input.storeId) conditions.push(eq(batches.storeId, input.storeId));

      const rows = await db.select({
        productId: products.id,
        productName: products.name,
        category: products.category,
        batchNumber: batches.batchNumber,
        expiryDate: batches.expiryDate,
        quantity: batches.quantity,
        unitCost: batches.unitCost,
        mrp: storeSkus.mrp,
        stockValue: sql`${batches.quantity} * COALESCE(${batches.unitCost}, 0)`,
        mrpValue: sql`${batches.quantity} * ${storeSkus.mrp}`,
      })
        .from(batches)
        .leftJoin(products, eq(batches.productId, products.id))
        .leftJoin(storeSkus, and(eq(storeSkus.productId, batches.productId), eq(storeSkus.storeId, batches.storeId)))
        .where(and(...conditions))
        .orderBy(products.name);

      const totals = await db.select({
        totalStockValue: sum(sql`${batches.quantity} * COALESCE(${batches.unitCost}, 0)`),
        totalMrpValue: sum(sql`${batches.quantity} * ${storeSkus.mrp}`),
        totalUnits: sum(batches.quantity),
      })
        .from(batches)
        .leftJoin(storeSkus, and(eq(storeSkus.productId, batches.productId), eq(storeSkus.storeId, batches.storeId)))
        .where(and(...conditions));

      return { rows, csvData: rows, totals: totals[0] };
    }),

  // ── H1 Register ───────────────────────────────────────────────────────────
  h1Register: protectedProcedure
    .input(z.object({
      fromDate: z.string(),
      toDate: z.string(),
      storeId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!["admin", "super_admin", "store_manager", "pharmacist"].includes(ctx.user!.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDbSafe();
      const { h1Register } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, desc } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate); to.setHours(23, 59, 59, 999);
      const conditions = [gte(h1Register.dispensedAt, from), lte(h1Register.dispensedAt, to)];
      if (input.storeId) conditions.push(eq(h1Register.storeId, input.storeId));
      const rows = await db.select().from(h1Register).where(and(...conditions)).orderBy(desc(h1Register.dispensedAt));
      return { rows, csvData: rows };
    }),

  // ── SLA Performance Report ────────────────────────────────────────────────
  slaPerformance: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { slaEvents } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, count, sql } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate); to.setHours(23, 59, 59, 999);
      const conditions = [gte(slaEvents.createdAt, from), lte(slaEvents.createdAt, to)];
      if (input.storeId) conditions.push(eq(slaEvents.storeId, input.storeId));

      const rows = await db.select({
        total: count(slaEvents.id),
        breached: sql`SUM(CASE WHEN ${slaEvents.breached} = 1 THEN 1 ELSE 0 END)`,
        onTime: sql`SUM(CASE WHEN ${slaEvents.breached} = 0 AND ${slaEvents.deliveredAt} IS NOT NULL THEN 1 ELSE 0 END)`,
        avgDeliveryMins: sql`AVG(CASE WHEN ${slaEvents.deliveredAt} IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, ${slaEvents.slaStartedAt}, ${slaEvents.deliveredAt}) END)`,
      })
        .from(slaEvents)
        .where(and(...conditions));

      return { rows: [rows[0]], csvData: [rows[0]], totals: rows[0] };
    }),

  // ── Near-Expiry Stock Report ──────────────────────────────────────────────
  nearExpiry: protectedProcedure
    .input(z.object({ storeId: z.number().optional(), days: z.number().default(90) }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { batches, products } = await import("../../drizzle/schema");
      const { eq, and, lte, gt, asc } = await import("drizzle-orm");
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.days);
      const conditions = [lte(batches.expiryDate, cutoff), gt(batches.quantity, 0)];
      if (input.storeId) conditions.push(eq(batches.storeId, input.storeId));
      const rows = await db.select({
        batch: batches,
        productName: products.name,
        category: products.category,
        schedule: products.schedule,
      })
        .from(batches)
        .leftJoin(products, eq(batches.productId, products.id))
        .where(and(...conditions))
        .orderBy(asc(batches.expiryDate));
      return { rows, csvData: rows };
    }),

  // ── Non-Moving Stock ──────────────────────────────────────────────────────
  nonMoving: protectedProcedure
    .input(z.object({ storeId: z.number().optional(), days: z.number().default(90) }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { storeSkus, products } = await import("../../drizzle/schema");
      const { eq, and, gt, lte } = await import("drizzle-orm");
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.days);
      const conditions = [gt(storeSkus.stockQty, 0), lte(storeSkus.updatedAt, cutoff)];
      if (input.storeId) conditions.push(eq(storeSkus.storeId, input.storeId));
      return db.select({
        sku: storeSkus,
        productName: products.name,
        category: products.category,
      })
        .from(storeSkus)
        .leftJoin(products, eq(storeSkus.productId, products.id))
        .where(and(...conditions))
        .orderBy(storeSkus.updatedAt);
    }),

  // ── Shift Closing Summary ─────────────────────────────────────────────────
  shiftClosings: protectedProcedure
    .input(z.object({ storeId: z.number().optional(), limit: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { shiftClosings } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      return db.select().from(shiftClosings)
        .where(input.storeId ? eq(shiftClosings.storeId, input.storeId) : undefined)
        .orderBy(desc(shiftClosings.shiftDate))
        .limit(input.limit);
    }),

  // ── Submit shift closing ──────────────────────────────────────────────────
  submitShiftClosing: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      shiftDate: z.date(),
      openingCash: z.string().default("0"),
      cashSales: z.string().default("0"),
      upiCardSales: z.string().default("0"),
      creditSales: z.string().default("0"),
      refunds: z.string().default("0"),
      expenses: z.string().default("0"),
      cashDeposited: z.string().default("0"),
      actualCash: z.string().default("0"),
      pendingOrders: z.number().default(0),
      cancelledBills: z.number().default(0),
      pharmacistOnDutyId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "super_admin", "store_manager", "cashier"].includes(ctx.user!.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDbSafe();
      const { shiftClosings } = await import("../../drizzle/schema");
      const expectedCash = (
        parseFloat(input.openingCash) +
        parseFloat(input.cashSales) -
        parseFloat(input.refunds) -
        parseFloat(input.expenses)
      ).toFixed(2);
      const variance = (parseFloat(input.actualCash) - parseFloat(expectedCash)).toFixed(2);
      const [result] = await db.insert(shiftClosings).values({
        ...input,
        expectedCash,
        variance,
        cashierId: ctx.user!.id,
        status: "submitted",
      });
      return { id: (result as { insertId: number }).insertId };
    }),
});
