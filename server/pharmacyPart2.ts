import { getDb } from "./db";
import {
  batches,
  grnRecords,
  orderItems,
  orders,
  poItems,
  prescriptions,
  products,
  purchaseOrders,
  staffAssignments,
  storeSkus,
  userImportanceScores,
  users,
  vendors,
} from "../drizzle/schema";
import { eq, and, lte, gte, sql, desc, asc, ne } from "drizzle-orm";
import { emitWorkflowEvent } from "./pharmacy";

// ─── Metrics Queries ──────────────────────────────────────────────────────────

export async function getDailySales(storeId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 86400000);
  return db
    .select({
      date: sql<string>`DATE(placedAt)`,
      revenue: sql<number>`SUM(total)`,
      orderCount: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, "delivered"),
        gte(orders.placedAt, since)
      )
    )
    .groupBy(sql`DATE(placedAt)`)
    .orderBy(asc(sql`DATE(placedAt)`));
}

export async function getAov(storeId: number, days = 30) {
  const db = await getDb();
  if (!db) return null;
  const since = new Date(Date.now() - days * 86400000);
  const rows = await db
    .select({
      aov: sql<number>`AVG(total)`,
      totalOrders: sql<number>`COUNT(*)`,
      totalRevenue: sql<number>`SUM(total)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, "delivered"),
        gte(orders.placedAt, since)
      )
    );
  return rows[0] ?? null;
}

export async function getSlaPerformance(storeId: number, days = 30) {
  const db = await getDb();
  if (!db) return { total: 0, onTime: 0, onTimePct: 0 };
  const since = new Date(Date.now() - days * 86400000);
  const rows = await db
    .select({
      orderId: orders.id,
      promisedSlaMins: orders.promisedSlaMins,
      placedAt: orders.placedAt,
      deliveredAt: orders.deliveredAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.storeId, storeId),
        eq(orders.status, "delivered"),
        gte(orders.placedAt, since)
      )
    );

  const onTime = rows.filter(r => {
    if (!r.deliveredAt) return false;
    const actualMins = (r.deliveredAt.getTime() - r.placedAt.getTime()) / 60000;
    return actualMins <= r.promisedSlaMins;
  });

  return {
    total: rows.length,
    onTime: onTime.length,
    onTimePct:
      rows.length > 0 ? Math.round((onTime.length / rows.length) * 100) : 0,
  };
}

export async function getPharmacistQueueLatency(storeId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      avgLatencyMins: sql<number>`AVG(TIMESTAMPDIFF(MINUTE, createdAt, reviewedAt))`,
      pending: sql<number>`SUM(CASE WHEN status IN ('pending_pharmacist','quick_verify','additional_verification') THEN 1 ELSE 0 END)`,
    })
    .from(prescriptions)
    .where(eq(prescriptions.storeId, storeId));
  return rows[0] ?? null;
}

export async function getStockouts(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      skuId: storeSkus.id,
      productId: storeSkus.productId,
      productName: products.name,
      stockQty: storeSkus.stockQty,
      softLockedQty: storeSkus.softLockedQty,
    })
    .from(storeSkus)
    .innerJoin(products, eq(storeSkus.productId, products.id))
    .where(
      and(
        eq(storeSkus.storeId, storeId),
        eq(storeSkus.isActive, true),
        lte(storeSkus.stockQty, 0)
      )
    );
}

export async function getExpiryExposure(storeId: number) {
  const db = await getDb();
  if (!db) return null;
  const in90Days = new Date();
  in90Days.setDate(in90Days.getDate() + 90);
  const rows = await db
    .select({
      expiringCount: sql<number>`COUNT(*)`,
      expiringValue: sql<number>`SUM(quantity * COALESCE(unitCost, 0))`,
    })
    .from(batches)
    .where(
      and(
        eq(batches.storeId, storeId),
        ne(batches.status, "depleted"),
        lte(batches.expiryDate, in90Days)
      )
    );
  return rows[0] ?? null;
}

// ─── User Importance Score ────────────────────────────────────────────────────

export async function updateImportanceScore(userId: number) {
  const db = await getDb();
  if (!db) return;

  const chronicCount = await db
    .select({ count: sql<number>`COUNT(DISTINCT oi.productId)` })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(eq(orders.userId, userId), eq(products.isChronicMedication, true))
    );

  const isChronic = (chronicCount[0]?.count ?? 0) > 0;
  const score = isChronic ? 75 : 50;

  await db
    .insert(userImportanceScores)
    .values({
      userId,
      score,
      isChronic,
      isElderly: false,
      isAdherenceRisk: false,
    })
    .onDuplicateKeyUpdate({
      set: { score, isChronic, updatedAt: new Date() },
    });
}

// ─── Vendor / PO Queries ──────────────────────────────────────────────────────

export async function getVendors() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(vendors)
    .where(eq(vendors.isActive, true))
    .orderBy(asc(vendors.name));
}

export async function createVendor(data: {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  address?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(vendors).values(data);
  return { id: (result as { insertId: number }).insertId };
}

export async function getPurchaseOrders(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.storeId, storeId))
    .orderBy(desc(purchaseOrders.createdAt));
}

export async function createPurchaseOrder(data: {
  vendorId: number;
  storeId: number;
  expectedDelivery?: Date;
  notes?: string;
  createdByUserId: number;
  items: Array<{
    productId: number;
    variantId?: number;
    orderedQty: number;
    unitCost: number;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const total = data.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0);
  const [result] = await db.insert(purchaseOrders).values({
    vendorId: data.vendorId,
    storeId: data.storeId,
    expectedDelivery: data.expectedDelivery,
    notes: data.notes,
    createdByUserId: data.createdByUserId,
    totalAmount: total.toFixed(2),
    status: "draft",
  });
  const poId = (result as { insertId: number }).insertId;

  for (const item of data.items) {
    await db.insert(poItems).values({
      poId,
      productId: item.productId,
      variantId: item.variantId,
      orderedQty: item.orderedQty,
      unitCost: String(item.unitCost.toFixed(2)),
    });
  }

  return { id: poId };
}

export async function receiveGrn(data: {
  poId?: number;
  storeId: number;
  receivedByUserId: number;
  notes?: string;
  items: Array<{
    productId: number;
    variantId?: number;
    batchNumber: string;
    expiryDate: Date;
    quantity: number;
    unitCost?: number;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const [grnResult] = await db.insert(grnRecords).values({
    poId: data.poId ?? null,
    storeId: data.storeId,
    receivedByUserId: data.receivedByUserId,
    notes: data.notes,
    status: "pending",
  });
  const grnId = (grnResult as { insertId: number }).insertId;

  for (const item of data.items) {
    await db.insert(batches).values({
      storeId: data.storeId,
      productId: item.productId,
      variantId: item.variantId,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      unitCost:
        item.unitCost != null ? String(item.unitCost.toFixed(2)) : undefined,
      grnId,
      status: "active",
    });

    await db
      .update(storeSkus)
      .set({ stockQty: sql`stockQty + ${item.quantity}` })
      .where(
        and(
          eq(storeSkus.storeId, data.storeId),
          eq(storeSkus.productId, item.productId)
        )
      );
  }

  if (data.poId) {
    await db
      .update(purchaseOrders)
      .set({ status: "received" })
      .where(eq(purchaseOrders.id, data.poId));
  }

  await emitWorkflowEvent({
    entityType: "grn",
    entityId: grnId,
    fromState: "pending",
    toState: "verified",
    triggeredByUserId: data.receivedByUserId,
  });

  return { id: grnId };
}

// ─── Staff Queries ────────────────────────────────────────────────────────────

export async function getStaffForStore(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: staffAssignments.id,
      userId: staffAssignments.userId,
      role: staffAssignments.role,
      isActive: staffAssignments.isActive,
      assignedAt: staffAssignments.assignedAt,
      userName: users.name,
      userPhone: users.phone,
      userEmail: users.email,
    })
    .from(staffAssignments)
    .innerJoin(users, eq(staffAssignments.userId, users.id))
    .where(
      and(
        eq(staffAssignments.storeId, storeId),
        eq(staffAssignments.isActive, true)
      )
    );
}

export async function assignStaff(data: {
  userId: number;
  storeId: number;
  role: (typeof staffAssignments.$inferInsert)["role"];
  assignedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db.insert(staffAssignments).values({
    userId: data.userId,
    storeId: data.storeId,
    role: data.role,
    assignedByUserId: data.assignedByUserId,
    isActive: true,
  });
  await db
    .update(users)
    .set({ role: data.role, staffStoreId: data.storeId })
    .where(eq(users.id, data.userId));
  return { success: true };
}

export async function removeStaff(assignmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(staffAssignments)
    .set({ isActive: false })
    .where(eq(staffAssignments.id, assignmentId));
  return { success: true };
}
