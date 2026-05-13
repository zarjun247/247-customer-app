/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import {
  and,
  desc,
  eq,
  gt,
  gte as _gte,
  ilike as _ilike,
  like,
  lt as _lt,
  lte as _lte,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  isPrescriptionExpired,
  markPrescriptionOnFileWithConsent,
} from "./services/prescriptionVault";
import {
  auditLogs as _auditLogs,
  batchLedger,
  batches as _batches,
  buildings,
  cartItems,
  InsertUser,
  orderItems,
  orders,
  otpCodes,
  prescriptions,
  productVariants,
  products,
  refillReminders as _refillReminders,
  rxPriorApprovals,
  doctorConsultRequests as _doctorConsultRequests,
  stockReservations,
  storeSkus,
  stores,
  users,
  whatsappSessions as _whatsappSessions,
} from "../drizzle/schema";
import { createOrderInvoiceSnapshot as _createOrderInvoiceSnapshot } from "./services/invoiceSnapshotService";
import {
  encryptUserPii,
  encryptUserPhone,
} from "./services/customerPiiService";

let _db: ReturnType<typeof drizzle> | null = null;

// eslint-disable-next-line @typescript-eslint/require-await
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
  const encrypted = await encryptUserPii({
    phone: user.phone ?? null,
    email: user.email ?? null,
  });
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const fields = ["name", "loginMethod"] as const;
  for (const f of fields) {
    const v = user[f];
    if (v !== undefined) {
      values[f] = v ?? null;
      updateSet[f] = v ?? null;
    }
  }
  if (user.phone !== undefined) {
    values.phone = encrypted.phone;
    updateSet.phone = encrypted.phone;
  }
  if (user.email !== undefined) {
    values.email = encrypted.email;
    updateSet.email = encrypted.email;
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

/**
 * Get a user by phone number (used for phone/OTP login).
 */
export async function getUserByPhone(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);
  return result[0];
}

/**
 * Upsert a user identified by phone number.
 * Creates the user if they don't exist; updates lastSignedIn if they do.
 * openId is left null for phone-only users.
 */
export async function upsertUserByPhone(
  phone: string,
  extra?: {
    name?: string;
    loginMethod?: string;
  }
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const encryptedPhone = await encryptUserPhone(phone);
  const existing = await getUserByPhone(phone);
  if (existing) {
    await db
      .update(users)
      .set({
        lastSignedIn: new Date(),
        ...(extra?.name ? { name: extra.name } : {}),
      })
      .where(eq(users.id, existing.id));
    return { id: existing.id };
  }
  const result = await db.insert(users).values({
    openId: null, // nullable after migration
    phone: encryptedPhone ?? phone,
    name: extra?.name ?? null,
    loginMethod: extra?.loginMethod ?? "phone",
    lastSignedIn: new Date(),
  });
  const insertId = (result[0] as any).insertId as number;
  return { id: insertId };
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUserProfile(
  userId: number,
  data: {
    name?: string;
    buildingId?: number;
    flatNumber?: string;
    assignedStoreId?: number;
    onboardingComplete?: boolean;
    phone?: string;
    userAddress?: string;
    userLat?: string;
    userLng?: string;
  }
) {
  const db = await getDb();
  if (!db) return;
  const update = { ...data };
  if (update.phone != null) {
    update.phone = (await encryptUserPhone(update.phone)) ?? update.phone;
  }
  await db.update(users).set(update).where(eq(users.id, userId));
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
  const result = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.phone, phone),
        eq(otpCodes.code, code),
        eq(otpCodes.isUsed, false),
        gt(otpCodes.expiresAt, now)
      )
    )
    .limit(1);
  if (result.length === 0) return false;
  await db
    .update(otpCodes)
    .set({ isUsed: true })
    .where(eq(otpCodes.id, result[0].id));
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
  const r = await db
    .select()
    .from(buildings)
    .where(eq(buildings.id, id))
    .limit(1);
  return r[0];
}

export async function getStoreById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  return r[0];
}

function canonicalAvailabilitySql() {
  return sql<number>`COALESCE((SELECT SUM(bl.qtyOnHand - bl.qtyReserved - bl.qtyQuarantined - bl.qtyExpired) FROM ${batchLedger} bl WHERE bl.productId = ${storeSkus.productId} AND bl.storeId = ${storeSkus.storeId} AND ((${storeSkus.variantId} IS NULL AND bl.variantId IS NULL) OR bl.variantId = ${storeSkus.variantId}) AND bl.status = 'active'), ${storeSkus.stockQty}) - COALESCE((SELECT SUM(COALESCE(sr.qty, sr.qtyReserved)) FROM ${stockReservations} sr WHERE sr.productId = ${storeSkus.productId} AND sr.storeId = ${storeSkus.storeId} AND ((${storeSkus.variantId} IS NULL AND sr.variantId IS NULL) OR sr.variantId = ${storeSkus.variantId}) AND sr.status = 'active' AND (sr.expiresAt IS NULL OR sr.expiresAt > NOW())), 0) - ${storeSkus.softLockedQty}`;
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
  const conditions = [
    eq(storeSkus.storeId, storeId),
    eq(storeSkus.isActive, true),
  ];
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        like(products.name, term),
        like(products.brand, term),
        like(products.genericName, term),
        like(products.companyName, term),
        like(products.searchableTokens, term)
      )!
    );
  }
  if (category && category !== "all") {
    conditions.push(eq(products.category, category as any));
  }
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
      imageHeroUrl: products.imageHeroUrl,
      imageSideUrl: products.imageSideUrl,
      imageRearUrl: products.imageRearUrl,
      imageLabelUrl: products.imageLabelUrl,
      imageNutritionUrl: products.imageNutritionUrl,
      imageApprovalStatus: products.imageApprovalStatus,
      gstRate: products.gstRate,
      mrp: storeSkus.mrp,
      sellingPrice: storeSkus.sellingPrice,
      stockQty: storeSkus.stockQty,
      softLockedQty: storeSkus.softLockedQty,
      availableQty: canonicalAvailabilitySql(),
    })
    .from(storeSkus)
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
  const r = await db
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
      imageUrl: products.imageUrl,
      imageHeroUrl: products.imageHeroUrl,
      imageSideUrl: products.imageSideUrl,
      imageRearUrl: products.imageRearUrl,
      imageLabelUrl: products.imageLabelUrl,
      imageNutritionUrl: products.imageNutritionUrl,
      gstRate: products.gstRate,
      mrp: storeSkus.mrp,
      sellingPrice: storeSkus.sellingPrice,
      stockQty: storeSkus.stockQty,
      softLockedQty: storeSkus.softLockedQty,
      availableQty: canonicalAvailabilitySql(),
      storeId: storeSkus.storeId,
      isActive: storeSkus.isActive,
    })
    .from(storeSkus)
    .innerJoin(products, eq(storeSkus.productId, products.id))
    .leftJoin(productVariants, eq(storeSkus.variantId, productVariants.id))
    .where(eq(storeSkus.id, skuId))
    .limit(1);
  return r[0];
}

// ─── Cart ─────────────────────────────────────────────────────────────────────
export async function getCart(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: cartItems.id,
      userId: cartItems.userId,
      quantity: cartItems.quantity,
      isLocked: cartItems.isLocked,
      lockedAt: cartItems.lockedAt,
      skuId: storeSkus.id,
      productId: products.id,
      variantId: storeSkus.variantId,
      name: products.name,
      brand: products.brand,
      form: productVariants.form,
      strength: productVariants.strength,
      packSize: productVariants.packSize,
      displayLabel: productVariants.displayLabel,
      requiresPrescription: products.requiresPrescription,
      imageUrl: products.imageUrl,
      mrp: storeSkus.mrp,
      sellingPrice: storeSkus.sellingPrice,
      stockQty: storeSkus.stockQty,
      softLockedQty: storeSkus.softLockedQty,
      storeId: storeSkus.storeId,
      isActive: storeSkus.isActive,
      isChronicMedication: products.isChronicMedication,
    })
    .from(cartItems)
    .innerJoin(storeSkus, eq(cartItems.storeSkuId, storeSkus.id))
    .innerJoin(products, eq(storeSkus.productId, products.id))
    .leftJoin(productVariants, eq(storeSkus.variantId, productVariants.id))
    .where(eq(cartItems.userId, userId));
}

export async function upsertCartItem(
  userId: number,
  skuId: number,
  productId: number,
  qty: number
) {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select()
    .from(cartItems)
    .where(
      and(
        eq(cartItems.userId, userId),
        eq(cartItems.storeSkuId, skuId),
        eq(cartItems.isLocked, false)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    if (qty <= 0) {
      await db.delete(cartItems).where(eq(cartItems.id, existing[0].id));
    } else {
      await db
        .update(cartItems)
        .set({ quantity: qty })
        .where(eq(cartItems.id, existing[0].id));
    }
  } else if (qty > 0) {
    await db
      .insert(cartItems)
      .values({ userId, storeSkuId: skuId, productId, quantity: qty });
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
  await db
    .update(cartItems)
    .set({ isLocked: true, lockedAt: now })
    .where(eq(cartItems.userId, userId));
}

export async function releaseCartLock(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(cartItems)
    .set({ isLocked: false, lockedAt: null })
    .where(and(eq(cartItems.userId, userId), eq(cartItems.isLocked, true)));
}

export async function applySoftLockToSkus(
  items: { skuId: number; qty: number }[]
) {
  const db = await getDb();
  if (!db) return;
  for (const item of items) {
    await db
      .update(storeSkus)
      .set({ softLockedQty: sql`${storeSkus.softLockedQty} + ${item.qty}` })
      .where(eq(storeSkus.id, item.skuId));
  }
}

export async function releaseSoftLock(items: { skuId: number; qty: number }[]) {
  const db = await getDb();
  if (!db) return;
  for (const item of items) {
    await db
      .update(storeSkus)
      .set({
        softLockedQty: sql`GREATEST(0, ${storeSkus.softLockedQty} - ${item.qty})`,
      })
      .where(eq(storeSkus.id, item.skuId));
  }
}

// ─── Orders ───────────────────────────────────────────────────────────────────
export async function createOrder(data: {
  userId: number;
  storeId: number;
  prescriptionId?: number;
  subtotal: string;
  total: string;
  promisedSlaMins: number;
  deliveryAddress?: string;
  flatNumber?: string;
  buildingId?: number;
  source?: "app" | "whatsapp";
  items: {
    productId: number;
    variantId?: number;
    storeSkuId: number;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }[];
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(orders).values({
    userId: data.userId,
    storeId: data.storeId,
    prescriptionId: data.prescriptionId,
    subtotal: data.subtotal,
    total: data.total,
    promisedSlaMins: data.promisedSlaMins,
    deliveryAddress: data.deliveryAddress,
    flatNumber: data.flatNumber,
    buildingId: data.buildingId,
    source: data.source ?? "app",
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
  return db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));
}
export async function getAllOrders(opts?: { status?: string; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (opts?.status) conditions.push(eq(orders.status, opts.status as any));
  const q = db.select().from(orders);
  if (conditions.length > 0) q.where(and(...conditions));
  return q.orderBy(desc(orders.createdAt)).limit(opts?.limit ?? 200);
}

export async function getOrderById(orderId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return r[0];
}

export async function getOrderItems(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      lineTotal: orderItems.lineTotal,
      productId: products.id,
      variantId: orderItems.variantId,
      name: products.name,
      brand: products.brand,
      form: productVariants.form,
      strength: productVariants.strength,
      packSize: productVariants.packSize,
      displayLabel: productVariants.displayLabel,
      imageUrl: products.imageUrl,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
    .where(eq(orderItems.orderId, orderId));
}

export async function updateOrderStatus(
  orderId: number,
  status: (typeof orders.$inferSelect)["status"],
  opts?: { reason?: string; changedBy?: number }
) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = {
    status,
    statusChangedAt: new Date(),
    statusChangedBy: opts?.changedBy ?? null,
    statusReason: opts?.reason ?? null,
  };
  if (status === "delivered") updateData.deliveredAt = new Date();
  await db.update(orders).set(updateData).where(eq(orders.id, orderId));
}

export async function updateOrderInvoice(
  orderId: number,
  invoiceUrl: string,
  invoiceKey: string
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(orders)
    .set({ invoiceUrl, invoiceKey })
    .where(eq(orders.id, orderId));
}

// ─── Prescriptions ────────────────────────────────────────────────────────────
export async function createPrescription(
  userId: number,
  storeId: number | undefined,
  imageUrl: string,
  imageKey: string,
  metadata?: {
    doctorName?: string | null;
    doctorRegNo?: string | null;
    clinicName?: string | null;
    prescriptionDate?: Date | null;
    validUntil?: Date | null;
    patientName?: string | null;
    linkedProductIds?: number[] | null;
    source?: "upload" | "whatsapp" | "doctor" | "pharmacist" | "manual";
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [r] = await db.insert(prescriptions).values({
    userId,
    storeId,
    imageUrl,
    imageKey,
    status: "pending_pharmacist",
    doctorName: metadata?.doctorName ?? undefined,
    doctorReg: metadata?.doctorRegNo ?? undefined,
    doctorRegNo: metadata?.doctorRegNo ?? undefined,
    clinicName: metadata?.clinicName ?? undefined,
    prescribedDate: metadata?.prescriptionDate ?? undefined,
    prescriptionDate: metadata?.prescriptionDate ?? undefined,
    expiryDate: metadata?.validUntil ?? undefined,
    validUntil: metadata?.validUntil ?? undefined,
    patientName: metadata?.patientName ?? undefined,
    linkedProductIds: metadata?.linkedProductIds
      ? JSON.stringify(metadata.linkedProductIds)
      : undefined,
    source: metadata?.source ?? "upload",
  });
  return (r as any).insertId as number;
}

export async function getPrescriptionsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.userId, userId))
    .orderBy(desc(prescriptions.createdAt));
}

export async function getPrescriptionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const r = await db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.id, id))
    .limit(1);
  return r[0];
}

// ─── Refill Reminders ─────────────────────────────────────────────────────────
// ─── Prescription Vault / Lane helpers ──────────────────────────────────────
/** Returns readable vault prescriptions for a user; revoked/expired rows are returned with activeOnFile=false. */
export async function getPrescriptionVault(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.userId, userId),
        or(
          eq(prescriptions.status, "on_file"),
          eq(prescriptions.status, "approved")
        )
      )
    )
    .orderBy(desc(prescriptions.createdAt));
  return rows.map((rx: any) => ({
    ...rx,
    activeOnFile:
      rx.status === "on_file" &&
      !rx.consentRevokedAt &&
      !isPrescriptionExpired(rx),
    consentGoverned: Boolean(
      rx.consentGivenAt || rx.consentSource || rx.onFileMarkedAt
    ),
  }));
}
/** Marks a prescription as on-file (vault) with explicit consent governance. */
export async function markPrescriptionOnFile(
  rxId: number,
  userId: number,
  opts?: {
    actorId?: number;
    actorRole?: string;
    consentSource?: "app" | "whatsapp" | "pharmacist" | "doctor" | "manual";
  }
) {
  const db = await getDb();
  if (!db) return;
  await markPrescriptionOnFileWithConsent(db, {
    prescriptionId: rxId,
    customerId: userId,
    actorId: opts?.actorId ?? userId,
    actorRole: opts?.actorRole ?? "customer",
    consentSource: opts?.consentSource ?? "app",
  });
}
/** Creates a prior approval record for a prescription */
export async function createPriorApproval(
  rxId: number,
  pharmacistId: number,
  validUntil: Date,
  linkedProductIds: number[],
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [r] = await db.insert(rxPriorApprovals).values({
    rxId,
    approvedByPharmacistId: pharmacistId,
    validUntil,
    linkedProductIds: JSON.stringify(linkedProductIds),
    notes,
  });
  return (r as any).insertId as number;
}
/** Gets valid prior approvals for a user */
export async function getActivePriorApprovals(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: rxPriorApprovals.id,
      rxId: rxPriorApprovals.rxId,
      validUntil: rxPriorApprovals.validUntil,
      linkedProductIds: rxPriorApprovals.linkedProductIds,
      notes: rxPriorApprovals.notes,
      createdAt: rxPriorApprovals.createdAt,
    })
    .from(rxPriorApprovals)
    .innerJoin(prescriptions, eq(rxPriorApprovals.rxId, prescriptions.id))
    .where(
      and(
        eq(prescriptions.userId, userId),
        gt(rxPriorApprovals.validUntil, new Date())
      )
    )
    .orderBy(desc(rxPriorApprovals.createdAt));
}
export * from "./db-extended";
