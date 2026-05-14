/**
 * commandCenterSnapshotRouter — full-snapshot query for Command Center
 * Extracted from commandCenterOcrRouter to keep files under 600 counted lines.
 */
import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  orders,
  prescriptions,
  riders,
  batches,
  storeSkus,
  ingestionJobs,
  refillPlans,
  auditLogs,
  stores,
  medivisionSyncLog,
  sales,
  staffHandoffs,
  slaEvents,
} from "../../drizzle/schema";
import {
  eq,
  and,
  lte,
  gte,
  sql,
  desc,
  inArray,
  ne,
  isNull,
  isNotNull,
  lt,
} from "drizzle-orm";

function assertAdmin(role: string) {
  const ADMIN_ROLES = [
    "admin",
    "super_admin",
    "ops_admin",
    "store_manager",
  ] as const;
  type AdminRole = (typeof ADMIN_ROLES)[number];
  if (!ADMIN_ROLES.includes(role as AdminRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
}

function nowMinus(ms: number) {
  return new Date(Date.now() - ms);
}
function nowPlus(ms: number) {
  return new Date(Date.now() + ms);
}
const HOUR = 3600000;
const DAY = 86400000;

async function runAllCards(
  db: Awaited<ReturnType<typeof getDb>>,
  storeId?: number
) {
  const now = new Date();
  const in15Mins = nowPlus(15 * 60000);
  const since7d = nowMinus(7 * DAY);
  const since24h = nowMinus(24 * HOUR);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cut60 = nowPlus(60 * DAY);
  const cut90 = nowPlus(90 * DAY);
  const in7Date = nowPlus(7 * DAY);
  if (!db) return null;
  const storeFilter = storeId ? eq(orders.storeId, storeId) : undefined;
  const riderStoreFilter = storeId ? eq(riders.storeId, storeId) : undefined;
  const batchStoreFilter = storeId ? eq(batches.storeId, storeId) : undefined;
  const skuStoreFilter = storeId ? eq(storeSkus.storeId, storeId) : undefined;
  const [
    liveOrders,
    riderRows,
    stockoutRows,
    nearExpiryRows,
    pharmacistQ,
    handoffRows,
    appPending,
    counterRows,
    overrideRows,
    buildingRows,
    syncRows,
    ocrRows,
    storeRows,
    importRows,
    refillActive,
    refillDue7,
    refillMissed,
    refillFreshRx,
    expiryV90,
    expiryV60,
    quarantinedV,
    expiredV,
    nodeRows,
    unauditedRows,
    labelRows,
    slaAtRisk,
    slaBreached,
  ] = await Promise.all([
    db
      .select({ status: orders.status, count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(
        and(
          inArray(orders.status, [
            "awaiting_prescription",
            "awaiting_pharmacist_review",
            "clarification_needed",
            "awaiting_allocation",
            "backorder_review",
            "reserved",
            "picking",
            "packed",
            "assigned_to_rider",
            "out_for_delivery",
            "delivery_exception",
          ] as (typeof orders.status.enumValues)[number][]),
          storeFilter
        )
      )
      .groupBy(orders.status),
    db
      .select({ status: riders.status, count: sql<number>`COUNT(*)` })
      .from(riders)
      .where(and(eq(riders.isActive, true), riderStoreFilter))
      .groupBy(riders.status),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(storeSkus)
      .where(
        and(
          eq(storeSkus.isActive, true),
          lte(storeSkus.stockQty, 0),
          skuStoreFilter
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(batches)
      .where(
        and(
          ne(batches.status, "depleted"),
          ne(batches.status, "expired"),
          lte(batches.expiryDate, cut90),
          gte(batches.expiryDate, now),
          batchStoreFilter
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(prescriptions)
      .where(
        inArray(prescriptions.status, [
          "pending_pharmacist",
          "quick_verify",
          "additional_verification",
        ] as (typeof prescriptions.status.enumValues)[number][])
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(staffHandoffs)
      .where(
        inArray(staffHandoffs.status, [
          "open",
          "assigned",
        ] as (typeof staffHandoffs.status.enumValues)[number][])
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(
        and(
          inArray(orders.status, [
            "awaiting_pharmacist_review",
            "awaiting_allocation",
            "reserved",
          ] as (typeof orders.status.enumValues)[number][]),
          eq(orders.source, "app"),
          storeFilter
        )
      ),
    db
      .select({
        count: sql<number>`COUNT(*)`,
        revenue: sql<number>`SUM(total)`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.status, "confirmed"),
          gte(sales.createdAt, today.getTime())
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(auditLogs)
      .where(
        and(gte(auditLogs.createdAt, since24h), sql`action LIKE '%override%'`)
      ),
    db
      .select({ buildingId: orders.buildingId, count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(
        and(
          isNotNull(orders.buildingId),
          gte(orders.placedAt, since7d),
          ne(orders.status, "cancelled")
        )
      )
      .groupBy(orders.buildingId)
      .limit(10),
    db
      .select({ completedAt: medivisionSyncLog.completedAt })
      .from(medivisionSyncLog)
      .orderBy(desc(medivisionSyncLog.startedAt))
      .limit(1),
    db
      .select({ status: ingestionJobs.status, count: sql<number>`COUNT(*)` })
      .from(ingestionJobs)
      .groupBy(ingestionJobs.status),
    db
      .select({
        storeId: orders.storeId,
        count: sql<number>`COUNT(*)`,
        revenue: sql<number>`SUM(orders.total)`,
      })
      .from(orders)
      .where(and(gte(orders.placedAt, since7d), ne(orders.status, "draft")))
      .groupBy(orders.storeId)
      .limit(10),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ingestionJobs)
      .where(
        inArray(ingestionJobs.status, [
          "ocr_complete",
          "under_review",
        ] as (typeof ingestionJobs.status.enumValues)[number][])
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(refillPlans)
      .where(eq(refillPlans.status, "active")),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(refillPlans)
      .where(
        and(
          eq(refillPlans.status, "active"),
          gte(refillPlans.nextDueDate, today),
          lte(refillPlans.nextDueDate, in7Date)
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(refillPlans)
      .where(
        and(
          eq(refillPlans.status, "active"),
          lt(refillPlans.nextDueDate, today)
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(refillPlans)
      .where(
        and(
          eq(refillPlans.status, "active"),
          eq(refillPlans.needsFreshRx, true)
        )
      ),
    db
      .select({
        val: sql<number>`SUM(COALESCE(qtyOnHand,quantity)*COALESCE(purchaseRate,0))`,
      })
      .from(batches)
      .where(
        and(
          ne(batches.status, "depleted"),
          lte(batches.expiryDate, cut90),
          gte(batches.expiryDate, now),
          batchStoreFilter
        )
      ),
    db
      .select({
        val: sql<number>`SUM(COALESCE(qtyOnHand,quantity)*COALESCE(purchaseRate,0))`,
      })
      .from(batches)
      .where(
        and(
          ne(batches.status, "depleted"),
          lte(batches.expiryDate, cut60),
          gte(batches.expiryDate, now),
          batchStoreFilter
        )
      ),
    db
      .select({
        val: sql<number>`SUM(COALESCE(qtyOnHand,quantity)*COALESCE(purchaseRate,0))`,
      })
      .from(batches)
      .where(and(eq(batches.status, "quarantined"), batchStoreFilter)),
    db
      .select({
        val: sql<number>`SUM(COALESCE(qtyOnHand,quantity)*COALESCE(purchaseRate,0))`,
      })
      .from(batches)
      .where(and(eq(batches.status, "expired"), batchStoreFilter)),
    db
      .select({ storeId: stores.id, storeName: stores.name })
      .from(stores)
      .where(eq(stores.isActive, true))
      .limit(10),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, since24h)),
    db
      .select({
        hasBarcode: sql<number>`SUM(CASE WHEN internalBarcode IS NOT NULL OR manufacturerBarcode IS NOT NULL THEN 1 ELSE 0 END)`,
        total: sql<number>`COUNT(*)`,
      })
      .from(batches)
      .where(
        and(
          ne(batches.status, "depleted"),
          gte(batches.createdAt, since7d),
          batchStoreFilter
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(slaEvents)
      .where(
        and(
          isNull(slaEvents.deliveredAt),
          eq(slaEvents.breached, false),
          lte(slaEvents.slaDeadline, in15Mins),
          gte(slaEvents.slaDeadline, now)
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(slaEvents)
      .where(
        and(isNull(slaEvents.deliveredAt), lt(slaEvents.slaDeadline, now))
      ),
  ]);
  const riderMap: Record<string, number> = {};
  for (const r of riderRows) riderMap[r.status] = Number(r.count);
  const ocrMap: Record<string, number> = {};
  for (const r of ocrRows) ocrMap[r.status] = Number(r.count);
  const labelTotal = Number(labelRows[0]?.total ?? 0);
  const labelHas = Number(labelRows[0]?.hasBarcode ?? 0);
  return {
    liveOrders: {
      byStatus: liveOrders,
      total: liveOrders.reduce((s, r) => s + Number(r.count), 0),
    },
    slaRisk: {
      atRiskCount: Number(slaAtRisk[0]?.count ?? 0),
      breachedCount: Number(slaBreached[0]?.count ?? 0),
    },
    pharmacistQueue: { pending: Number(pharmacistQ[0]?.count ?? 0) },
    riderBoard: {
      available: riderMap.available ?? 0,
      onDelivery: riderMap.on_delivery ?? 0,
      offline: riderMap.offline ?? 0,
    },
    stockouts: { count: Number(stockoutRows[0]?.count ?? 0) },
    nearExpiry: { count: Number(nearExpiryRows[0]?.count ?? 0) },
    whatsappQueue: { pendingHandoffs: Number(handoffRows[0]?.count ?? 0) },
    appQueue: { pending: Number(appPending[0]?.count ?? 0) },
    counterSync: {
      todayCount: Number(counterRows[0]?.count ?? 0),
      todayRevenue: Number(counterRows[0]?.revenue ?? 0),
    },
    manualOverrides: { count: Number(overrideRows[0]?.count ?? 0) },
    buildingDemand: { topBuildings: buildingRows },
    syncHealth: { lastSync: syncRows[0]?.completedAt ?? null },
    ocrQueue: {
      queued: ocrMap.queued ?? 0,
      processing: ocrMap.processing ?? 0,
      failed: ocrMap.failed ?? 0,
    },
    storePerformance: { stores: storeRows },
    importHealth: { pendingReview: Number(importRows[0]?.count ?? 0) },
    refillPipeline: {
      active: Number(refillActive[0]?.count ?? 0),
      dueThisWeek: Number(refillDue7[0]?.count ?? 0),
      missed: Number(refillMissed[0]?.count ?? 0),
      needsFreshRx: Number(refillFreshRx[0]?.count ?? 0),
    },
    expiryExposure: {
      value90: Number(expiryV90[0]?.val ?? 0),
      value60: Number(expiryV60[0]?.val ?? 0),
      quarantinedValue: Number(quarantinedV[0]?.val ?? 0),
      disposalValue: Number(expiredV[0]?.val ?? 0),
    },
    nodeCapacity: { nodes: nodeRows },
    unauditedActions: { count: Number(unauditedRows[0]?.count ?? 0) },
    labelScan: {
      compliancePct:
        labelTotal > 0 ? Math.round((labelHas / labelTotal) * 100) : 100,
      total: labelTotal,
    },
    generatedAt: new Date(),
  };
}

export const snapshotProcedure = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "DB unavailable",
      });
    return runAllCards(db, input.storeId);
  });
