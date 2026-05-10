import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { sql } from "drizzle-orm";

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

function requireAdmin(role: string) {
  const ADMIN = ["admin", "super_admin"];
  if (!ADMIN.includes(role)) throw new TRPCError({ code: "FORBIDDEN" });
}

export const multiStoreRuntimeRouter = router({
  // Per-store health summary
  storeHealth: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql: sqlTemplate } = await import("drizzle-orm");
      const result = await db.execute(
        sqlTemplate`
          SELECT 
            s.id,
            s.name,
            s.isActive,
            COUNT(DISTINCT o.id) AS orderCount24h,
            COUNT(DISTINCT st.id) AS stockItemCount,
            SUM(CASE WHEN o.createdAt > DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 ELSE 0 END) AS ordersLastHour,
            (SELECT COUNT(*) FROM orders WHERE storeId = ${input.storeId} AND status = 'pending') AS pendingOrders,
            (SELECT COUNT(*) FROM stockReservations WHERE storeId = ${input.storeId} AND status = 'active') AS activeReservations
          FROM stores s
          LEFT JOIN orders o ON s.id = o.storeId AND o.createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)
          LEFT JOIN storeSkus st ON s.id = st.storeId
          WHERE s.id = ${input.storeId}
          GROUP BY s.id
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return { storeId: input.storeId, data: rows[0] ?? { storeId: input.storeId, status: 'not_found' } };
    }),

  // All stores health summary
  allStoresHealth: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql: sqlTemplate } = await import("drizzle-orm");
      const result = await db.execute(
        sqlTemplate`
          SELECT 
            s.id,
            s.name,
            s.isActive,
            COUNT(DISTINCT o.id) AS orderCount24h,
            COUNT(DISTINCT st.id) AS stockItemCount,
            SUM(CASE WHEN o.status = 'pending' THEN 1 ELSE 0 END) AS pendingOrders,
            (SELECT COUNT(*) FROM stockReservations WHERE storeId = s.id AND status = 'active') AS activeReservations
          FROM stores s
          LEFT JOIN orders o ON s.id = o.storeId AND o.createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)
          LEFT JOIN storeSkus st ON s.id = st.storeId
          GROUP BY s.id
          ORDER BY s.priority ASC, s.name ASC
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return { storeCount: rows.length, stores: rows };
    }),

  // Stock isolation check per store
  storeStockIsolation: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql: sqlTemplate } = await import("drizzle-orm");
      const result = await db.execute(
        sqlTemplate`
          SELECT 
            s.id AS storeId,
            s.name AS storeName,
            COUNT(ss.id) AS totalSkus,
            COUNT(CASE WHEN ss.stockQty > 0 THEN 1 END) AS skusInStock,
            COUNT(CASE WHEN ss.stockQty < 0 THEN 1 END) AS negativeStockCount,
            COUNT(CASE WHEN ss.stockQty = 0 THEN 1 END) AS outOfStockCount,
            ROUND(AVG(ss.stockQty), 2) AS avgStockQty,
            MIN(ss.stockQty) AS minStockQty,
            MAX(ss.stockQty) AS maxStockQty
          FROM stores s
          LEFT JOIN storeSkus ss ON s.id = ss.storeId
          WHERE s.id = ${input.storeId}
          GROUP BY s.id
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return { storeId: input.storeId, isolation: rows[0] ?? { storeId: input.storeId, totalSkus: 0 } };
    }),

  // Cross-store transfer warnings (stock movements across stores)
  crossStoreTransferWarnings: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql: sqlTemplate } = await import("drizzle-orm");
      const result = await db.execute(
        sqlTemplate`
          SELECT 
            sm.id,
            sm.medicineId,
            m.name AS medicineName,
            sm.fromStoreId,
            sf.name AS fromStoreName,
            sm.toStoreId,
            st.name AS toStoreName,
            sm.quantity,
            sm.movementType,
            sm.createdAt,
            sm.notes
          FROM stockMovement sm
          LEFT JOIN medicines m ON sm.medicineId = m.id
          LEFT JOIN stores sf ON sm.fromStoreId = sf.id
          LEFT JOIN stores st ON sm.toStoreId = st.id
          WHERE sm.movementType = 'stock_transfer' AND sm.toStoreId IS NOT NULL
          ORDER BY sm.createdAt DESC
          LIMIT 100
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return { crossStoreTransfers: rows.length, data: rows };
    }),

  // Per-store reconciliation health
  storeReconciliationHealth: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql: sqlTemplate } = await import("drizzle-orm");
      const result = await db.execute(
        sqlTemplate`
          SELECT 
            ${input.storeId} AS storeId,
            (SELECT COUNT(*) FROM orders WHERE storeId = ${input.storeId} AND totalAmountPaise != COALESCE((SELECT SUM(amountPaise) FROM paymentRecords WHERE orderId = orders.id), 0)) AS paymentMismatchCount,
            (SELECT COUNT(*) FROM refunds r WHERE r.status = 'completed' AND EXISTS (SELECT 1 FROM orders WHERE id = r.orderId AND storeId = ${input.storeId}) AND (SELECT COUNT(*) FROM accountingLedger WHERE refundId = r.id AND entryType = 'reversal') = 0) AS refundReversalGapsCount,
            (SELECT COUNT(*) FROM orders WHERE storeId = ${input.storeId} AND paymentMethod = 'cod' AND status = 'completed' AND (SELECT COUNT(*) FROM paymentRecords WHERE orderId = orders.id AND status = 'confirmed') = 0) AS codCollectionGapsCount
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return { storeId: input.storeId, reconciliation: rows[0] ?? { storeId: input.storeId, paymentMismatchCount: 0, refundReversalGapsCount: 0, codCollectionGapsCount: 0 } };
    }),

  // Per-store provider/dead-letter health
  storeProviderHealth: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql: sqlTemplate } = await import("drizzle-orm");
      const result = await db.execute(
        sqlTemplate`
          SELECT 
            ${input.storeId} AS storeId,
            (SELECT COUNT(*) FROM provider_dead_letters WHERE provider IN ('payment', 'sms', 'whatsapp', 'otp') AND createdAt > DATE_SUB(NOW(), INTERVAL 7 DAY)) AS deadLettersLast7Days,
            (SELECT COUNT(*) FROM provider_webhook_events WHERE status = 'failed' AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS failedWebhooksLast24h,
            (SELECT COUNT(*) FROM provider_webhook_events WHERE status = 'retry_scheduled' AND attemptCount > 0) AS scheduledRetries
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return { storeId: input.storeId, providerHealth: rows[0] ?? { storeId: input.storeId, deadLettersLast7Days: 0, failedWebhooksLast24h: 0, scheduledRetries: 0 } };
    }),

  // Per-store order/payment/refund summary
  storeOrderSummary: protectedProcedure
    .input(z.object({ storeId: z.number(), days: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { sql: sqlTemplate } = await import("drizzle-orm");
      const days = input.days ?? 7;
      const result = await db.execute(
        sqlTemplate`
          SELECT 
            ${input.storeId} AS storeId,
            COUNT(DISTINCT o.id) AS totalOrders,
            SUM(CASE WHEN o.status = 'pending' THEN 1 ELSE 0 END) AS pendingOrders,
            SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completedOrders,
            SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledOrders,
            SUM(o.totalAmountPaise) AS totalRevenue,
            COUNT(DISTINCT r.id) AS totalRefunds,
            SUM(CASE WHEN r.status = 'completed' THEN r.amountPaise ELSE 0 END) AS refundedAmount,
            ROUND(AVG(CASE WHEN o.status = 'completed' THEN TIMESTAMPDIFF(MINUTE, o.createdAt, o.completedAt) END), 1) AS avgFulfillmentMinutes
          FROM orders o
          LEFT JOIN refunds r ON o.id = r.orderId
          WHERE o.storeId = ${input.storeId} AND o.createdAt > DATE_SUB(NOW(), INTERVAL ${days} DAY)
          GROUP BY o.storeId
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return { storeId: input.storeId, days, summary: rows[0] ?? { storeId: input.storeId, totalOrders: 0 } };
    }),

  // Staff/store permission boundary check
  staffStoreAccessCheck: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx.user!.role);
      const db = await getDbSafe();
      const { sql: sqlTemplate } = await import("drizzle-orm");
      const result = await db.execute(
        sqlTemplate`
          SELECT 
            u.id,
            u.name,
            u.role,
            u.staffStoreId,
            u.assignedStoreId,
            s.name AS assignedStoreName,
            (SELECT COUNT(*) FROM orders WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY) AND storeId = u.staffStoreId) AS ordersAccessible,
            (SELECT COUNT(*) FROM orders WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY) AND storeId != u.staffStoreId) AS ordersNotAccessible
          FROM users u
          LEFT JOIN stores s ON u.staffStoreId = s.id
          WHERE u.id = ${input.userId}
        `
      );
      const rows = ((result as any)?.[0] ?? []) as any[];
      return { userId: input.userId, accessCheck: rows[0] ?? { userId: input.userId, status: 'user_not_found' } };
    }),
});
