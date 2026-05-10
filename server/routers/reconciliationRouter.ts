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

export const reconciliationRouter = router({
  // Payment vs Order Mismatch - identify payment reconciliation issues
  paymentVsOrderMismatch: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const limit = input.limit ?? 500;
      const result = await db.execute(
        sql`
          SELECT 
            o.id AS orderId,
            o.totalAmountPaise,
            COALESCE(SUM(pr.amountPaise), 0) AS totalPaymentPaise,
            o.totalAmountPaise - COALESCE(SUM(pr.amountPaise), 0) AS mismatchPaise,
            o.status,
            o.createdAt
          FROM orders o
          LEFT JOIN paymentRecords pr ON o.id = pr.orderId
          GROUP BY o.id
          HAVING mismatchPaise != 0
          ORDER BY ABS(mismatchPaise) DESC
          LIMIT ${limit}
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({ rows, totals: { mismatches: rows.length }, csvData: rows });
    }),

  // Refund vs Accounting Reversal Mismatch - track refund accounting integrity
  refundReversalMismatch: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(
        sql`
          SELECT 
            r.id AS refundId,
            r.orderId,
            r.amountPaise,
            r.status,
            r.reason,
            r.createdAt,
            (SELECT COUNT(*) FROM accountingLedger 
             WHERE refundId = r.id AND entryType = 'reversal') AS reversalCount
          FROM refunds r
          WHERE r.status IN ('completed', 'cancelled')
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      const mismatches = rows.filter((r: any) => 
        (r.status === 'completed' && r.reversalCount === 0) ||
        (r.status === 'cancelled' && r.reversalCount > 0)
      );
      return redactReportPayload({ rows, totals: { mismatches: mismatches.length }, csvData: mismatches });
    }),

  // COD Collection Mismatch - track cash-on-delivery payment reconciliation
  codCollectionMismatch: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const limit = input.limit ?? 500;
      const result = await db.execute(
        sql`
          SELECT 
            o.id AS orderId,
            o.status,
            o.totalAmountPaise,
            o.createdAt,
            pr.method,
            pr.status AS paymentStatus,
            CASE 
              WHEN o.status = 'completed' AND pr.status IS NULL THEN 'completed_no_payment_record'
              WHEN o.status != 'completed' AND pr.status = 'confirmed' THEN 'payment_but_order_incomplete'
              ELSE 'ok'
            END AS mismatchType
          FROM orders o
          LEFT JOIN paymentRecords pr ON o.id = pr.orderId AND pr.method = 'cod'
          WHERE o.paymentMethod = 'cod'
          HAVING mismatchType != 'ok'
          ORDER BY o.createdAt DESC
          LIMIT ${limit}
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({ rows, totals: { mismatches: rows.length }, csvData: rows });
    }),

  // Supplier Invoice Duplicate Warnings - non-destructive detection
  supplierInvoiceDuplicates: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(
        sql`
          SELECT 
            s.invoiceNumber,
            s.supplierId,
            COUNT(*) AS duplicateCount,
            SUM(s.totalAmountPaise) AS totalValue,
            GROUP_CONCAT(s.id, ', ') AS invoiceIds
          FROM purchaseInvoices s
          JOIN purchaseInvoices si ON s.invoiceNumber = si.invoiceNumber 
            AND s.supplierId = si.supplierId 
            AND s.id < si.id
          GROUP BY s.invoiceNumber, s.supplierId
          ORDER BY duplicateCount DESC
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({ 
        rows, 
        totals: { duplicateGroups: rows.length, note: 'Non-destructive detection only' }, 
        csvData: rows 
      });
    }),

  // Purchase Invoice Reconciliation Status - track invoice state
  purchaseInvoiceReconciliation: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(
        sql`
          SELECT 
            pi.status,
            COUNT(pi.id) AS invoiceCount,
            SUM(pi.totalAmountPaise) AS totalValue,
            MIN(pi.createdAt) AS oldestInvoice,
            MAX(pi.createdAt) AS newestInvoice
          FROM purchaseInvoices pi
          GROUP BY pi.status
          ORDER BY invoiceCount DESC
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({ rows, totals: { statusCount: rows.length }, csvData: rows });
    }),

  // Stock Valuation vs Stock Movement Summary
  stockValuationMovement: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const limit = input.limit ?? 100;
      const result = await db.execute(
        sql`
          SELECT 
            m.id,
            m.name,
            m.costPricePerUnit,
            (SELECT SUM(quantity) FROM stock WHERE medicineId = m.id) AS currentStock,
            (SELECT COUNT(*) FROM stockMovement WHERE medicineId = m.id) AS movementRecordCount,
            ROUND((SELECT SUM(quantity) FROM stock WHERE medicineId = m.id) * m.costPricePerUnit / 100, 2) AS currentValuation,
            MAX(sm.createdAt) AS lastMovement
          FROM medicines m
          LEFT JOIN stockMovement sm ON m.id = sm.medicineId
          GROUP BY m.id
          HAVING currentStock > 0
          ORDER BY currentValuation DESC
          LIMIT ${limit}
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({ rows, totals: { medicines: rows.length }, csvData: rows });
    }),
});
