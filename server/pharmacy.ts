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
import { randomInt } from "node:crypto";
import { encryptPharmacistNote } from "./services/prescriptionPiiService";
import {
  prescriptions,
  rxComplianceLog,
  rxPriorApprovals,
  orders,
  orderItems,
  storeSkus,
  batches,
  workflowEvents,
  riders,
  deliveryEvents,
  deliveryOtps,
  metricsEvents,
  products,
} from "../drizzle/schema";
import { eq, and, lte, gte, sql, asc, inArray, ne } from "drizzle-orm";

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
    const rx = await db
      .select()
      .from(prescriptions)
      .where(
        and(
          eq(prescriptions.id, prescriptionId),
          eq(prescriptions.userId, userId)
        )
      )
      .limit(1);
    if (rx.length > 0) {
      if (rx[0].lane === "on_file" && rx[0].status === "approved")
        return "on_file";
      return "digital";
    }
  }

  const approval = await db
    .select()
    .from(rxPriorApprovals)
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
  action: (typeof rxComplianceLog.$inferInsert)["action"];
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
  entityType: (typeof workflowEvents.$inferInsert)["entityType"];
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
  return db
    .select({
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
        inArray(prescriptions.status, [
          "pending_pharmacist",
          "quick_verify",
          "additional_verification",
        ])
      )
    )
    .orderBy(asc(prescriptions.createdAt));
}

export async function quickVerifyRx(
  rxId: number,
  pharmacistId: number,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rx = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, rxId))
    .limit(1);
  if (!rx.length) throw new Error("Prescription not found");

  await db
    .update(prescriptions)
    .set({
      status: "approved",
      pharmacistId,
      reviewedAt: new Date(),
      dispensingPharmacistId: pharmacistId,
      retainUntil: fiveYearsFromNow(),
      pharmacistNote: await encryptPharmacistNote(note ?? "Quick verified"),
    })
    .where(eq(prescriptions.id, rxId));

  await writeRxComplianceLog({
    rxId,
    pharmacistId,
    action: "quick_verify",
    note,
  });
  await emitWorkflowEvent({
    entityType: "prescription",
    entityId: rxId,
    fromState: rx[0].status,
    toState: "approved",
    triggeredByUserId: pharmacistId,
  });
  return { success: true };
}

export async function approveRx(
  rxId: number,
  pharmacistId: number,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rx = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, rxId))
    .limit(1);
  if (!rx.length) throw new Error("Prescription not found");

  await db
    .update(prescriptions)
    .set({
      status: "approved",
      pharmacistId,
      reviewedAt: new Date(),
      dispensingPharmacistId: pharmacistId,
      retainUntil: fiveYearsFromNow(),
      pharmacistNote: await encryptPharmacistNote(note ?? "Approved"),
    })
    .where(eq(prescriptions.id, rxId));

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

export async function rejectRx(
  rxId: number,
  pharmacistId: number,
  note: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rx = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, rxId))
    .limit(1);
  if (!rx.length) throw new Error("Prescription not found");

  await db
    .update(prescriptions)
    .set({
      status: "rejected",
      pharmacistId,
      reviewedAt: new Date(),
      pharmacistNote: await encryptPharmacistNote(note),
    })
    .where(eq(prescriptions.id, rxId));

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

export async function manualReviewRx(
  rxId: number,
  pharmacistId: number,
  note?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rx = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, rxId))
    .limit(1);
  if (!rx.length) throw new Error("Prescription not found");

  await db
    .update(prescriptions)
    .set({
      status: "additional_verification",
      pharmacistId,
      pharmacistNote: await encryptPharmacistNote(
        note ?? "Sent for manual review"
      ),
    })
    .where(eq(prescriptions.id, rxId));

  await writeRxComplianceLog({
    rxId,
    pharmacistId,
    action: "manual_review",
    note,
  });
  return { success: true };
}

export async function clearRxGate(orderId: number, pharmacistId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order.length) throw new Error("Order not found");
  // P1 prior-approval enforcement: prescription must be approved before dispensing.
  // A pharmacist cannot clear the Rx gate on a pending or rejected prescription.
  if (order[0].prescriptionId) {
    const [rx] = await db
      .select({ status: prescriptions.status })
      .from(prescriptions)
      .where(eq(prescriptions.id, order[0].prescriptionId))
      .limit(1);
    if (!rx) throw new Error("Prescription not found for this order");
    if (rx.status !== "approved") {
      throw new Error(
        `Cannot dispense: prescription status is '${rx.status}'. Pharmacist must approve the prescription before clearing the Rx gate.`
      );
    }
  }
  await db
    .update(orders)
    .set({
      rxGateCleared: true,
      rxGateClearedAt: new Date(),
      rxGateClearedBy: pharmacistId,
      status: "picking",
    })
    .where(eq(orders.id, orderId));

  await db
    .update(orderItems)
    .set({ rxGateCleared: true })
    .where(
      and(
        eq(orderItems.orderId, orderId),
        eq(orderItems.requiresPrescription, true)
      )
    );

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

  const rows = await db
    .select({
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
    daysUntilExpiry: Math.ceil(
      (r.expiryDate.getTime() - now.getTime()) / 86400000
    ),
    severity:
      r.expiryDate <= nowPlusDays(0)
        ? "expired"
        : r.expiryDate <= nowPlusDays(30)
          ? "critical"
          : r.expiryDate <= nowPlusDays(60)
            ? "warning"
            : "notice",
  }));
}

// ─── Stock Reservation / Release ─────────────────────────────────────────────

export async function reserveStock(storeSkuId: number, qty: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(storeSkus)
    .set({ softLockedQty: sql`softLockedQty + ${qty}` })
    .where(eq(storeSkus.id, storeSkuId));
}

export async function releaseStock(storeSkuId: number, qty: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(storeSkus)
    .set({ softLockedQty: sql`GREATEST(0, softLockedQty - ${qty})` })
    .where(eq(storeSkus.id, storeSkuId));
}

export async function commitStock(storeSkuId: number, qty: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(storeSkus)
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
  return db
    .select()
    .from(riders)
    .where(
      and(
        eq(riders.storeId, storeId),
        eq(riders.status, "available"),
        eq(riders.isActive, true)
      )
    );
}

export async function assignRider(
  orderId: number,
  riderId: number,
  assignedByUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order.length) throw new Error("Order not found");

  await db
    .update(orders)
    .set({ riderId, status: "out_for_delivery" })
    .where(eq(orders.id, orderId));
  await db
    .update(riders)
    .set({ status: "on_delivery" })
    .where(eq(riders.id, riderId));

  const otp = randomInt(100000, 1000000).toString();
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

  const record = await db
    .select()
    .from(deliveryOtps)
    .where(
      and(eq(deliveryOtps.orderId, orderId), eq(deliveryOtps.isUsed, false))
    )
    .limit(1);

  if (!record.length)
    return { success: false, reason: "No active OTP for this order" };
  if (record[0].expiresAt < new Date())
    return { success: false, reason: "OTP expired" };
  if (record[0].otp !== otp) return { success: false, reason: "Invalid OTP" };

  await db
    .update(deliveryOtps)
    .set({ isUsed: true, usedAt: new Date() })
    .where(eq(deliveryOtps.id, record[0].id));

  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  await db
    .update(orders)
    .set({ status: "delivered", deliveredAt: new Date() })
    .where(eq(orders.id, orderId));

  if (order[0]?.riderId) {
    await db
      .update(riders)
      .set({ status: "available" })
      .where(eq(riders.id, order[0].riderId));
    await db.insert(deliveryEvents).values({
      orderId,
      riderId: order[0].riderId,
      eventType: "otp_verified",
    });
    await db
      .insert(deliveryEvents)
      .values({ orderId, riderId: order[0].riderId, eventType: "delivered" });
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

export async function recordFailedDelivery(
  orderId: number,
  riderId: number,
  note: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .insert(deliveryEvents)
    .values({ orderId, riderId, eventType: "failed_attempt", note });
  await db
    .update(riders)
    .set({ status: "available" })
    .where(eq(riders.id, riderId));
  await db
    .update(orders)
    .set({ status: "return_to_stock", cancellationReason: note })
    .where(eq(orders.id, orderId));

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
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

export * from "./pharmacy-metrics";
