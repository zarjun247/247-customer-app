import { and, desc, eq, gt, gte, ilike, like, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  batches,
  buildings,
  cartItems,
  InsertUser,
  orderItems,
  orders,
  otpCodes,
  prescriptions,
  productVariants,
  products,
  refillReminders,
  storeSkus,
  stores,
  users,
  whatsappSessions,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const fields = ["name", "email", "loginMethod", "phone"] as const;
  for (const f of fields) {
    const v = user[f];
    if (v !== undefined) { values[f] = v ?? null; updateSet[f] = v ?? null; }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUserProfile(userId: number, data: {
  name?: string; buildingId?: number; flatNumber?: string; assignedStoreId?: number; onboardingComplete?: boolean; phone?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data).where(eq(users.id, userId));
}

// ─── OTP ──────────────────────────────────────────────────────────────────────
export async function createOtp(phone: string, code: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) return;
  await db.insert(otpCodes).values({ phone, code, expiresAt });
}

export async function verifyOtp(phone: string, code: string) {
  const db = await getDb();
  if (!db) return false;
  const now = new Date();
  const result = await db.select().from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), eq(otpCodes.code, code), eq(otpCodes.isUsed, false), gt(otpCodes.expiresAt, now)))
    .limit(1);
  if (result.length === 0) return false;
  await db.update(otpCodes).set({ isUsed: true }).where(eq(otpCodes.id, result[0].id));
  return true;
}

// ─── Buildings & Stores ───────────────────────────────────────────────────────
export async function getBuildings() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(buildings).orderBy(buildings.name);
}

export async function getBuildingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(buildings).where(eq(buildings.id, id)).limit(1);
  return r[0];
}

export async function getStoreById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  return r[0];
}

// ─── Products / Catalog ───────────────────────────────────────────────────────
export async function getCatalog(
  storeId: number,
  search?: string,
  category?: string,
  limit = 60,
  offset = 0
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(storeSkus.storeId, storeId), eq(storeSkus.isActive, true)];
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        like(products.name, term),
        like(products.brand, term),
        like(products.genericName, term),
        like(products.companyName, term)
      )!
    );
  }
  if (category && category !== 'all') {
    conditions.push(eq(products.category, category as any));
  }
  return db.select({
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
    imageApprovalStatus: products.imageApprovalStatus,
    mrp: storeSkus.mrp,
    sellingPrice: storeSkus.sellingPrice,
    stockQty: storeSkus.stockQty,
    softLockedQty: storeSkus.softLockedQty,
    availableQty: sql<number>`${storeSkus.stockQty} - ${storeSkus.softLockedQty}`,
  }).from(storeSkus)
    .innerJoin(products, eq(storeSkus.productId, products.id))
    .leftJoin(productVariants, eq(storeSkus.variantId, productVariants.id))
    .where(and(...conditions))
    .orderBy(products.name)
    .limit(limit)
    .offset(offset);
}

export async function getSkuById(skuId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select({
    skuId: storeSkus.id, productId: products.id, variantId: storeSkus.variantId,
    name: products.name, brand: products.brand,
    genericName: products.genericName, form: productVariants.form, strength: productVariants.strength,
    packSize: productVariants.packSize, displayLabel: productVariants.displayLabel,
    schedule: products.schedule,
    requiresPrescription: products.requiresPrescription, isChronicMedication: products.isChronicMedication,
    imageUrl: products.imageUrl, mrp: storeSkus.mrp, sellingPrice: storeSkus.sellingPrice,
    stockQty: storeSkus.stockQty, softLockedQty: storeSkus.softLockedQty,
    availableQty: sql<number>`${storeSkus.stockQty} - ${storeSkus.softLockedQty}`,
    storeId: storeSkus.storeId,
  }).from(storeSkus).innerJoin(products, eq(storeSkus.productId, products.id))
    .leftJoin(productVariants, eq(storeSkus.variantId, productVariants.id))
    .where(eq(storeSkus.id, skuId)).limit(1);
  return r[0];
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
export async function getCart(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: cartItems.id, userId: cartItems.userId, quantity: cartItems.quantity,
    isLocked: cartItems.isLocked, lockedAt: cartItems.lockedAt,
    skuId: storeSkus.id, productId: products.id, variantId: storeSkus.variantId,
    name: products.name,
    brand: products.brand, form: productVariants.form, strength: productVariants.strength,
    packSize: productVariants.packSize, displayLabel: productVariants.displayLabel,
    requiresPrescription: products.requiresPrescription,
    imageUrl: products.imageUrl, mrp: storeSkus.mrp, sellingPrice: storeSkus.sellingPrice,
    stockQty: storeSkus.stockQty, softLockedQty: storeSkus.softLockedQty,
    storeId: storeSkus.storeId,
    isChronicMedication: products.isChronicMedication,
  }).from(cartItems)
    .innerJoin(storeSkus, eq(cartItems.storeSkuId, storeSkus.id))
    .innerJoin(products, eq(storeSkus.productId, products.id))
    .leftJoin(productVariants, eq(storeSkus.variantId, productVariants.id))
    .where(eq(cartItems.userId, userId));
}

export async function upsertCartItem(userId: number, skuId: number, productId: number, qty: number) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(cartItems)
    .where(and(eq(cartItems.userId, userId), eq(cartItems.storeSkuId, skuId), eq(cartItems.isLocked, false))).limit(1);
  if (existing.length > 0) {
    if (qty <= 0) {
      await db.delete(cartItems).where(eq(cartItems.id, existing[0].id));
    } else {
      await db.update(cartItems).set({ quantity: qty }).where(eq(cartItems.id, existing[0].id));
    }
  } else if (qty > 0) {
    await db.insert(cartItems).values({ userId, storeSkuId: skuId, productId, quantity: qty });
  }
}

export async function clearCart(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(cartItems).where(eq(cartItems.userId, userId));
}

export async function softLockCart(userId: number) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db.update(cartItems).set({ isLocked: true, lockedAt: now }).where(eq(cartItems.userId, userId));
}

export async function applySoftLockToSkus(items: { skuId: number; qty: number }[]) {
  const db = await getDb();
  if (!db) return;
  for (const item of items) {
    await db.update(storeSkus)
      .set({ softLockedQty: sql`${storeSkus.softLockedQty} + ${item.qty}` })
      .where(eq(storeSkus.id, item.skuId));
  }
}

export async function releaseSoftLock(items: { skuId: number; qty: number }[]) {
  const db = await getDb();
  if (!db) return;
  for (const item of items) {
    await db.update(storeSkus)
      .set({ softLockedQty: sql`GREATEST(0, ${storeSkus.softLockedQty} - ${item.qty})` })
      .where(eq(storeSkus.id, item.skuId));
  }
}

// ─── Orders ───────────────────────────────────────────────────────────────────
export async function createOrder(data: {
  userId: number; storeId: number; prescriptionId?: number;
  subtotal: string; total: string; promisedSlaMins: number;
  deliveryAddress?: string; flatNumber?: string; buildingId?: number;
  source?: "app" | "whatsapp";
  items: { productId: number; variantId?: number; storeSkuId: number; quantity: number; unitPrice: string; lineTotal: string }[];
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(orders).values({
    userId: data.userId, storeId: data.storeId, prescriptionId: data.prescriptionId,
    subtotal: data.subtotal, total: data.total, promisedSlaMins: data.promisedSlaMins,
    deliveryAddress: data.deliveryAddress, flatNumber: data.flatNumber,
    buildingId: data.buildingId, source: data.source ?? "app",
    status: "created",
  });
  const orderId = (result as any).insertId as number;
  for (const item of data.items) {
    await db.insert(orderItems).values({
      orderId,
      productId: item.productId,
      variantId: item.variantId ?? null,
      storeSkuId: item.storeSkuId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    });
  }
  return orderId;
}

export async function getOrdersByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
}

export async function getOrderById(orderId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return r[0];
}

export async function getOrderItems(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: orderItems.id, orderId: orderItems.orderId, quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice, lineTotal: orderItems.lineTotal,
    productId: products.id, variantId: orderItems.variantId,
    name: products.name, brand: products.brand,
    form: productVariants.form, strength: productVariants.strength,
    packSize: productVariants.packSize, displayLabel: productVariants.displayLabel,
    imageUrl: products.imageUrl,
  }).from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
    .where(eq(orderItems.orderId, orderId));
}

export async function updateOrderStatus(orderId: number, status: typeof orders.$inferSelect["status"]) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = { status };
  if (status === "delivered") updateData.deliveredAt = new Date();
  await db.update(orders).set(updateData).where(eq(orders.id, orderId));
}

export async function updateOrderInvoice(orderId: number, invoiceUrl: string, invoiceKey: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(orders).set({ invoiceUrl, invoiceKey }).where(eq(orders.id, orderId));
}

// ─── Prescriptions ────────────────────────────────────────────────────────────
export async function createPrescription(userId: number, storeId: number | undefined, imageUrl: string, imageKey: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [r] = await db.insert(prescriptions).values({ userId, storeId, imageUrl, imageKey, status: "pending_pharmacist" });
  return (r as any).insertId as number;
}

export async function getPrescriptionsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(prescriptions).where(eq(prescriptions.userId, userId)).orderBy(desc(prescriptions.createdAt));
}

export async function getPrescriptionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(prescriptions).where(eq(prescriptions.id, id)).limit(1);
  return r[0];
}

// ─── Refill Reminders ─────────────────────────────────────────────────────────
export async function getRefillReminders(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db.select({
    id: refillReminders.id, userId: refillReminders.userId,
    avgIntervalDays: refillReminders.avgIntervalDays,
    nextReminderAt: refillReminders.nextReminderAt,
    lastOrderedAt: refillReminders.lastOrderedAt,
    isDismissed: refillReminders.isDismissed,
    productId: products.id, name: products.name, brand: products.brand,
    form: products.form, strength: products.strength, packSize: products.packSize,
    isChronicMedication: products.isChronicMedication, imageUrl: products.imageUrl,
  }).from(refillReminders)
    .innerJoin(products, eq(refillReminders.productId, products.id))
    .where(and(
      eq(refillReminders.userId, userId),
      eq(refillReminders.isDismissed, false),
      lte(refillReminders.nextReminderAt, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))
    ))
    .orderBy(refillReminders.nextReminderAt);
}

export async function dismissRefillReminder(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(refillReminders).set({ isDismissed: true }).where(and(eq(refillReminders.id, id), eq(refillReminders.userId, userId)));
}

export async function upsertRefillReminder(userId: number, productId: number, lastOrderedAt: Date, avgIntervalDays: number) {
  const db = await getDb();
  if (!db) return;
  const nextReminderAt = new Date(lastOrderedAt.getTime() + (avgIntervalDays - 5) * 24 * 60 * 60 * 1000);
  const existing = await db.select().from(refillReminders)
    .where(and(eq(refillReminders.userId, userId), eq(refillReminders.productId, productId))).limit(1);
  if (existing.length > 0) {
    await db.update(refillReminders).set({ lastOrderedAt, avgIntervalDays, nextReminderAt, isDismissed: false })
      .where(eq(refillReminders.id, existing[0].id));
  } else {
    await db.insert(refillReminders).values({ userId, productId, lastOrderedAt, avgIntervalDays, nextReminderAt });
  }
}

// ─── WhatsApp Sessions ────────────────────────────────────────────────────────
export async function getWhatsappSession(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(whatsappSessions).where(eq(whatsappSessions.phone, phone)).limit(1);
  return r[0];
}

export async function upsertWhatsappSession(phone: string, data: { userId?: number; currentFlow?: string; flowState?: string }) {
  const db = await getDb();
  if (!db) return;
  const existing = await getWhatsappSession(phone);
  const now = new Date();
  if (existing) {
    await db.update(whatsappSessions).set({ ...data, lastMessageAt: now }).where(eq(whatsappSessions.phone, phone));
  } else {
    await db.insert(whatsappSessions).values({ phone, ...data, lastMessageAt: now });
  }
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export async function writeAuditLog(userId: number | null, action: string, entityType?: string, entityId?: number, payload?: unknown) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values({
    userId: userId ?? undefined, action, entityType, entityId,
    payload: payload ? JSON.stringify(payload) : undefined,
  });
}

// ─── Refill: compute avg interval from actual order history ───────────────────
export async function computeRefillIntervalFromHistory(userId: number, productId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 30; // fallback
  // Get all delivered orders containing this product, ordered by delivery time
  const rows = await db.select({
    deliveredAt: orders.deliveredAt,
    createdAt: orders.createdAt,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(
      eq(orders.userId, userId),
      eq(orderItems.productId, productId),
      eq(orders.status, "delivered"),
    ))
    .orderBy(orders.createdAt);

  if (rows.length < 2) return 30; // not enough history, use 30-day default

  // Compute average gap between consecutive orders
  const dates = rows.map(r => (r.deliveredAt ?? r.createdAt)!.getTime());
  let totalGap = 0;
  for (let i = 1; i < dates.length; i++) {
    totalGap += (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
  }
  const avg = Math.round(totalGap / (dates.length - 1));
  // Clamp between 7 and 90 days
  return Math.min(90, Math.max(7, avg));
}

// ─── Order items with storeSkuId for reorder ─────────────────────────────────
export async function getOrderItemsForReorder(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: orderItems.id,
    storeSkuId: orderItems.storeSkuId,
    productId: orderItems.productId,
    quantity: orderItems.quantity,
    name: products.name,
  }).from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
}

// ─── WhatsApp Rx upload persistence ──────────────────────────────────────────
export async function createWhatsappPrescription(phone: string, imageUrl: string, imageKey: string) {
  const db = await getDb();
  if (!db) return null;
  // Try to find a linked user via whatsapp session
  const session = await getWhatsappSession(phone);
  const userId = session?.userId ?? null;
  const [r] = await db.insert(prescriptions).values({
    userId: userId ?? 0,
    storeId: undefined,
    imageUrl,
    imageKey,
    status: "pending_pharmacist",
  });
  return (r as any).insertId as number;
}

// ─── Invoice generation (text-based, stored as URL) ──────────────────────────
export async function generateAndStoreInvoice(
  orderId: number,
  storeFn: (key: string, data: Buffer, mime: string) => Promise<{ url: string; key: string }>
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
    ...items.map(i => `  ${i.name} (${i.form ?? ""} ${i.strength ?? ""}) x${i.quantity}  ₹${i.lineTotal}`),
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
  const { url } = await storeFn(key, buffer, "text/plain");
  await updateOrderInvoice(orderId, url, key);
  return url;
}
