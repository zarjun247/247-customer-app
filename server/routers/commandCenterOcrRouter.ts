/**
 * commandCenterRouterExtension — second half of commandCenter procedures
 * (ocrQueue through snapshot)
 *
 * Sub-dashboards live in commandCenterDashboardsRouter.ts
 * Full-snapshot lives in commandCenterSnapshotRouter.ts
 */
import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  orders,
  batches,
  ingestionJobs,
  refillPlans,
  auditLogs,
  stores,
  medivisionSyncLog,
} from "../../drizzle/schema";
import { eq, and, lte, gte, sql, desc, inArray, ne, lt } from "drizzle-orm";
import {
  slaDashboard,
  expiryDashboard,
  refillDashboard,
  syncComplianceDashboard,
  recentEvents,
} from "./commandCenterDashboardsRouter";
import { snapshotProcedure } from "./commandCenterSnapshotRouter";

const ADMIN_ROLES = [
  "admin",
  "super_admin",
  "ops_admin",
  "store_manager",
] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];
function assertAdmin(role: string) {
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

// ─── Card 14: OCR Queue Health ────────────────────────────────────────────────
const ocrQueueCard = protectedProcedure.query(async ({ ctx }) => {
  assertAdmin(ctx.user.role);
  const db = await getDb();
  if (!db) return { queued: 0, processing: 0, failed: 0, recentJobs: [] };
  const counts = await db
    .select({
      status: ingestionJobs.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(ingestionJobs)
    .groupBy(ingestionJobs.status);
  const recentJobs = await db
    .select({
      id: ingestionJobs.id,
      status: ingestionJobs.status,
      filename: ingestionJobs.filename,
      createdAt: ingestionJobs.createdAt,
    })
    .from(ingestionJobs)
    .orderBy(desc(ingestionJobs.createdAt))
    .limit(10);
  const byStatus: Record<string, number> = {};
  for (const r of counts) byStatus[r.status] = Number(r.count);
  return {
    queued: byStatus.queued ?? 0,
    processing: byStatus.processing ?? 0,
    failed: byStatus.failed ?? 0,
    recentJobs,
  };
});

// ─── Card 15: Store/Node Performance ─────────────────────────────────────────
const storePerformanceCard = protectedProcedure
  .input(z.object({ days: z.number().int().default(7) }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { stores: [] };
    const since = nowMinus(input.days * DAY);
    const storeStats = await db
      .select({
        storeId: orders.storeId,
        storeName: stores.name,
        orderCount: sql<number>`COUNT(*)`,
        deliveredCount: sql<number>`SUM(CASE WHEN orders.status = 'delivered' THEN 1 ELSE 0 END)`,
        revenue: sql<number>`SUM(CASE WHEN orders.status = 'delivered' THEN orders.total ELSE 0 END)`,
        avgDeliveryMins: sql<number>`AVG(CASE WHEN orders.deliveredAt IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, orders.placedAt, orders.deliveredAt) ELSE NULL END)`,
      })
      .from(orders)
      .leftJoin(stores, eq(orders.storeId, stores.id))
      .where(and(gte(orders.placedAt, since), ne(orders.status, "draft")))
      .groupBy(orders.storeId, stores.name)
      .orderBy(desc(sql`COUNT(*)`));
    return { stores: storeStats };
  });

// ─── Card 16: Medivision/Import Health ───────────────────────────────────────
const importHealthCard = protectedProcedure.query(async ({ ctx }) => {
  assertAdmin(ctx.user.role);
  const db = await getDb();
  if (!db) return { lastImport: null, pendingReview: 0 };
  const lastImport = await db
    .select()
    .from(medivisionSyncLog)
    .orderBy(desc(medivisionSyncLog.startedAt))
    .limit(1);
  const pendingReview = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(ingestionJobs)
    .where(
      inArray(ingestionJobs.status, [
        "ocr_complete",
        "under_review",
      ] as (typeof ingestionJobs.status.enumValues)[number][])
    );
  return {
    lastImport: lastImport[0] ?? null,
    pendingReview: Number(pendingReview[0]?.count ?? 0),
  };
});

// ─── Card 17: Refill Pipeline ─────────────────────────────────────────────────
const refillPipelineCard = protectedProcedure.query(async ({ ctx }) => {
  assertAdmin(ctx.user.role);
  const db = await getDb();
  if (!db) return { active: 0, dueThisWeek: 0, missed: 0, needsFreshRx: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = nowPlus(7 * DAY);
  const [active, dueThisWeek, missed, needsFreshRx] = await Promise.all([
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
          lte(refillPlans.nextDueDate, in7Days)
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
  ]);
  return {
    active: Number(active[0]?.count ?? 0),
    dueThisWeek: Number(dueThisWeek[0]?.count ?? 0),
    missed: Number(missed[0]?.count ?? 0),
    needsFreshRx: Number(needsFreshRx[0]?.count ?? 0),
  };
});

// ─── Card 18: Expiry Exposure ─────────────────────────────────────────────────
const expiryExposureCard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db)
      return { value90: 0, value60: 0, quarantinedValue: 0, disposalValue: 0 };
    const cut60 = nowPlus(60 * DAY);
    const cut90 = nowPlus(90 * DAY);
    const now = new Date();
    const [v90, v60, quarantined, expired] = await Promise.all([
      db
        .select({
          val: sql<number>`SUM(COALESCE(qtyOnHand,quantity) * COALESCE(purchaseRate,0))`,
        })
        .from(batches)
        .where(
          and(
            ne(batches.status, "depleted"),
            lte(batches.expiryDate, cut90),
            gte(batches.expiryDate, now),
            input.storeId ? eq(batches.storeId, input.storeId) : undefined
          )
        ),
      db
        .select({
          val: sql<number>`SUM(COALESCE(qtyOnHand,quantity) * COALESCE(purchaseRate,0))`,
        })
        .from(batches)
        .where(
          and(
            ne(batches.status, "depleted"),
            lte(batches.expiryDate, cut60),
            gte(batches.expiryDate, now),
            input.storeId ? eq(batches.storeId, input.storeId) : undefined
          )
        ),
      db
        .select({
          val: sql<number>`SUM(COALESCE(qtyOnHand,quantity) * COALESCE(purchaseRate,0))`,
        })
        .from(batches)
        .where(
          and(
            eq(batches.status, "quarantined"),
            input.storeId ? eq(batches.storeId, input.storeId) : undefined
          )
        ),
      db
        .select({
          val: sql<number>`SUM(COALESCE(qtyOnHand,quantity) * COALESCE(purchaseRate,0))`,
        })
        .from(batches)
        .where(
          and(
            eq(batches.status, "expired"),
            input.storeId ? eq(batches.storeId, input.storeId) : undefined
          )
        ),
    ]);
    return {
      value90: Number(v90[0]?.val ?? 0),
      value60: Number(v60[0]?.val ?? 0),
      quarantinedValue: Number(quarantined[0]?.val ?? 0),
      disposalValue: Number(expired[0]?.val ?? 0),
    };
  });

// ─── Card 19: Node Capacity ───────────────────────────────────────────────────
const nodeCapacityCard = protectedProcedure.query(async ({ ctx }) => {
  assertAdmin(ctx.user.role);
  const db = await getDb();
  if (!db) return { nodes: [] };
  const nodes = await db
    .select({
      storeId: stores.id,
      storeName: stores.name,
      activeOrders: sql<number>`(SELECT COUNT(*) FROM orders o WHERE o.storeId = stores.id AND o.status IN ('picking','packed','assigned_to_rider','out_for_delivery'))`,
      availableRiders: sql<number>`(SELECT COUNT(*) FROM riders r WHERE r.storeId = stores.id AND r.status = 'available' AND r.isActive = true)`,
    })
    .from(stores)
    .where(eq(stores.isActive, true))
    .limit(20);
  return { nodes };
});

// ─── Card 20: Unaudited Actions ───────────────────────────────────────────────
const unauditedActionsCard = protectedProcedure
  .input(z.object({ hours: z.number().int().default(24) }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { count: 0, recent: [] };
    const since = nowMinus(input.hours * HOUR);
    const recent = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorId: auditLogs.actorId,
        actorRole: auditLogs.actorRole,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, since))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);
    return { count: recent.length, recent };
  });

// ─── Card 21: Label/Scan Compliance ──────────────────────────────────────────
const labelScanComplianceCard = protectedProcedure
  .input(
    z.object({
      storeId: z.number().int().optional(),
      days: z.number().int().default(7),
    })
  )
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db)
      return {
        batchesWithBarcode: 0,
        batchesWithoutBarcode: 0,
        compliancePct: 0,
      };
    const since = nowMinus(input.days * DAY);
    const rows = await db
      .select({
        hasBarcode: sql<number>`SUM(CASE WHEN internalBarcode IS NOT NULL OR manufacturerBarcode IS NOT NULL THEN 1 ELSE 0 END)`,
        noBarcode: sql<number>`SUM(CASE WHEN internalBarcode IS NULL AND manufacturerBarcode IS NULL THEN 1 ELSE 0 END)`,
        total: sql<number>`COUNT(*)`,
      })
      .from(batches)
      .where(
        and(
          ne(batches.status, "depleted"),
          gte(batches.createdAt, since),
          input.storeId ? eq(batches.storeId, input.storeId) : undefined
        )
      );
    const r = rows[0];
    const total = Number(r?.total ?? 0);
    const hasBarcode = Number(r?.hasBarcode ?? 0);
    return {
      batchesWithBarcode: hasBarcode,
      batchesWithoutBarcode: Number(r?.noBarcode ?? 0),
      compliancePct: total > 0 ? Math.round((hasBarcode / total) * 100) : 100,
    };
  });

export const commandCenterRouterExtension = {
  ocrQueue: ocrQueueCard,
  storePerformance: storePerformanceCard,
  importHealth: importHealthCard,
  refillPipeline: refillPipelineCard,
  expiryExposure: expiryExposureCard,
  nodeCapacity: nodeCapacityCard,
  unauditedActions: unauditedActionsCard,
  labelScanCompliance: labelScanComplianceCard,
  slaDashboard,
  expiryDashboard,
  refillDashboard,
  syncComplianceDashboard,
  recentEvents,
  snapshot: snapshotProcedure,
};
