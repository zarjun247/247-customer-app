/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
import { and, desc, eq, gt, lte, or, sql } from "drizzle-orm";
import {
  auditLogs,
  batchLedger,
  doctorConsultRequests,
  orderItems,
  orders,
  prescriptions,
  productVariants,
  products,
  refillReminders,
  stockReservations,
  storeSkus,
  whatsappSessions,
} from "../drizzle/schema";
import { createOrderInvoiceSnapshot } from "./services/invoiceSnapshotService";
import {
  getDb,
  getUserByPhone,
  getOrderById,
  getOrderItems,
  updateOrderInvoice,
} from "./db";

const SPONSORED_SAFE_CATEGORIES = [
  "fmcg",
  "wellness",
  "nutrition",
  "devices",
  "baby",
] as const;

function canonicalAvailabilitySql() {
  return sql<number>`COALESCE((SELECT SUM(bl.qtyOnHand - bl.qtyReserved - bl.qtyQuarantined - bl.qtyExpired) FROM ${batchLedger} bl WHERE bl.productId = ${storeSkus.productId} AND bl.storeId = ${storeSkus.storeId} AND ((${storeSkus.variantId} IS NULL AND bl.variantId IS NULL) OR bl.variantId = ${storeSkus.variantId}) AND bl.status = 'active'), ${storeSkus.stockQty}) - COALESCE((SELECT SUM(COALESCE(sr.qty, sr.qtyReserved)) FROM ${stockReservations} sr WHERE sr.productId = ${storeSkus.productId} AND sr.storeId = ${storeSkus.storeId} AND ((${storeSkus.variantId} IS NULL AND sr.variantId IS NULL) OR sr.variantId = ${storeSkus.variantId}) AND sr.status = 'active' AND (sr.expiresAt IS NULL OR sr.expiresAt > NOW())), 0) - ${storeSkus.softLockedQty}`;
}

export async function getSponsoredShelf(storeId: number, limit = 8) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select({
      skuId: storeSkus.id,
      productId: products.id,
      variantId: storeSkus.variantId,
      name: products.name,
      brand: products.brand,
      genericName: products.genericName,
      form: productVariants.form,
      strength: productVariants.strength,
      packSize: productVariants.packSize,
      displayLabel: productVariants.displayLabel,
      schedule: products.schedule,
      requiresPrescription: products.requiresPrescription,
      isChronicMedication: products.isChronicMedication,
      category: products.category,
      companyName: products.companyName,
      imageUrl: products.imageUrl,
      mrp: storeSkus.mrp,
      sellingPrice: storeSkus.sellingPrice,
      stockQty: storeSkus.stockQty,
      softLockedQty: storeSkus.softLockedQty,
      availableQty: canonicalAvailabilitySql(),
      isFeatured: storeSkus.isFeatured,
      sponsorPriority: storeSkus.sponsorPriority,
      sponsorCategory: storeSkus.sponsorCategory,
      sponsorLabel: storeSkus.sponsorLabel,
    })
    .from(storeSkus)
    .innerJoin(products, eq(storeSkus.productId, products.id))
    .leftJoin(productVariants, eq(storeSkus.variantId, productVariants.id))
    .where(
      and(
        eq(storeSkus.storeId, storeId),
        eq(storeSkus.isActive, true),
        eq(storeSkus.isFeatured, true),
        eq(products.requiresPrescription, false),
        or(...SPONSORED_SAFE_CATEGORIES.map(c => eq(products.category, c))),
        or(
          sql`${storeSkus.sponsorValidUntil} IS NULL`,
          gt(storeSkus.sponsorValidUntil, now)
        )
      )
    )
    .orderBy(desc(storeSkus.sponsorPriority))
    .limit(limit);
}

export function buildSearchableTokens(product: {
  name: string;
  brand?: string | null;
  genericName?: string | null;
  companyName?: string | null;
  strength?: string | null;
  form?: string | null;
  barcode?: string | null;
}): string {
  const parts = [
    product.name,
    product.brand,
    product.genericName,
    product.companyName,
    product.strength,
    product.form,
    product.barcode,
  ]
    .filter(Boolean)
    .map(s =>
      s!
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  const tokenSet = new Set(
    parts
      .join(" ")
      .split(" ")
      .filter(t => t.length > 1)
  );
  return Array.from(tokenSet).join(" ");
}

export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(
      /tablet|capsule|syrup|injection|ointment|cream|gel|drops|suspension|solution/gi,
      s => s.toLowerCase()
    )
    .trim();
}

export async function getRefillReminders(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select({
      id: refillReminders.id,
      userId: refillReminders.userId,
      avgIntervalDays: refillReminders.avgIntervalDays,
      nextReminderAt: refillReminders.nextReminderAt,
      lastOrderedAt: refillReminders.lastOrderedAt,
      isDismissed: refillReminders.isDismissed,
      snoozedUntil: refillReminders.snoozedUntil,
      productId: products.id,
      name: products.name,
      brand: products.brand,
      form: products.form,
      strength: products.strength,
      packSize: products.packSize,
      isChronicMedication: products.isChronicMedication,
      imageUrl: products.imageUrl,
    })
    .from(refillReminders)
    .innerJoin(products, eq(refillReminders.productId, products.id))
    .where(
      and(
        eq(refillReminders.userId, userId),
        eq(refillReminders.isDismissed, false),
        or(
          sql`${refillReminders.snoozedUntil} IS NULL`,
          lte(refillReminders.snoozedUntil, now)
        ),
        lte(
          refillReminders.nextReminderAt,
          new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        )
      )
    )
    .orderBy(refillReminders.nextReminderAt);
}

export async function dismissRefillReminder(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(refillReminders)
    .set({ isDismissed: true })
    .where(and(eq(refillReminders.id, id), eq(refillReminders.userId, userId)));
}

export async function snoozeRefillReminder(
  id: number,
  userId: number,
  days: number
) {
  const db = await getDb();
  if (!db) return;
  const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await db
    .update(refillReminders)
    .set({ snoozedUntil })
    .where(and(eq(refillReminders.id, id), eq(refillReminders.userId, userId)));
}

export async function getSnoozedReminders(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db
    .select({
      id: refillReminders.id,
      userId: refillReminders.userId,
      avgIntervalDays: refillReminders.avgIntervalDays,
      nextReminderAt: refillReminders.nextReminderAt,
      lastOrderedAt: refillReminders.lastOrderedAt,
      isDismissed: refillReminders.isDismissed,
      snoozedUntil: refillReminders.snoozedUntil,
      productId: products.id,
      name: products.name,
      brand: products.brand,
      form: products.form,
      strength: products.strength,
      packSize: products.packSize,
      isChronicMedication: products.isChronicMedication,
      imageUrl: products.imageUrl,
    })
    .from(refillReminders)
    .innerJoin(products, eq(refillReminders.productId, products.id))
    .where(
      and(
        eq(refillReminders.userId, userId),
        eq(refillReminders.isDismissed, false),
        sql`${refillReminders.snoozedUntil} IS NOT NULL`,
        sql`${refillReminders.snoozedUntil} > ${now}`
      )
    )
    .orderBy(refillReminders.snoozedUntil);
}

export async function upsertRefillReminder(
  userId: number,
  productId: number,
  lastOrderedAt: Date,
  avgIntervalDays: number
) {
  const db = await getDb();
  if (!db) return;
  const nextReminderAt = new Date(
    lastOrderedAt.getTime() + (avgIntervalDays - 5) * 24 * 60 * 60 * 1000
  );
  const existing = await db
    .select()
    .from(refillReminders)
    .where(
      and(
        eq(refillReminders.userId, userId),
        eq(refillReminders.productId, productId)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(refillReminders)
      .set({
        lastOrderedAt,
        avgIntervalDays,
        nextReminderAt,
        isDismissed: false,
      })
      .where(eq(refillReminders.id, existing[0].id));
  } else {
    await db.insert(refillReminders).values({
      userId,
      productId,
      lastOrderedAt,
      avgIntervalDays,
      nextReminderAt,
    });
  }
}

export async function getWhatsappSession(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db
    .select()
    .from(whatsappSessions)
    .where(eq(whatsappSessions.phone, phone))
    .limit(1);
  return r[0];
}

export async function upsertWhatsappSession(
  phone: string,
  data: { userId?: number; currentFlow?: string; flowState?: string }
) {
  const db = await getDb();
  if (!db) return;
  const existing = await getWhatsappSession(phone);
  const now = new Date();
  if (existing) {
    await db
      .update(whatsappSessions)
      .set({ ...data, lastMessageAt: now })
      .where(eq(whatsappSessions.phone, phone));
  } else {
    await db
      .insert(whatsappSessions)
      .values({ phone, ...data, lastMessageAt: now });
  }
}

export interface AuditLogOptions {
  actorId?: number | null;
  actorType?: string;
  actorRole?: string;
  entityType?: string;
  entityId?: number;
  beforeJson?: unknown;
  afterJson?: unknown;
  payload?: unknown;
  reason?: string;
  channel?: string;
  ipAddress?: string;
  sessionId?: string;
  deviceId?: string;
}

export interface AuditLogParams {
  actor: { id: number | null; role?: string; type?: string };
  action: string;
  entityType?: string;
  entityId?: number;
  before?: unknown;
  after?: unknown;
  reason?: string;
  channel?: string;
  ipAddress?: string;
  sessionId?: string;
  deviceId?: string;
  payload?: unknown;
}

export async function writeAuditLog(
  userIdOrParams: number | null | AuditLogParams,
  action?: string,
  entityType?: string,
  entityId?: number,
  payload?: unknown,
  opts?: AuditLogOptions
) {
  const db = await getDb();
  if (!db) return;

  if (userIdOrParams !== null && typeof userIdOrParams === "object") {
    const p = userIdOrParams;
    await db.insert(auditLogs).values({
      userId: p.actor.id ?? undefined,
      actorId: p.actor.id ?? undefined,
      actorType: p.actor.type ?? "user",
      actorRole: p.actor.role,
      action: p.action,
      entityType: p.entityType,
      entityId: p.entityId,
      beforeJson: p.before ? JSON.stringify(p.before) : undefined,
      afterJson: p.after ? JSON.stringify(p.after) : undefined,
      payload: p.payload ? JSON.stringify(p.payload) : undefined,
      reason: p.reason,
      channel: p.channel ?? "app",
      ipAddress: p.ipAddress,
      sessionId: p.sessionId,
      deviceId: p.deviceId,
    });
    return;
  }

  const userId = userIdOrParams;
  await db.insert(auditLogs).values({
    userId: userId ?? undefined,
    actorId: opts?.actorId ?? userId ?? undefined,
    actorType: opts?.actorType ?? "user",
    actorRole: opts?.actorRole,
    action: action!,
    entityType: opts?.entityType ?? entityType,
    entityId: opts?.entityId ?? entityId,
    beforeJson: opts?.beforeJson ? JSON.stringify(opts.beforeJson) : undefined,
    afterJson: opts?.afterJson ? JSON.stringify(opts.afterJson) : undefined,
    payload:
      (opts?.payload ?? payload)
        ? JSON.stringify(opts?.payload ?? payload)
        : undefined,
    reason: opts?.reason,
    channel: opts?.channel ?? "app",
    ipAddress: opts?.ipAddress,
    sessionId: opts?.sessionId,
    deviceId: opts?.deviceId,
  });
}

export async function computeRefillIntervalFromHistory(
  userId: number,
  productId: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 30;
  const rows = await db
    .select({
      deliveredAt: orders.deliveredAt,
      createdAt: orders.createdAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.productId, productId),
        eq(orders.status, "delivered")
      )
    )
    .orderBy(orders.createdAt);

  if (rows.length < 2) return 30;

  const dates = rows.map(r => (r.deliveredAt ?? r.createdAt).getTime());
  let totalGap = 0;
  for (let i = 1; i < dates.length; i++) {
    totalGap += (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
  }
  const avg = Math.round(totalGap / (dates.length - 1));
  return Math.min(90, Math.max(7, avg));
}

export async function getOrderItemsForReorder(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: orderItems.id,
      storeSkuId: orderItems.storeSkuId,
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      name: products.name,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
}

export async function createWhatsappPrescription(
  phone: string,
  imageUrl: string,
  imageKey: string
) {
  const db = await getDb();
  if (!db) return null;
  const session = await getWhatsappSession(phone);
  let userId = session?.userId ?? null;
  if (!userId) {
    const existingUser = await getUserByPhone(phone);
    userId = existingUser?.id ?? null;
    if (userId) await upsertWhatsappSession(phone, { userId });
  }
  if (!userId) {
    await upsertWhatsappSession(phone, {
      currentFlow: "pending_link",
      flowState: JSON.stringify({
        identity: "unlinked",
        pendingRxUpload: true,
        imageUrl,
        imageKey,
      }),
    });
    console.error(
      "[WhatsApp] Could not resolve userId for phone",
      phone,
      "— queued pending linkage and skipped Rx insert"
    );
    return null;
  }
  const [r] = await db.insert(prescriptions).values({
    userId,
    storeId: undefined,
    imageUrl,
    imageKey,
    status: "pending_pharmacist",
    source: "whatsapp",
  });
  return (r as any).insertId as number;
}

export async function generateAndStoreInvoice(
  orderId: number,
  storeFn: (
    key: string,
    data: Buffer,
    mime: string
  ) => Promise<{ url: string; key: string }>
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const order = await getOrderById(orderId);
  if (!order) return null;
  const items = await getOrderItems(orderId);

  const lines = [
    `24/7 PHARMACY — TAX INVOICE`,
    `Order #${orderId}`,
    `Date: ${new Date(order.createdAt).toLocaleDateString("en-IN")}`,
    ``,
    `Items:`,
    ...items.map(
      i =>
        `  ${i.name} (${i.form ?? ""} ${i.strength ?? ""}) x${i.quantity}  ₹${i.lineTotal}`
    ),
    ``,
    `Subtotal: ₹${order.subtotal}`,
    `Total: ₹${order.total}`,
    ``,
    `Delivered to: ${order.flatNumber ?? "—"}`,
    ``,
    `This is a computer-generated invoice.`,
  ].join("\n");

  const buffer = Buffer.from(lines, "utf-8");
  const key = `invoices/order-${orderId}-${Date.now()}.txt`;
  try {
    const { url } = await storeFn(key, buffer, "text/plain");
    await updateOrderInvoice(orderId, url, key);
    await createOrderInvoiceSnapshot(db, orderId, {
      pdfFileKey: key,
      pdfFileUrl: url,
    });
    return url;
  } catch (error) {
    await createOrderInvoiceSnapshot(db, orderId, {
      failureReason:
        error instanceof Error ? error.message : "invoice_storage_failed",
    });
    throw error;
  }
}

export async function createConsultRequest(
  userId: number,
  chiefComplaint: string,
  consultType: "instant" | "scheduled" = "instant"
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.insert(doctorConsultRequests).values({
    userId,
    chiefComplaint,
    consultType,
    consentGiven: true,
    status: "requested",
  });
  const [row] = await db
    .select()
    .from(doctorConsultRequests)
    .where(eq(doctorConsultRequests.userId, userId))
    .orderBy(desc(doctorConsultRequests.requestedAt))
    .limit(1);
  return row;
}

export async function getConsultRequests(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(doctorConsultRequests)
    .where(eq(doctorConsultRequests.userId, userId))
    .orderBy(desc(doctorConsultRequests.requestedAt));
}

export async function linkConsultPrescription(
  consultId: number,
  userId: number,
  prescriptionId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(doctorConsultRequests)
    .set({ linkedPrescriptionId: prescriptionId, status: "completed" })
    .where(
      and(
        eq(doctorConsultRequests.id, consultId),
        eq(doctorConsultRequests.userId, userId)
      )
    );
}
