/**
 * server/pharmacy.ts
 * Pharmacy OS server layer:
 *  - Rx lane detection (OTC / digital / on_file / fallback)
 *  - Pharmacist workbench (queue, quick-verify, manual review, approve, reject)
 *  - Rx compliance log writer
 *  - Parallel prep flow gate (non-Rx items proceed; Rx items wait for gate)
 *  - Workflow event emitter
 *  - Inventory / FEFO / vendor / PO / staff / rider / metrics queries
 */

import { getDb } from "./db";
import {
  prescriptions,
  rxComplianceLog,
  rxPriorApprovals,
  orders,
  orderItems,
  storeSkus,
  batches,
  vendors,
  purchaseOrders,
  poItems,
  grnRecords,
  staffAssignments,
  workflowEvents,
  userImportanceScores,
  riders,
  deliveryEvents,
  deliveryOtps,
  metricsEvents,
  users,
  products,
} from "../drizzle/schema";
import { eq, and, lte, gte, sql, desc, asc, inArray, ne } from "drizzle-orm";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nowPlusDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function fiveYearsFromNow(): Date {
  return nowPlusDays(365 * 5);
}

// ─── Rx Lane Detection ────────────────────────────────────────────────────────

export type RxLane = "otc" | "digital" | "on_file" | "fallback";

export async function detectRxLane(
  userId: number,
  requiresRxItems: boolean,
  prescriptionId?: number
): Promise<RxLane> {
  if (!requiresRxItems) return "otc";

  const db = await getDb();
  if (!db) return "fallback";

  if (prescriptionId) {
    const rx = await db.select().from(prescriptions)
      .where(and(eq(prescriptions.id, prescriptionId), eq(prescriptions.userId, userId)))
      .limit(1);
    if (rx.length > 0) {
      if (rx[0].lane === "on_file" && rx[0].status === "approved") return "on_file";
      return "digital";
    }
  }

  const approval = await db.select().from(rxPriorApprovals)
    .where(gte(rxPriorApprovals.validUntil, new Date()))
    .limit(1);
  if (approval.length > 0) return "on_file";

  return "fallback";
}

// ─── Compliance Log Writer ────────────────────────────────────────────────────

export async function writeRxComplianceLog(params: {
  rxId: number;
  orderId?: number;
  pharmacistId: number;
  action: typeof rxComplianceLog.$inferInsert["action"];
  note?: string;
  fallbackMode?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(rxComplianceLog).values({
    rxId: params.rxId,
    orderId: params.orderId ?? null,
    pharmacistId: params.pharmacistId,
    action: params.action,
    note: params.note ?? null,
    fallbackMode: params.fallbackMode ?? false,
  });
}

// ─── Workflow Event Emitter ───────────────────────────────────────────────────

export async function emitWorkflowEvent(params: {
  entityType: typeof workflowEvents.$inferInsert["entityType"];
  entityId: number;
  fromState?: string;
  toState: string;
  triggeredByUserId?: number;
  triggeredBySystem?: boolean;
  payload?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(workflowEvents).values({
    entityType: params.entityType,
    entityId: params.entityId,
    fromState: params.fromState ?? null,
    toState: params.toState,
    triggeredByUserId: params.triggeredByUserId ?? null,
    triggeredBySystem: params.triggeredBySystem ?? false,
    payload: params.payload ? JSON.stringify(params.payload) : null,
  });
}

// ─── Metrics Event Emitter ────────────────────────────────────────────────────

export async function emitMetricsEvent(params: {
  eventType: string;
  userId?: number;
  storeId?: number;
  orderId?: number;
  value?: number;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(metricsEvents).values({
    eventType: params.eventType,
    userId: params.userId ?? null,
    storeId: params.storeId ?? null,
    orderId: params.orderId ?? null,
    value: params.value?.toString() ?? null,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
  });
}

// ─── Pharmacist Workbench Queries ─────────────────────────────────────────────

export async function getRxQueue(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: prescriptions.id,
    userId: prescriptions.userId,
    status: prescriptions.status,
    lane: prescriptions.lane,
    imageUrl: prescriptions.imageUrl,
    doctorName: prescriptions.doctorName,
    doctorReg: prescriptions.doctorReg,
    prescribedDate: prescriptions.prescribedDate,
    patientNote: prescriptions.patientNote,
    ocrText: prescriptions.ocrText,
    createdAt: prescriptions.createdAt,
  })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.storeId, storeId),
        inArray(prescriptions.status, ["pending_pharmacist", "quick_verify", "additional_verification"])
      )
    )
    .orderBy(asc(prescriptions.createdAt));
}

export async function quickVerifyRx(rxId: number, pharmacistId: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rx = await db.select().from(prescriptions).where(eq(prescriptions.id, rxId)).limit(1);
  if (!rx.length) throw new Error("Prescription not found");

  await db.update(prescriptions).set({
    status: "approved",
    pharmacistId,
    reviewedAt: new Date(),
    dispensingPharmacistId: pharmacistId,
    retainUntil: fiveYearsFromNow(),
    pharmacistNote: note ?? "Quick verified",
  }).where(eq(prescriptions.id, rxId));

  await writeRxComplianceLog({ rxId, pharmacistId, action: "quick_verify", note });
  await emitWorkflowEvent({
    entityType: "prescription",
    entityId: rxId,
    fromState: rx[0].status,
    toState: "approved",
    triggeredByUserId: pharmacistId,
  });
  return { success: true };
}

export async function approveRx(rxId: number, pharmacistId: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rx = await db.select().from(prescriptions).where(eq(prescriptions.id, rxId)).limit(1);
  if (!rx.length) throw new Error("Prescription not found");

  await db.update(prescriptions).set({
    status: "approved",
    pharmacistId,
    reviewedAt: new Date(),
    dispensingPharmacistId: pharmacistId,
    retainUntil: fiveYearsFromNow(),
    pharmacistNote: note ?? "Approved",
  }).where(eq(prescriptions.id, rxId));

  await writeRxComplianceLog({ rxId, pharmacistId, action: "approved", note });
  await emitWorkflowEvent({
    entityType: "prescription",
    entityId: rxId,
    fromState: rx[0].status,
    toState: "approved",
    triggeredByUserId: pharmacistId,
  });
  return { success: true };
}

export async function rejectRx(rxId: number, pharmacistId: number, note: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rx = await db.select().from(prescriptions).where(eq(prescriptions.id, rxId)).limit(1);
  if (!rx.length) throw new Error("Prescription not found");

  await db.update(prescriptions).set({
    status: "rejected",
    pharmacistId,
    reviewedAt: new Date(),
    pharmacistNote: note,
  }).where(eq(prescriptions.id, rxId));

  await writeRxComplianceLog({ rxId, pharmacistId, action: "rejected", note });
  await emitWorkflowEvent({
    entityType: "prescription",
    entityId: rxId,
    fromState: rx[0].status,
    toState: "rejected",
    triggeredByUserId: pharmacistId,
  });
  return { success: true };
}

export async function manualReviewRx(rxId: number, pharmacistId: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rx = await db.select().from(prescriptions).where(eq(prescriptions.id, rxId)).limit(1);
  if (!rx.length) throw new Error("Prescription not found");

  await db.update(prescriptions).set({
    status: "additional_verification",
    pharmacistId,
    pharmacistNote: note ?? "Sent for manual review",
  }).where(eq(prescriptions.id, rxId));

  await writeRxComplianceLog({ rxId, pharmacistId, action: "manual_review", note });
  return { success: true };
}

export async function clearRxGate(orderId: number, pharmacistId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order.length) throw new Error("Order not found");

  await db.update(orders).set({
    rxGateCleared: true,
    rxGateClearedAt: new Date(),
    rxGateClearedBy: pharmacistId,
    status: "picking",
  }).where(eq(orders.id, orderId));

  await db.update(orderItems).set({ rxGateCleared: true })
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.requiresPrescription, true)));

  if (order[0].prescriptionId) {
    await writeRxComplianceLog({
      rxId: order[0].prescriptionId,
      orderId,
      pharmacistId,
      action: "dispensed",
    });
  }

  await emitWorkflowEvent({
    entityType: "order",
    entityId: orderId,
    fromState: order[0].status,
    toState: "picking",
    triggeredByUserId: pharmacistId,
  });
  return { success: true };
}

// ─── FEFO Queries ─────────────────────────────────────────────────────────────

export async function getFefoAlerts(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const in90Days = nowPlusDays(90);

  const rows = await db.select({
    batchId: batches.id,
    productId: batches.productId,
    batchNumber: batches.batchNumber,
    expiryDate: batches.expiryDate,
    quantity: batches.quantity,
    status: batches.status,
    productName: products.name,
  })
    .from(batches)
    .innerJoin(products, eq(batches.productId, products.id))
    .where(
      and(
        eq(batches.storeId, storeId),
        ne(batches.status, "depleted"),
        lte(batches.expiryDate, in90Days)
      )
    )
    .orderBy(asc(batches.expiryDate));

  return rows.map(r => ({
    ...r,
    daysUntilExpiry: Math.ceil((r.expiryDate.getTime() - now.getTime()) / 86400000),
    severity: r.expiryDate <= nowPlusDays(0) ? "expired" :
              r.expiryDate <= nowPlusDays(30) ? "critical" :
              r.expiryDate <= nowPlusDays(60) ? "warning" : "notice",
  }));
}

// ─── Stock Reservation / Release ─────────────────────────────────────────────

export async function reserveStock(storeSkuId: number, qty: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(storeSkus)
    .set({ softLockedQty: sql`softLockedQty + ${qty}` })
    .where(eq(storeSkus.id, storeSkuId));
}

export async function releaseStock(storeSkuId: number, qty: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(storeSkus)
    .set({ softLockedQty: sql`GREATEST(0, softLockedQty - ${qty})` })
    .where(eq(storeSkus.id, storeSkuId));
}

export async function commitStock(storeSkuId: number, qty: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(storeSkus)
    .set({
      stockQty: sql`GREATEST(0, stockQty - ${qty})`,
      softLockedQty: sql`GREATEST(0, softLockedQty - ${qty})`,
    })
    .where(eq(storeSkus.id, storeSkuId));
}

// ─── Rider Queries ────────────────────────────────────────────────────────────

export async function getAvailableRiders(storeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(riders)
    .where(and(eq(riders.storeId, storeId), eq(riders.status, "available"), eq(riders.isActive, true)));
}

export async function assignRider(orderId: number, riderId: number, assignedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order.length) throw new Error("Order not found");

  await db.update(orders).set({ riderId, status: "out_for_delivery" }).where(eq(orders.id, orderId));
  await db.update(riders).set({ status: "on_delivery" }).where(eq(riders.id, riderId));

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
  await db.insert(deliveryOtps).values({ orderId, otp, expiresAt });

  await db.insert(deliveryEvents).values({
    orderId,
    riderId,
    eventType: "assigned",
    note: `Assigned by user ${assignedByUserId}`,
  });

  await emitWorkflowEvent({
    entityType: "delivery",
    entityId: orderId,
    fromState: order[0].status,
    toState: "out_for_delivery",
    triggeredByUserId: assignedByUserId,
    payload: { riderId },
  });

  return { success: true, otp };
}

export async function verifyDeliveryOtp(orderId: number, otp: string) {
  const db = await getDb();
  if (!db) return { success: false, reason: "Database unavailable" };

  const record = await db.select().from(deliveryOtps)
    .where(and(eq(deliveryOtps.orderId, orderId), eq(deliveryOtps.isUsed, false)))
    .limit(1);

  if (!record.length) return { success: false, reason: "No active OTP for this order" };
  if (record[0].expiresAt < new Date()) return { success: false, reason: "OTP expired" };
  if (record[0].otp !== otp) return { success: false, reason: "Invalid OTP" };

  await db.update(deliveryOtps).set({ isUsed: true, usedAt: new Date() })
    .where(eq(deliveryOtps.id, record[0].id));

  const order = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  await db.update(orders).set({ status: "delivered", deliveredAt: new Date() })
    .where(eq(orders.id, orderId));

  if (order[0]?.riderId) {
    await db.update(riders).set({ status: "available" }).where(eq(riders.id, order[0].riderId));
    await db.insert(deliveryEvents).values({ orderId, riderId: order[0].riderId, eventType: "otp_verified" });
    await db.insert(deliveryEvents).values({ orderId, riderId: order[0].riderId, eventType: "delivered" });
  }

  await emitWorkflowEvent({
    entityType: "delivery",
    entityId: orderId,
    fromState: "out_for_delivery",
    toState: "delivered",
    triggeredBySystem: true,
  });

  return { success: true };
}

export async function recordFailedDelivery(orderId: number, riderId: number, note: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db.insert(deliveryEvents).values({ orderId, riderId, eventType: "failed_attempt", note });
  await db.update(riders).set({ status: "available" }).where(eq(riders.id, riderId));
  await db.update(orders).set({ status: "return_to_stock", cancellationReason: note })
    .where(eq(orders.id, orderId));

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const item of items) {
    await releaseStock(item.storeSkuId, item.quantity);
  }

  await emitWorkflowEvent({
    entityType: "delivery",
    entityId: orderId,
    fromState: "out_for_delivery",
    toState: "return_to_stock",
    triggeredBySystem: true,
    payload: { riderId, note },
  });

  return { success: true };
}

// ─── Metrics Queries ──────────────────────────────────────────────────────────

export async function getDailySales(storeId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 86400000);
  return db.select({
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
  const rows = await db.select({
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
  const rows = await db.select({
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
    onTimePct: rows.length > 0 ? Math.round((onTime.length / rows.length) * 100) : 0,
  };
}

export async function getPharmacistQueueLatency(storeId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
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
  return db.select({
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
  const in90Days = nowPlusDays(90);
  const rows = await db.select({
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

  const chronicCount = await db.select({ count: sql<number>`COUNT(DISTINCT oi.productId)` })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(products.isChronicMedication, true)
      )
    );

  const isChronic = (chronicCount[0]?.count ?? 0) > 0;
  const score = isChronic ? 75 : 50;

  await db.insert(userImportanceScores).values({
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
  return db.select().from(vendors).where(eq(vendors.isActive, true)).orderBy(asc(vendors.name));
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
  return db.select().from(purchaseOrders)
    .where(eq(purchaseOrders.storeId, storeId))
    .orderBy(desc(purchaseOrders.createdAt));
}

export async function createPurchaseOrder(data: {
  vendorId: number;
  storeId: number;
  expectedDelivery?: Date;
  notes?: string;
  createdByUserId: number;
  items: Array<{ productId: number; variantId?: number; orderedQty: number; unitCost: number }>;
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
  items: Array<{ productId: number; variantId?: number; batchNumber: string; expiryDate: Date; quantity: number; unitCost?: number }>;
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
      unitCost: item.unitCost != null ? String(item.unitCost.toFixed(2)) : undefined,
      grnId,
      status: "active",
    });

    await db.update(storeSkus)
      .set({ stockQty: sql`stockQty + ${item.quantity}` })
      .where(
        and(
          eq(storeSkus.storeId, data.storeId),
          eq(storeSkus.productId, item.productId)
        )
      );
  }

  if (data.poId) {
    await db.update(purchaseOrders).set({ status: "received" }).where(eq(purchaseOrders.id, data.poId));
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
  return db.select({
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
    .where(and(eq(staffAssignments.storeId, storeId), eq(staffAssignments.isActive, true)));
}

export async function assignStaff(data: {
  userId: number;
  storeId: number;
  role: typeof staffAssignments.$inferInsert["role"];
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
  await db.update(users).set({ role: data.role, staffStoreId: data.storeId }).where(eq(users.id, data.userId));
  return { success: true };
}

export async function removeStaff(assignmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(staffAssignments).set({ isActive: false }).where(eq(staffAssignments.id, assignmentId));
  return { success: true };
}
