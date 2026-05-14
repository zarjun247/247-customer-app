/**
 * commandCenterDashboardsRouter — sub-dashboard procedures for Command Center
 * Extracted from commandCenterOcrRouter to keep files under 600 counted lines.
 */
import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  orders,
  riders,
  batches,
  ingestionJobs,
  refillPlans,
  refillEvents,
  auditLogs,
  medivisionSyncLog,
  systemEvents,
  slaEvents,
} from "../../drizzle/schema";
import { eq, and, lte, gte, sql, desc, inArray, ne, lt } from "drizzle-orm";

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
const DAY = 86400000;

// ─── Sub-dashboard 1: SLA Dashboard ──────────────────────────────────────────
export const slaDashboard = protectedProcedure
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
      orderToAllocation: null,
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
export const expiryDashboard = protectedProcedure
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
export const refillDashboard = protectedProcedure
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
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const in7Date = nowPlus(7 * DAY);
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
            gte(refillPlans.nextDueDate, todayDate),
            lte(refillPlans.nextDueDate, in7Date)
          )
        ),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(refillPlans)
        .where(
          and(
            eq(refillPlans.status, "active"),
            lt(refillPlans.nextDueDate, todayDate)
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
            ] as (typeof refillEvents.eventType.enumValues)[number][]),
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
export const syncComplianceDashboard = protectedProcedure
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
export const recentEvents = protectedProcedure
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
            ? eq(
                systemEvents.eventType,
                input.eventType as (typeof systemEvents.eventType.enumValues)[number]
              )
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
