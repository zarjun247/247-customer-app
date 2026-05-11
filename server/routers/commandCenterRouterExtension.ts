/**
 * commandCenterRouterExtension — second half of commandCenter procedures
 * (ocrQueue through snapshot)
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
  products,
  ingestionJobs,
  refillPlans,
  refillEvents,
  auditLogs,
  stores,
  systemEvents,
  medivisionSyncLog,
  sales,
  whatsappMessages,
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
  asc,
  inArray,
  ne,
  isNull,
  isNotNull,
  lt,
  gt,
  or,
  between,
} from "drizzle-orm";

const ADMIN_ROLES = [
  "admin",
  "super_admin",
  "ops_admin",
  "store_manager",
] as const;
function assertAdmin(role: string) {
  if (!ADMIN_ROLES.includes(role as any)) {
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

// ─── Card 16: Medivision/Import Health (placeholder) ─────────────────────────
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
      inArray(ingestionJobs.status, ["ocr_complete", "under_review"] as any)
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
          gte(refillPlans.nextDueDate, today.toISOString().slice(0, 10) as any),
          lte(
            refillPlans.nextDueDate,
            in7Days.toISOString().slice(0, 10) as any
          )
        )
      ),
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(refillPlans)
      .where(
        and(
          eq(refillPlans.status, "active"),
          lt(refillPlans.nextDueDate, today.toISOString().slice(0, 10) as any)
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

// ─── Sub-dashboard 1: SLA Dashboard ──────────────────────────────────────────
const slaDashboard = protectedProcedure
  .input(
    z.object({
      storeId: z.number().int().optional(),
      days: z.number().int().default(30),
    })
  )
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db)
      return {
        orderToAllocation: null,
        orderToDoor: null,
        withinPromisePct: 0,
        breachCount: 0,
        breachReasons: [],
        riderRatio: null,
      };
    const since = nowMinus(input.days * DAY);
    const [allOrders, breachRows, riderRows] = await Promise.all([
      db
        .select({
          orderId: orders.id,
          placedAt: orders.placedAt,
          deliveredAt: orders.deliveredAt,
          promisedSlaMins: orders.promisedSlaMins,
          reservedAt: sql<Date | null>`(SELECT occurredAt FROM order_timestamps WHERE orderId = orders.id AND eventType = 'reserved' LIMIT 1)`,
        })
        .from(orders)
        .where(
          and(
            gte(orders.placedAt, since),
            ne(orders.status, "cancelled"),
            ne(orders.status, "draft"),
            input.storeId ? eq(orders.storeId, input.storeId) : undefined
          )
        )
        .limit(2000),
      db
        .select({
          breachReason: slaEvents.breachDetectedAt,
          count: sql<number>`COUNT(*)`,
        })
        .from(slaEvents)
        .where(
          and(
            eq(slaEvents.breached, true),
            gte(slaEvents.slaStartedAt, since),
            input.storeId ? eq(slaEvents.storeId, input.storeId) : undefined
          )
        )
        .groupBy(slaEvents.breachDetectedAt)
        .limit(10),
      db
        .select({
          status: riders.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(riders)
        .where(
          and(
            eq(riders.isActive, true),
            input.storeId ? eq(riders.storeId, input.storeId) : undefined
          )
        )
        .groupBy(riders.status),
    ]);
    const delivered = allOrders.filter(o => o.deliveredAt);
    const onTime = delivered.filter(o => {
      const mins = (o.deliveredAt!.getTime() - o.placedAt.getTime()) / 60000;
      return mins <= o.promisedSlaMins;
    });
    const avgDoorMins =
      delivered.length > 0
        ? delivered.reduce(
            (s, o) =>
              s + (o.deliveredAt!.getTime() - o.placedAt.getTime()) / 60000,
            0
          ) / delivered.length
        : null;
    const riderMap: Record<string, number> = {};
    for (const r of riderRows) riderMap[r.status] = Number(r.count);
    return {
      orderToAllocation: null, // would need orderTimestamps join
      orderToDoor: avgDoorMins ? Math.round(avgDoorMins) : null,
      withinPromisePct:
        delivered.length > 0
          ? Math.round((onTime.length / delivered.length) * 100)
          : 0,
      breachCount: breachRows.reduce((s, r) => s + Number(r.count), 0),
      breachReasons: breachRows,
      riderRatio: {
        idle: riderMap.available ?? 0,
        loaded: riderMap.on_delivery ?? 0,
        offline: riderMap.offline ?? 0,
      },
    };
  });

// ─── Sub-dashboard 2: Expiry Dashboard ───────────────────────────────────────
const expiryDashboard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db)
      return {
        value90: 0,
        value60: 0,
        quarantinedValue: 0,
        disposalValue: 0,
        fefoCompliance: null,
        byBucket: [],
      };
    const cut60 = nowPlus(60 * DAY);
    const cut90 = nowPlus(90 * DAY);
    const now = new Date();
    const [byBucket, fefo] = await Promise.all([
      db
        .select({
          expiryBucket: batches.expiryBucket,
          count: sql<number>`COUNT(*)`,
          value: sql<number>`SUM(COALESCE(qtyOnHand,quantity) * COALESCE(purchaseRate,0))`,
        })
        .from(batches)
        .where(
          and(
            ne(batches.status, "depleted"),
            input.storeId ? eq(batches.storeId, input.storeId) : undefined
          )
        )
        .groupBy(batches.expiryBucket),
      db
        .select({
          total: sql<number>`COUNT(*)`,
          fefoViolations: sql<number>`SUM(CASE WHEN status = 'active' AND expiryDate < DATE_ADD(NOW(), INTERVAL 30 DAY) AND COALESCE(qtyOnHand,quantity) > 0 THEN 1 ELSE 0 END)`,
        })
        .from(batches)
        .where(input.storeId ? eq(batches.storeId, input.storeId) : undefined),
    ]);
    const v90row = byBucket.filter(
      b =>
        b.expiryBucket &&
        ["warning", "critical", "quarantine_candidate"].includes(b.expiryBucket)
    );
    const v60row = byBucket.filter(
      b =>
        b.expiryBucket &&
        ["critical", "quarantine_candidate"].includes(b.expiryBucket)
    );
    const quarRow = byBucket.find(
      b => b.expiryBucket === "quarantine_candidate"
    );
    const expiredRow = byBucket.find(b => b.expiryBucket === "expired");
    const fefoTotal = Number(fefo[0]?.total ?? 0);
    const fefoViol = Number(fefo[0]?.fefoViolations ?? 0);
    return {
      value90: v90row.reduce((s, r) => s + Number(r.value ?? 0), 0),
      value60: v60row.reduce((s, r) => s + Number(r.value ?? 0), 0),
      quarantinedValue: Number(quarRow?.value ?? 0),
      disposalValue: Number(expiredRow?.value ?? 0),
      fefoCompliance:
        fefoTotal > 0
          ? Math.round(((fefoTotal - fefoViol) / fefoTotal) * 100)
          : 100,
      byBucket,
    };
  });

// ─── Sub-dashboard 3: Refill Dashboard ───────────────────────────────────────
const refillDashboard = protectedProcedure
  .input(z.object({ days: z.number().int().default(30) }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db)
      return {
        active: 0,
        dueNext7: 0,
        reminderSendRate: 0,
        reorderConversionPct: 0,
        missed: 0,
      };
    const since = nowMinus(input.days * DAY);
    const today = new Date().toISOString().slice(0, 10);
    const in7 = nowPlus(7 * DAY)
      .toISOString()
      .slice(0, 10);
    const [active, dueNext7, missed, reminders, reorders] = await Promise.all([
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
            gte(refillPlans.nextDueDate, today as any),
            lte(refillPlans.nextDueDate, in7 as any)
          )
        ),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(refillPlans)
        .where(
          and(
            eq(refillPlans.status, "active"),
            lt(refillPlans.nextDueDate, today as any)
          )
        ),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(refillEvents)
        .where(
          and(
            inArray(refillEvents.eventType, [
              "reminder_sent_app",
              "reminder_sent_whatsapp",
              "reminder_sent_sms",
            ] as any),
            gte(refillEvents.createdAt, since)
          )
        ),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(refillEvents)
        .where(
          and(
            eq(refillEvents.eventType, "refill_ordered"),
            gte(refillEvents.createdAt, since)
          )
        ),
    ]);
    const reminderCount = Number(reminders[0]?.count ?? 0);
    const reorderCount = Number(reorders[0]?.count ?? 0);
    return {
      active: Number(active[0]?.count ?? 0),
      dueNext7: Number(dueNext7[0]?.count ?? 0),
      reminderSendRate: reminderCount,
      reorderConversionPct:
        reminderCount > 0
          ? Math.round((reorderCount / reminderCount) * 100)
          : 0,
      missed: Number(missed[0]?.count ?? 0),
    };
  });

// ─── Sub-dashboard 4: Sync/Compliance Dashboard ──────────────────────────────
const syncComplianceDashboard = protectedProcedure
  .input(z.object({ days: z.number().int().default(30) }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db)
      return {
        syncFreshness: null,
        staleIncidents: 0,
        h1ReviewCompletion: 0,
        overrideCount: 0,
        unauditedActions: 0,
      };
    const since = nowMinus(input.days * DAY);
    const [lastSync, staleEvents, h1, overrides, unaudited] = await Promise.all(
      [
        db
          .select({ completedAt: medivisionSyncLog.completedAt })
          .from(medivisionSyncLog)
          .orderBy(desc(medivisionSyncLog.startedAt))
          .limit(1),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(systemEvents)
          .where(
            and(
              eq(systemEvents.eventType, "sync_stale"),
              gte(systemEvents.occurredAt, since)
            )
          ),
        db
          .select({
            total: sql<number>`COUNT(*)`,
            reviewed: sql<number>`SUM(CASE WHEN status IN ('committed','failed') THEN 1 ELSE 0 END)`,
          })
          .from(ingestionJobs)
          .where(gte(ingestionJobs.createdAt, since)),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(auditLogs)
          .where(
            and(gte(auditLogs.createdAt, since), sql`action LIKE '%override%'`)
          ),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(auditLogs)
          .where(gte(auditLogs.createdAt, since)),
      ]
    );
    const h1Total = Number(h1[0]?.total ?? 0);
    const h1Reviewed = Number(h1[0]?.reviewed ?? 0);
    return {
      syncFreshness: lastSync[0]?.completedAt ?? null,
      staleIncidents: Number(staleEvents[0]?.count ?? 0),
      h1ReviewCompletion:
        h1Total > 0 ? Math.round((h1Reviewed / h1Total) * 100) : 100,
      overrideCount: Number(overrides[0]?.count ?? 0),
      unauditedActions: Number(unaudited[0]?.count ?? 0),
    };
  });

// ─── Event bus query ──────────────────────────────────────────────────────────
const recentEvents = protectedProcedure
  .input(
    z.object({
      eventType: z.string().optional(),
      severity: z.enum(["info", "warning", "critical"]).optional(),
      storeId: z.number().int().optional(),
      limit: z.number().int().default(50),
    })
  )
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { events: [] };
    const events = await db
      .select()
      .from(systemEvents)
      .where(
        and(
          input.eventType
            ? eq(systemEvents.eventType, input.eventType as any)
            : undefined,
          input.severity
            ? eq(systemEvents.severity, input.severity)
            : undefined,
          input.storeId ? eq(systemEvents.storeId, input.storeId) : undefined
        )
      )
      .orderBy(desc(systemEvents.occurredAt))
      .limit(input.limit);
    return { events };
  });

// ─── Full snapshot ────────────────────────────────────────────────────────────
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
  const todayStr = today.toISOString().slice(0, 10);
  const in7Str = nowPlus(7 * DAY)
    .toISOString()
    .slice(0, 10);
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
    // 1 live orders
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
          ] as any),
          storeFilter
        )
      )
      .groupBy(orders.status),
    // 5 rider board
    db
      .select({ status: riders.status, count: sql<number>`COUNT(*)` })
      .from(riders)
      .where(and(eq(riders.isActive, true), riderStoreFilter))
      .groupBy(riders.status),
    // 6 stockouts
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
    // 7 near expiry
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
    // 4 pharmacist queue
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(prescriptions)
      .where(
        inArray(prescriptions.status, [
          "pending_pharmacist",
          "quick_verify",
          "additional_verification",
        ] as any)
      ),
    // 8 whatsapp handoffs
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(staffHandoffs)
      .where(inArray(staffHandoffs.status, ["open", "assigned"] as any)),
    // 9 app queue
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(
        and(
          inArray(orders.status, [
            "awaiting_pharmacist_review",
            "awaiting_allocation",
            "reserved",
          ] as any),
          eq(orders.source, "app"),
          storeFilter
        )
      ),
    // 10 counter sales today
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
    // 11 manual overrides
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(auditLogs)
      .where(
        and(gte(auditLogs.createdAt, since24h), sql`action LIKE '%override%'`)
      ),
    // 12 building demand
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
    // 13 sync health
    db
      .select({ completedAt: medivisionSyncLog.completedAt })
      .from(medivisionSyncLog)
      .orderBy(desc(medivisionSyncLog.startedAt))
      .limit(1),
    // 14 ocr queue
    db
      .select({ status: ingestionJobs.status, count: sql<number>`COUNT(*)` })
      .from(ingestionJobs)
      .groupBy(ingestionJobs.status),
    // 15 store performance
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
    // 16 import health
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ingestionJobs)
      .where(
        inArray(ingestionJobs.status, ["ocr_complete", "under_review"] as any)
      ),
    // 17 refill active
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(refillPlans)
      .where(eq(refillPlans.status, "active")),
    // 17 refill due7
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(refillPlans)
      .where(
        and(
          eq(refillPlans.status, "active"),
          gte(refillPlans.nextDueDate, todayStr as any),
          lte(refillPlans.nextDueDate, in7Str as any)
        )
      ),
    // 17 refill missed
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(refillPlans)
      .where(
        and(
          eq(refillPlans.status, "active"),
          lt(refillPlans.nextDueDate, todayStr as any)
        )
      ),
    // 17 needs fresh rx
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(refillPlans)
      .where(
        and(
          eq(refillPlans.status, "active"),
          eq(refillPlans.needsFreshRx, true)
        )
      ),
    // 18 expiry 90d value
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
    // 18 expiry 60d value
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
    // 18 quarantined value
    db
      .select({
        val: sql<number>`SUM(COALESCE(qtyOnHand,quantity)*COALESCE(purchaseRate,0))`,
      })
      .from(batches)
      .where(and(eq(batches.status, "quarantined"), batchStoreFilter)),
    // 18 expired value
    db
      .select({
        val: sql<number>`SUM(COALESCE(qtyOnHand,quantity)*COALESCE(purchaseRate,0))`,
      })
      .from(batches)
      .where(and(eq(batches.status, "expired"), batchStoreFilter)),
    // 19 node capacity
    db
      .select({ storeId: stores.id, storeName: stores.name })
      .from(stores)
      .where(eq(stores.isActive, true))
      .limit(10),
    // 20 unaudited
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, since24h)),
    // 21 label scan
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
    // 3 sla at risk
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
    // 3 sla breached
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

const snapshot = protectedProcedure
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
  snapshot,
};
