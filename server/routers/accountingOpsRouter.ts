import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { redactReportPayload } from "../services/reconciliationReports";

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

function dateRangeInput() {
  return z.object({ fromDate: z.string(), toDate: z.string(), storeId: z.number().optional() });
}

export const accountingOpsRouter = router({
  // Daily sales summary: reuses existing report
  dailySalesSummary: protectedProcedure
    .input(dateRangeInput())
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      // delegate to reportsRouter.dailySale via hardcoded fetch
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate); to.setHours(23,59,59,999);
      const result = await db.execute(sql`
        SELECT 
          COUNT(DISTINCT o.id) AS orderCount,
          COALESCE(SUM(o.total),0) AS totalRevenue,
          COALESCE(SUM(oi.quantity),0) AS totalUnits
        FROM orders o
        LEFT JOIN order_items oi ON oi.orderId = o.id
        WHERE o.createdAt >= ${from} AND o.createdAt <= ${to} AND o.status = 'delivered'
      `);
      const data = (result as any)?.[0]?.[0] ?? { orderCount: 0, totalRevenue: 0, totalUnits: 0 };
      return redactReportPayload({ rows: [data], totals: data, csvData: [data] });
    }),

  // Payment method breakdown (uses paymentRecords table)
  paymentMethodBreakdown: protectedProcedure
    .input(dateRangeInput())
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate); to.setHours(23,59,59,999);
      const result = await db.execute(sql`
        SELECT 'cash' AS method, COALESCE(SUM(amount),0) AS total FROM payment_records 
        WHERE status = 'paid' AND method = 'cash' AND createdAt >= ${from} AND createdAt <= ${to}
        UNION ALL
        SELECT 'upi', COALESCE(SUM(amount),0) FROM payment_records 
        WHERE status = 'paid' AND method = 'upi' AND createdAt >= ${from} AND createdAt <= ${to}
        UNION ALL
        SELECT 'card', COALESCE(SUM(amount),0) FROM payment_records 
        WHERE status = 'paid' AND method = 'card' AND createdAt >= ${from} AND createdAt <= ${to}
      `);
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({ rows, totals: { rowCount: rows.length }, csvData: rows });
    }),

  // Supplier ageing report (reuses builder)
  supplierAgeing: protectedProcedure
    .input(z.object({ storeId: z.number().optional(), supplierId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(sql`
        SELECT 
          pi.supplierId, 
          MAX(s.supplierName) AS supplierName,
          SUM(pi.netAmount) AS invoiceTotal,
          COUNT(pi.id) AS invoiceCount,
          COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplierId = pi.supplierId), 0) AS paymentTotal
        FROM purchase_invoices pi
        LEFT JOIN suppliers s ON s.id = pi.supplierId
        WHERE pi.status IN ('committed', 'partially_returned')
        GROUP BY pi.supplierId
      `);
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({ rows, totals: { rowCount: rows.length }, csvData: rows });
    }),

  // Gross margin summary
  grossMarginSummary: protectedProcedure
    .input(dateRangeInput())
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const from = new Date(input.fromDate);
      const to = new Date(input.toDate); to.setHours(23,59,59,999);
      const result = await db.execute(sql`
        SELECT 
          p.id AS productId,
          p.name AS productName,
          SUM(oi.lineTotal) AS revenue,
          SUM(oi.quantity * COALESCE(b.unitCost,0)) AS cogs,
          SUM(oi.lineTotal) - SUM(oi.quantity * COALESCE(b.unitCost,0)) AS grossMargin
        FROM order_items oi
        LEFT JOIN orders o ON o.id = oi.orderId
        LEFT JOIN products p ON p.id = oi.productId
        LEFT JOIN batches b ON b.productId = p.id AND b.storeId = o.storeId
        WHERE o.createdAt >= ${from} AND o.createdAt <= ${to} AND o.status IN ('delivered','closed')
        GROUP BY p.id, p.name
      `);
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({ rows, totals: { rowCount: rows.length }, csvData: rows });
    }),

  // Invoice integrity: journal batch mismatches
  invoiceIntegrity: protectedProcedure
    .input(dateRangeInput())
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { getJournalBatchMismatches } = await import("../services/accountingLedger");
      const mismatches = await getJournalBatchMismatches(db);
      return redactReportPayload({ mismatches, totals: { unbalanced: mismatches.unbalancedBatchCount ?? 0 } });
    }),
});

