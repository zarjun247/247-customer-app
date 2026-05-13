/**
 * PART 12 — Command Center Router
 * All 21 live card data procedures + 4 sub-dashboard procedures.
 * All queries run against real tables — no shadow data.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { commandCenterRouterExtension } from "./commandCenterRouterExtension";
import {
  orders,
  prescriptions,
  riders,
  deliveryTasks as _deliveryTasks,
  slaEvents,
  batches,
  storeSkus,
  products,
  ocrJobs as _ocrJobs,
  ingestionJobs as _ingestionJobs,
  refillPlans as _refillPlans,
  refillEvents as _refillEvents,
  auditLogs,
  routingDecisions as _routingDecisions,
  buildings,
  stores as _stores,
  systemEvents,
  medivisionSyncLog,
  sales,
  whatsappMessages,
  staffHandoffs,
  users as _users,
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
  between as _between,
  lt,
  gt,
  or,
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

// ─── Card 1: Live Orders ──────────────────────────────────────────────────────
const liveOrdersCard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { byStatus: [], total: 0 };
    const activeStatuses = [
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
    ];
    const rows = await db
      .select({
        status: orders.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.status, activeStatuses as any),
          input.storeId ? eq(orders.storeId, input.storeId) : undefined
        )
      )
      .groupBy(orders.status);
    return {
      byStatus: rows,
      total: rows.reduce((s, r) => s + Number(r.count), 0),
    };
  });

// ─── Card 2: Order Ageing ─────────────────────────────────────────────────────
const orderAgeingCard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { buckets: [] };
    const rows = await db
      .select({
        orderId: orders.id,
        status: orders.status,
        placedAt: orders.placedAt,
        promisedSlaMins: orders.promisedSlaMins,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.status, [
            "picking",
            "packed",
            "assigned_to_rider",
            "out_for_delivery",
          ] as any),
          input.storeId ? eq(orders.storeId, input.storeId) : undefined
        )
      )
      .orderBy(asc(orders.placedAt))
      .limit(200);
    const now = Date.now();
    const buckets = { under30: 0, "30to60": 0, "60to90": 0, over90: 0 };
    for (const r of rows) {
      const ageMins = (now - r.placedAt.getTime()) / 60000;
      if (ageMins < 30) buckets.under30++;
      else if (ageMins < 60) buckets["30to60"]++;
      else if (ageMins < 90) buckets["60to90"]++;
      else buckets.over90++;
    }
    return { buckets, oldest: rows[0] ?? null };
  });

// ─── Card 3: SLA Breach Risk ──────────────────────────────────────────────────
const slaBreachRiskCard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { atRisk: [], breached: [] };
    const now = new Date();
    const in15Mins = nowPlus(15 * 60000);
    const atRisk = await db
      .select({
        id: slaEvents.id,
        orderId: slaEvents.orderId,
        slaDeadline: slaEvents.slaDeadline,
        promisedSlaMins: slaEvents.promisedSlaMins,
      })
      .from(slaEvents)
      .where(
        and(
          isNull(slaEvents.deliveredAt),
          eq(slaEvents.breached, false),
          lte(slaEvents.slaDeadline, in15Mins),
          gte(slaEvents.slaDeadline, now),
          input.storeId ? eq(slaEvents.storeId, input.storeId) : undefined
        )
      )
      .orderBy(asc(slaEvents.slaDeadline))
      .limit(50);
    const breached = await db
      .select({
        id: slaEvents.id,
        orderId: slaEvents.orderId,
        slaDeadline: slaEvents.slaDeadline,
      })
      .from(slaEvents)
      .where(
        and(
          isNull(slaEvents.deliveredAt),
          lt(slaEvents.slaDeadline, now),
          input.storeId ? eq(slaEvents.storeId, input.storeId) : undefined
        )
      )
      .orderBy(asc(slaEvents.slaDeadline))
      .limit(50);
    return { atRisk, breached };
  });

// ─── Card 4: Pharmacist Queue ─────────────────────────────────────────────────
const pharmacistQueueCard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { pending: 0, avgWaitMins: null };
    const rows = await db
      .select({
        pending: sql<number>`SUM(CASE WHEN status IN ('pending_pharmacist','quick_verify','additional_verification') THEN 1 ELSE 0 END)`,
        avgWaitMins: sql<number>`AVG(CASE WHEN reviewedAt IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, createdAt, reviewedAt) ELSE NULL END)`,
      })
      .from(prescriptions)
      .where(
        input.storeId ? eq(prescriptions.storeId, input.storeId) : undefined
      );
    return rows[0] ?? { pending: 0, avgWaitMins: null };
  });

// ─── Card 5: Rider Board ──────────────────────────────────────────────────────
const riderBoardCard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { available: 0, onDelivery: 0, offline: 0, riders: [] };
    const riderRows = await db
      .select({
        id: riders.id,
        name: riders.name,
        status: riders.status,
        lastLocationAt: riders.lastLocationAt,
      })
      .from(riders)
      .where(
        and(
          eq(riders.isActive, true),
          input.storeId ? eq(riders.storeId, input.storeId) : undefined
        )
      )
      .orderBy(asc(riders.name))
      .limit(50);
    const counts = { available: 0, on_delivery: 0, offline: 0 };
    for (const r of riderRows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return {
      available: counts.available,
      onDelivery: counts.on_delivery,
      offline: counts.offline,
      riders: riderRows,
    };
  });

// ─── Card 6: Stockout Alerts ──────────────────────────────────────────────────
const stockoutAlertsCard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { stockouts: [], lowStock: [] };
    const stockouts = await db
      .select({
        skuId: storeSkus.id,
        productName: products.name,
        stockQty: storeSkus.stockQty,
      })
      .from(storeSkus)
      .innerJoin(products, eq(storeSkus.productId, products.id))
      .where(
        and(
          eq(storeSkus.isActive, true),
          lte(storeSkus.stockQty, 0),
          input.storeId ? eq(storeSkus.storeId, input.storeId) : undefined
        )
      )
      .limit(50);
    const lowStock = await db
      .select({
        skuId: storeSkus.id,
        productName: products.name,
        stockQty: storeSkus.stockQty,
      })
      .from(storeSkus)
      .innerJoin(products, eq(storeSkus.productId, products.id))
      .where(
        and(
          eq(storeSkus.isActive, true),
          gt(storeSkus.stockQty, 0),
          lte(storeSkus.stockQty, 5),
          input.storeId ? eq(storeSkus.storeId, input.storeId) : undefined
        )
      )
      .limit(50);
    return { stockouts, lowStock };
  });

// ─── Card 7: Near-Expiry Alerts ───────────────────────────────────────────────
const nearExpiryAlertsCard = protectedProcedure
  .input(
    z.object({
      storeId: z.number().int().optional(),
      days: z.number().int().default(90),
    })
  )
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { critical: [], warning: [] };
    const cutoff60 = nowPlus(60 * DAY);
    const cutoff90 = nowPlus(input.days * DAY);
    const critical = await db
      .select({
        batchId: batches.id,
        productName: products.name,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        qtyOnHand: batches.qtyOnHand,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .where(
        and(
          ne(batches.status, "depleted"),
          ne(batches.status, "expired"),
          lte(batches.expiryDate, cutoff60),
          gte(batches.expiryDate, new Date()),
          input.storeId ? eq(batches.storeId, input.storeId) : undefined
        )
      )
      .orderBy(asc(batches.expiryDate))
      .limit(50);
    const warning = await db
      .select({
        batchId: batches.id,
        productName: products.name,
        batchNo: batches.batchNo,
        expiryDate: batches.expiryDate,
        qtyOnHand: batches.qtyOnHand,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .where(
        and(
          ne(batches.status, "depleted"),
          ne(batches.status, "expired"),
          gt(batches.expiryDate, cutoff60),
          lte(batches.expiryDate, cutoff90),
          input.storeId ? eq(batches.storeId, input.storeId) : undefined
        )
      )
      .orderBy(asc(batches.expiryDate))
      .limit(50);
    return { critical, warning };
  });

// ─── Card 8: WhatsApp Queue ───────────────────────────────────────────────────
const whatsappQueueCard = protectedProcedure.query(async ({ ctx }) => {
  assertAdmin(ctx.user.role);
  const db = await getDb();
  if (!db) return { pendingHandoffs: 0, unreadMessages: 0, recentMessages: [] };
  const [handoffRows, msgRows] = await Promise.all([
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(staffHandoffs)
      .where(inArray(staffHandoffs.status, ["open", "assigned"] as any)),
    db
      .select({
        id: whatsappMessages.id,
        phone: whatsappMessages.phone,
        direction: whatsappMessages.direction,
        body: whatsappMessages.body,
        createdAt: whatsappMessages.createdAt,
      })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.direction, "inbound"))
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(10),
  ]);
  return {
    pendingHandoffs: Number(handoffRows[0]?.count ?? 0),
    recentMessages: msgRows,
  };
});

// ─── Card 9: App Queue (pending app orders) ───────────────────────────────────
const appQueueCard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { pending: 0, recentOrders: [] };
    const pending = await db
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
          input.storeId ? eq(orders.storeId, input.storeId) : undefined
        )
      );
    const recentOrders = await db
      .select({
        id: orders.id,
        status: orders.status,
        total: orders.total,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.source, "app"),
          gte(orders.placedAt, nowMinus(4 * HOUR)),
          input.storeId ? eq(orders.storeId, input.storeId) : undefined
        )
      )
      .orderBy(desc(orders.placedAt))
      .limit(10);
    return { pending: Number(pending[0]?.count ?? 0), recentOrders };
  });

// ─── Card 10: Counter Sale Sync ───────────────────────────────────────────────
const counterSaleSyncCard = protectedProcedure
  .input(z.object({ storeId: z.number().int().optional() }))
  .query(async ({ ctx, input: _input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { todayCount: 0, todayRevenue: 0, lastSaleAt: null };
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const rows = await db
      .select({
        count: sql<number>`COUNT(*)`,
        revenue: sql<number>`SUM(total)`,
        lastAt: sql<number>`MAX(confirmed_at)`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.status, "confirmed"),
          gte(sales.createdAt, todayStart.getTime())
        )
      );
    return {
      todayCount: Number(rows[0]?.count ?? 0),
      todayRevenue: Number(rows[0]?.revenue ?? 0),
      lastSaleAt: rows[0]?.lastAt ? new Date(Number(rows[0].lastAt)) : null,
    };
  });

// ─── Card 11: Manual Override Log ────────────────────────────────────────────
const manualOverrideLogCard = protectedProcedure
  .input(z.object({ limit: z.number().int().default(20) }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { overrides: [] };
    const overrides = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        actorId: auditLogs.actorId,
        reason: auditLogs.reason,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        or(
          sql`action LIKE '%override%'`,
          sql`action LIKE '%manual%'`,
          sql`action LIKE '%adjust%'`
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(input.limit);
    return { overrides };
  });

// ─── Card 12: Building-wise Demand Heatmap ────────────────────────────────────
const buildingDemandCard = protectedProcedure
  .input(z.object({ days: z.number().int().default(7) }))
  .query(async ({ ctx, input }) => {
    assertAdmin(ctx.user.role);
    const db = await getDb();
    if (!db) return { heatmap: [] };
    const since = nowMinus(input.days * DAY);
    const heatmap = await db
      .select({
        buildingId: orders.buildingId,
        buildingName: buildings.name,
        orderCount: sql<number>`COUNT(*)`,
        revenue: sql<number>`SUM(orders.total)`,
      })
      .from(orders)
      .leftJoin(buildings, eq(orders.buildingId, buildings.id))
      .where(
        and(
          isNotNull(orders.buildingId),
          gte(orders.placedAt, since),
          ne(orders.status, "cancelled")
        )
      )
      .groupBy(orders.buildingId, buildings.name)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(30);
    return { heatmap };
  });

// ─── Card 13: Sync Health ─────────────────────────────────────────────────────
const syncHealthCard = protectedProcedure.query(async ({ ctx }) => {
  assertAdmin(ctx.user.role);
  const db = await getDb();
  if (!db) return { lastSync: null, recentSyncs: [], staleFeeds: [] };
  const recentSyncs = await db
    .select()
    .from(medivisionSyncLog)
    .orderBy(desc(medivisionSyncLog.startedAt))
    .limit(5);
  const staleFeeds = await db
    .select({
      eventType: systemEvents.eventType,
      lastOccurred: sql<Date>`MAX(occurredAt)`,
    })
    .from(systemEvents)
    .where(eq(systemEvents.eventType, "sync_stale"))
    .groupBy(systemEvents.eventType)
    .limit(10);
  return {
    lastSync: recentSyncs[0] ?? null,
    recentSyncs,
    staleFeeds,
  };
});

// ─── Cards 14-21 + sub-dashboards + snapshot: see commandCenterRouterExtension.ts ─────────

// ─── Export ───────────────────────────────────────────────────────────────────
export const commandCenterRouter = router({
  // Cards 1-13 (first half)
  liveOrders: liveOrdersCard,
  orderAgeing: orderAgeingCard,
  slaBreachRisk: slaBreachRiskCard,
  pharmacistQueue: pharmacistQueueCard,
  riderBoard: riderBoardCard,
  stockoutAlerts: stockoutAlertsCard,
  nearExpiryAlerts: nearExpiryAlertsCard,
  whatsappQueue: whatsappQueueCard,
  appQueue: appQueueCard,
  counterSaleSync: counterSaleSyncCard,
  manualOverrideLog: manualOverrideLogCard,
  buildingDemand: buildingDemandCard,
  syncHealth: syncHealthCard,
  // Cards 14-21 + sub-dashboards + snapshot (second half, from extension)
  ...commandCenterRouterExtension,
});
