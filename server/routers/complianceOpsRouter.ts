/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { redactReportPayload } from "../services/reconciliationReports";

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

export const complianceOpsRouter = router({
  // H1 Register Visibility - regulated/controlled substance sales log
  h1Register: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const limit = input.limit ?? 1000;
      const result = await db.execute(
        sql`
          SELECT 
            o.id AS orderId,
            o.createdAt,
            oi.quantity,
            m.scheduleType,
            u.name AS pharmacistName,
            o.status
          FROM orders o
          JOIN orderItems oi ON o.id = oi.orderId
          JOIN medicines m ON m.id = oi.medicineId
          LEFT JOIN users u ON u.id = o.approvedByPharmacistId
          WHERE m.scheduleType IN ('H', 'H1', 'X')
          ORDER BY o.createdAt DESC
          LIMIT ${limit}
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({
        rows,
        totals: { count: rows.length },
        csvData: rows,
      });
    }),

  // Regulated Sale Review Queue - pending pharmacist reviews
  regulatedSaleQueue: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(
        sql`
          SELECT 
            o.id,
            o.createdAt,
            o.status,
            COUNT(oi.id) AS itemCount,
            u.name AS createdBy
          FROM orders o
          JOIN orderItems oi ON o.id = oi.orderId
          JOIN medicines m ON m.id = oi.medicineId
          LEFT JOIN users u ON u.id = o.userId
          WHERE m.scheduleType IN ('H', 'H1', 'X')
            AND o.status NOT IN ('completed', 'cancelled')
          GROUP BY o.id
          ORDER BY o.createdAt DESC
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({
        rows,
        totals: { pending: rows.length },
        csvData: rows,
      });
    }),

  // Prescription Audit Queue - orders with prescriptions requiring review
  prescriptionAuditQueue: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const limit = input.limit ?? 500;
      const result = await db.execute(
        sql`
          SELECT 
            o.id AS orderId,
            o.createdAt,
            o.status,
            o.prescriptionPath,
            COALESCE(u.name, 'Unknown') AS pharmacistName,
            GROUP_CONCAT(m.name, ', ') AS medicines
          FROM orders o
          LEFT JOIN orderItems oi ON o.id = oi.orderId
          LEFT JOIN medicines m ON m.id = oi.medicineId
          LEFT JOIN users u ON u.id = o.approvedByPharmacistId
          WHERE o.prescriptionPath IS NOT NULL
            AND o.status NOT IN ('completed', 'cancelled')
          GROUP BY o.id
          ORDER BY o.createdAt DESC
          LIMIT ${limit}
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({
        rows,
        totals: { pending: rows.length },
        csvData: rows,
      });
    }),

  // Pharmacist Approval Summary - approval rates and times
  pharmacistApprovalSummary: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(
        sql`
          SELECT 
            u.id,
            u.name,
            COUNT(o.id) AS totalApprovals,
            MIN(o.approvalAt) AS firstApproval,
            MAX(o.approvalAt) AS lastApproval
          FROM users u
          JOIN orders o ON u.id = o.approvedByPharmacistId
          WHERE u.role = 'pharmacist'
            AND o.approvalAt IS NOT NULL
          GROUP BY u.id
          ORDER BY totalApprovals DESC
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({
        rows,
        totals: { pharmacists: rows.length },
        csvData: rows,
      });
    }),

  // Controlled Item Exceptions - items out of normal patterns
  controlledItemExceptions: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(
        sql`
          SELECT 
            m.id,
            m.name,
            m.scheduleType,
            COUNT(oi.id) AS salesCount,
            SUM(oi.quantity) AS totalQty,
            MAX(o.createdAt) AS lastSale,
            ROUND(AVG(oi.quantity), 1) AS avgQtyPerOrder
          FROM medicines m
          JOIN orderItems oi ON m.id = oi.medicineId
          JOIN orders o ON o.id = oi.orderId
          WHERE m.scheduleType IN ('H', 'H1', 'X')
          GROUP BY m.id
          HAVING totalQty > 100 OR avgQtyPerOrder > 5
          ORDER BY totalQty DESC
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return redactReportPayload({
        rows,
        totals: { exceptions: rows.length },
        csvData: rows,
      });
    }),

  // Inspection Export Manifest Foundation
  inspectionManifest: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(
        sql`
          SELECT 
            'H1_Register' AS reportType,
            COUNT(DISTINCT o.id) AS recordCount,
            MIN(o.createdAt) AS periodStart,
            MAX(o.createdAt) AS periodEnd,
            'ready' AS exportStatus
          FROM orders o
          JOIN orderItems oi ON o.id = oi.orderId
          JOIN medicines m ON m.id = oi.medicineId
          WHERE m.scheduleType IN ('H', 'H1', 'X')
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      const manifest =
        rows.length > 0
          ? rows[0]
          : {
              reportType: "H1_Register",
              recordCount: 0,
              exportStatus: "ready",
            };
      return redactReportPayload({ manifest, totals: manifest });
    }),
});
