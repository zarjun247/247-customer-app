/**
 * reportsRouter.ts
 * Modular reports engine: daily sale, daily purchase, GST summary,
 * HSN-wise, stock valuation, H1 register, SLA performance.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  requireStoreAccess,
  requireStaffStore,
  type AccessUser,
} from "../_core/rbac";
import { router, protectedProcedure } from "../_core/trpc";
import { reportsOperationsExtension } from "./reportsOperationsExtension";
import {
  buildDailyGstReport,
  buildH1CompletenessReport,
  buildPaymentConsistencyReport,
  buildStockReconciliationReport,
  buildSupplierOutstandingReport,
} from "../services/reconciliationReports";

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

function requireStaff(role: string) {
  const STAFF = [
    "admin",
    "super_admin",
    "store_manager",
    "pharmacist",
    "purchase_manager",
    "accountant",
    "cashier",
    "salesman",
    "inventory_operator",
    "delivery_operator",
    "auditor",
  ];
  if (!STAFF.includes(role)) throw new TRPCError({ code: "FORBIDDEN" });
}

function resolveScopedStoreId(
  user: AccessUser | null | undefined,
  inputStoreId?: number
): number | undefined {
  if (inputStoreId !== undefined) {
    requireStoreAccess(user, inputStoreId);
    return inputStoreId;
  }
  if (user && ["super_admin", "admin", "ops_admin"].includes(user.role ?? ""))
    return undefined;
  return requireStaffStore(user);
}

const dateRangeInput = z.object({
  fromDate: z.string(),
  toDate: z.string(),
  storeId: z.number().optional(),
});

function dateBounds(input: { fromDate: string; toDate: string }) {
  const from = new Date(input.fromDate);
  const to = new Date(input.toDate);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    const rows: unknown = result[0];
    return Array.isArray(rows) ? (rows as T[]) : (result as T[]);
  }
  return [];
}

export const reportsRouter = router({
  // ── Daily Sale Summary ────────────────────────────────────────────────────
  dailySale: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { orders, orderItems, products } = await import(
        "../../drizzle/schema"
      );
      const { eq, and, gte, lte, sum, count } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate);
      to.setHours(23, 59, 59, 999);
      const conditions = [
        gte(orders.createdAt, from),
        lte(orders.createdAt, to),
        eq(orders.status, "delivered"),
      ];
      if (scopedStoreId !== undefined)
        conditions.push(eq(orders.storeId, scopedStoreId));

      const summary = await db
        .select({
          totalOrders: count(orders.id),
          totalRevenue: sum(orders.total),
          totalItems: sum(orderItems.quantity),
        })
        .from(orders)
        .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
        .where(and(...conditions));

      const byCategory = await db
        .select({
          category: products.category,
          revenue: sum(orderItems.lineTotal),
          units: sum(orderItems.quantity),
        })
        .from(orderItems)
        .leftJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(
          and(
            gte(orders.createdAt, from),
            lte(orders.createdAt, to),
            eq(orders.status, "delivered"),
            ...(scopedStoreId !== undefined
              ? [eq(orders.storeId, scopedStoreId)]
              : [])
          )
        )
        .groupBy(products.category);

      return {
        summary: summary[0],
        byCategory,
        rows: byCategory,
        totals: summary[0],
        csvData: byCategory,
      };
    }),

  // ── Daily Purchase Summary ────────────────────────────────────────────────
  dailyPurchase: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { purchaseInvoices, suppliers } = await import(
        "../../drizzle/schema"
      );
      const { eq, and, gte, lte, sum, count, desc } = await import(
        "drizzle-orm"
      );
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate);
      to.setHours(23, 59, 59, 999);
      const conditions = [
        gte(purchaseInvoices.createdAt, from),
        lte(purchaseInvoices.createdAt, to),
        eq(purchaseInvoices.status, "committed"),
      ];
      if (scopedStoreId !== undefined)
        conditions.push(eq(purchaseInvoices.storeId, scopedStoreId));

      const invoices = await db
        .select({
          invoice: purchaseInvoices,
          supplierName: suppliers.supplierName,
        })
        .from(purchaseInvoices)
        .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
        .where(and(...conditions))
        .orderBy(desc(purchaseInvoices.invoiceDate));

      const totals = await db
        .select({
          totalInvoices: count(purchaseInvoices.id),
          totalAmount: sum(purchaseInvoices.netAmount),
          totalGst: sum(purchaseInvoices.totalGst),
        })
        .from(purchaseInvoices)
        .where(and(...conditions));

      return { invoices, totals: totals[0] };
    }),

  // ── GST Summary (GSTR-style) ──────────────────────────────────────────────
  gstSummary: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { orders, orderItems, products } = await import(
        "../../drizzle/schema"
      );
      const { eq, and, gte, lte, sum, sql } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate);
      to.setHours(23, 59, 59, 999);

      const hsnRows = await db
        .select({
          hsnCode: products.hsnCode,
          gstRate: products.gstRate,
          taxableValue: sum(
            sql`${orderItems.lineTotal} / (1 + ${products.gstRate}/100)`
          ),
          gstAmount: sum(
            sql`${orderItems.lineTotal} - ${orderItems.lineTotal} / (1 + ${products.gstRate}/100)`
          ),
          totalValue: sum(orderItems.lineTotal),
          units: sum(orderItems.quantity),
        })
        .from(orderItems)
        .leftJoin(orders, eq(orderItems.orderId, orders.id))
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(
          and(
            gte(orders.createdAt, from),
            lte(orders.createdAt, to),
            eq(orders.status, "delivered"),
            ...(scopedStoreId !== undefined
              ? [eq(orders.storeId, scopedStoreId)]
              : [])
          )
        )
        .groupBy(products.hsnCode, products.gstRate);

      return {
        hsnRows,
        rows: hsnRows,
        totals: { count: hsnRows.length },
        csvData: hsnRows,
      };
    }),

  // ── Stock Valuation ───────────────────────────────────────────────────────
  stockValuation: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { batches, products, storeSkus } = await import(
        "../../drizzle/schema"
      );
      const { eq, and, gt, sum, sql } = await import("drizzle-orm");

      const conditions = [gt(batches.quantity, 0)];
      if (scopedStoreId !== undefined)
        conditions.push(eq(batches.storeId, scopedStoreId));

      const rows = await db
        .select({
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
        .leftJoin(
          storeSkus,
          and(
            eq(storeSkus.productId, batches.productId),
            eq(storeSkus.storeId, batches.storeId)
          )
        )
        .where(and(...conditions))
        .orderBy(products.name);

      const totals = await db
        .select({
          totalStockValue: sum(
            sql`${batches.quantity} * COALESCE(${batches.unitCost}, 0)`
          ),
          totalMrpValue: sum(sql`${batches.quantity} * ${storeSkus.mrp}`),
          totalUnits: sum(batches.quantity),
        })
        .from(batches)
        .leftJoin(
          storeSkus,
          and(
            eq(storeSkus.productId, batches.productId),
            eq(storeSkus.storeId, batches.storeId)
          )
        )
        .where(and(...conditions));

      return { rows, totals: totals[0] };
    }),

  // ── H1 Register ───────────────────────────────────────────────────────────
  h1Register: protectedProcedure
    .input(
      z.object({
        fromDate: z.string(),
        toDate: z.string(),
        storeId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (
        !["admin", "super_admin", "store_manager", "pharmacist"].includes(
          ctx.user.role
        )
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { h1Register } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, desc } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate);
      to.setHours(23, 59, 59, 999);
      const conditions = [
        gte(h1Register.dispensedAt, from),
        lte(h1Register.dispensedAt, to),
      ];
      if (scopedStoreId !== undefined)
        conditions.push(eq(h1Register.storeId, scopedStoreId));
      const rows = await db
        .select()
        .from(h1Register)
        .where(and(...conditions))
        .orderBy(desc(h1Register.dispensedAt));
      const normalized = rows
        .filter(r => r.drugName && !/^\d+$/.test(String(r.drugName)))
        .map(r => ({
          ...r,
          saleRef: r.saleRef ?? (r.saleId == null ? null : String(r.saleId)),
          saleBillNo: r.saleBillNo ?? r.billNo,
        }));
      return Object.assign(normalized, {
        rows: normalized,
        totals: { count: normalized.length },
        csvData: normalized,
      });
    }),

  // ── Stock Reconciliation (read-only canonical availability) ───────────────
  stockReconciliation: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(sql`
        SELECT
          bl.productId AS productId,
          bl.storeId AS storeId,
          MAX(p.name) AS productName,
          MAX(st.name) AS storeName,
          SUM(bl.qtyOnHand) AS ledgerOnHand,
          SUM(bl.qtyReserved) AS ledgerReserved,
          SUM(bl.qtyQuarantined) AS ledgerQuarantined,
          SUM(bl.qtyExpired) AS ledgerExpired,
          COALESCE((
            SELECT SUM(COALESCE(sr.qty, sr.qtyReserved))
            FROM stock_reservations sr
            WHERE sr.productId = bl.productId
              AND sr.storeId = bl.storeId
              AND sr.status = 'active'
              AND (sr.expiresAt IS NULL OR sr.expiresAt > NOW())
          ), 0) AS activeReservationQty,
          COALESCE(MAX(ss.stockQty), 0) AS storeSkuStock,
          COALESCE(MAX(ss.softLockedQty), 0) AS storeSkuSoftLocked,
          COALESCE((
            SELECT SUM(last_moves.qtyAfter)
            FROM (
              SELECT sm.batchId, sm.qtyAfter
              FROM stock_movements sm
              INNER JOIN (
                SELECT batchId, MAX(id) AS lastMovementId
                FROM stock_movements
                GROUP BY batchId
              ) newest ON newest.lastMovementId = sm.id
            ) last_moves
            INNER JOIN batch_ledger movement_bl ON movement_bl.id = last_moves.batchId
            WHERE movement_bl.productId = bl.productId AND movement_bl.storeId = bl.storeId
          ), 0) AS movementProjectedOnHand,
          SUM(bl.qtyOnHand) - SUM(bl.qtyReserved) - SUM(bl.qtyQuarantined) - SUM(bl.qtyExpired) - COALESCE((
            SELECT SUM(COALESCE(sr.qty, sr.qtyReserved))
            FROM stock_reservations sr
            WHERE sr.productId = bl.productId
              AND sr.storeId = bl.storeId
              AND sr.status = 'active'
              AND (sr.expiresAt IS NULL OR sr.expiresAt > NOW())
          ), 0) AS canonicalAvailable,
          COUNT(*) AS batchCount
        FROM batch_ledger bl
        LEFT JOIN products p ON p.id = bl.productId
        LEFT JOIN stores st ON st.id = bl.storeId
        LEFT JOIN store_skus ss ON ss.productId = bl.productId AND ss.storeId = bl.storeId
        WHERE bl.status IN ('active', 'quarantined', 'expired')
          AND (${scopedStoreId ?? null} IS NULL OR bl.storeId = ${scopedStoreId ?? null})
        GROUP BY bl.productId, bl.storeId
        ORDER BY MAX(p.name), bl.storeId
      `);

      return buildStockReconciliationReport(resultRows(result));
    }),

  // ── H1 Completeness (current schema tolerant) ─────────────────────────────
  h1Completeness: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      if (
        ![
          "admin",
          "super_admin",
          "store_manager",
          "pharmacist",
          "auditor",
        ].includes(ctx.user.role)
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { h1Register } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, desc } = await import("drizzle-orm");
      const { from, to } = dateBounds(input);
      const conditions = [
        gte(h1Register.dispensedAt, from),
        lte(h1Register.dispensedAt, to),
      ];
      if (scopedStoreId !== undefined)
        conditions.push(eq(h1Register.storeId, scopedStoreId));
      const rows = await db
        .select()
        .from(h1Register)
        .where(and(...conditions))
        .orderBy(desc(h1Register.dispensedAt));
      return buildH1CompletenessReport(rows);
    }),

  // ── Payment / Refund / Invoice Consistency (current refund source) ────────
  paymentInvoiceConsistency: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const { from, to } = dateBounds(input);
      const result = await db.execute(sql`
        SELECT
          o.id AS orderId,
          o.storeId AS storeId,
          o.status AS status,
          o.total AS orderTotal,
          COALESCE(SUM(CASE WHEN pr.status = 'paid' THEN pr.amount ELSE 0 END), 0) AS paidAmountPaise,
          SUM(CASE WHEN pr.status = 'paid' THEN 1 ELSE 0 END) AS paidRecordCount,
          COUNT(pr.id) AS paymentRecordCount,
          COALESCE(SUM(CASE WHEN pr.status = 'refunded' OR pr.refundId IS NOT NULL OR pr.refundedAt IS NOT NULL THEN pr.amount ELSE 0 END), 0) AS refundedAmountPaise,
          SUM(CASE WHEN pr.status = 'refunded' OR pr.refundId IS NOT NULL OR pr.refundedAt IS NOT NULL THEN 1 ELSE 0 END) AS refundRecordCount,
          o.invoiceUrl AS invoiceUrl,
          o.invoiceKey AS invoiceKey,
          COUNT(h1.billNo) AS billNoCount,
          COUNT(DISTINCT h1.billNo) AS distinctBillNoCount
        FROM orders o
        LEFT JOIN payment_records pr ON pr.orderId = o.id
        LEFT JOIN h1_register h1 ON h1.saleId = o.id
        WHERE o.createdAt >= ${from}
          AND o.createdAt <= ${to}
          AND (${scopedStoreId ?? null} IS NULL OR o.storeId = ${scopedStoreId ?? null})
        GROUP BY o.id, o.storeId, o.status, o.total, o.invoiceUrl, o.invoiceKey
        ORDER BY o.createdAt DESC
      `);
      return buildPaymentConsistencyReport(resultRows(result));
    }),

  // ── Supplier Outstanding (current payable/payment data) ──────────────────
  supplierOutstanding: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        supplierId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(sql`
        SELECT
          pi.supplierId AS supplierId,
          MAX(s.supplierName) AS supplierName,
          pi.storeId AS storeId,
          COALESCE(SUM(pi.netAmount), 0) AS invoiceTotal,
          COUNT(pi.id) AS committedInvoiceCount,
          COALESCE((
            SELECT SUM(sp.amount)
            FROM supplier_payments sp
            WHERE sp.supplierId = pi.supplierId AND sp.storeId = pi.storeId
          ), 0) AS paymentTotal,
          COALESCE((
            SELECT SUM(pr.totalAmount)
            FROM purchase_returns pr
            WHERE pr.supplierId = pi.supplierId AND pr.storeId = pi.storeId AND pr.status = 'committed'
          ), 0) AS returnCreditTotal
        FROM purchase_invoices pi
        LEFT JOIN suppliers s ON s.id = pi.supplierId
        WHERE pi.status IN ('committed', 'partially_returned')
          AND (${scopedStoreId ?? null} IS NULL OR pi.storeId = ${scopedStoreId ?? null})
          AND (${input.supplierId ?? null} IS NULL OR pi.supplierId = ${input.supplierId ?? null})
        GROUP BY pi.supplierId, pi.storeId
        ORDER BY MAX(s.supplierName), pi.storeId
      `);
      return buildSupplierOutstandingReport(resultRows(result));
    }),

  // ── Daily Sale GST Summary ────────────────────────────────────────────────
  dailySaleGst: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const { from, to } = dateBounds(input);
      const result = await db.execute(sql`
        SELECT
          DATE(o.createdAt) AS date,
          o.storeId AS storeId,
          COALESCE(SUM(oi.lineTotal / (1 + COALESCE(p.gstRate, 0) / 100)), 0) AS taxableValue,
          COALESCE(SUM(oi.lineTotal - (oi.lineTotal / (1 + COALESCE(p.gstRate, 0) / 100))), 0) AS gstAmount,
          COALESCE(SUM(oi.lineTotal), 0) AS grossSales,
          0 AS discounts,
          COALESCE(SUM(CASE WHEN o.status = 'returned' THEN oi.lineTotal ELSE 0 END), 0) AS refundsOrReturns,
          COUNT(DISTINCT CASE WHEN o.invoiceUrl IS NOT NULL OR o.invoiceKey IS NOT NULL OR h1.billNo IS NOT NULL THEN o.id END) AS invoiceCount
        FROM orders o
        LEFT JOIN order_items oi ON oi.orderId = o.id
        LEFT JOIN products p ON p.id = oi.productId
        LEFT JOIN h1_register h1 ON h1.saleId = o.id
        WHERE o.createdAt >= ${from}
          AND o.createdAt <= ${to}
          AND o.status IN ('delivered', 'closed', 'returned')
          AND (${scopedStoreId ?? null} IS NULL OR o.storeId = ${scopedStoreId ?? null})
        GROUP BY DATE(o.createdAt), o.storeId
        ORDER BY DATE(o.createdAt), o.storeId
      `);
      return buildDailyGstReport(resultRows(result));
    }),
  // ── SLA Performance Report ────────────────────────────────────────────────
  slaPerformance: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { slaEvents } = await import("../../drizzle/schema");
      const { eq, and, gte, lte, count, sql } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate);
      to.setHours(23, 59, 59, 999);
      const conditions = [
        gte(slaEvents.createdAt, from),
        lte(slaEvents.createdAt, to),
      ];
      if (scopedStoreId !== undefined)
        conditions.push(eq(slaEvents.storeId, scopedStoreId));

      const rows = await db
        .select({
          total: count(slaEvents.id),
          breached: sql`SUM(CASE WHEN ${slaEvents.breached} = 1 THEN 1 ELSE 0 END)`,
          onTime: sql`SUM(CASE WHEN ${slaEvents.breached} = 0 AND ${slaEvents.deliveredAt} IS NOT NULL THEN 1 ELSE 0 END)`,
          avgDeliveryMins: sql`AVG(CASE WHEN ${slaEvents.deliveredAt} IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, ${slaEvents.slaStartedAt}, ${slaEvents.deliveredAt}) END)`,
        })
        .from(slaEvents)
        .where(and(...conditions));

      return rows[0];
    }),

  ...reportsOperationsExtension,
});
