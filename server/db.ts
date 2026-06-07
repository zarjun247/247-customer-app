import type { ResultSetHeader } from "mysql2";
import {
  and,
  desc,
  eq,
  gt,
  gte as _gte,
  ilike as _ilike,
  type InferSelectModel,
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
  InsertUser,
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
  computePhoneHash,
} from "./services/customerPiiService";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(): Promise<ReturnType<typeof drizzle> | null> {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return Promise.resolve(_db);
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
    const hash = user.phone ? computePhoneHash(user.phone) : null;
    if (hash) {
      (values as Record<string, unknown>).phoneHash = hash;
      updateSet.phoneHash = hash;
    }
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
 * When PII encryption is active, phone values are stored as non-deterministic
 * AES-GCM ciphertexts. In that case we look up by phoneHash (HMAC-SHA256)
 * instead of the encrypted value; falls back to direct eq() in passthrough mode.
 */
export async function getUserByPhone(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  const hash = computePhoneHash(phone);
  if (hash) {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.phoneHash, hash))
      .limit(1);
    return result[0];
  }
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
 *
 * P0-2 fix: Uses INSERT ... ON DUPLICATE KEY UPDATE to make registration
 * atomic. The prior SELECT-then-INSERT pattern had a TOCTOU race where two
 * concurrent registrations for the same phone could both see no existing user
 * and both attempt INSERT, causing a duplicate-user or unique-constraint error.
 *
 * The phoneHash column has a UNIQUE index (migration 0045). MySQL's
 * ON DUPLICATE KEY UPDATE atomically handles the race: only one INSERT wins;
 * the other becomes an UPDATE. We then SELECT the canonical row to return
 * the correct id in both the insert and update cases.
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
  const phoneHash = computePhoneHash(phone);
  const now = new Date();
  const insertValues: InsertUser = {
    openId: null,
    phone: encryptedPhone ?? phone,
    name: extra?.name ?? null,
    loginMethod: extra?.loginMethod ?? "phone",
    lastSignedIn: now,
    ...(phoneHash ? { phoneHash } : {}),
  };
  // ON DUPLICATE KEY UPDATE on the phoneHash unique index:
  // - If no row exists: INSERT succeeds.
  // - If row exists: UPDATE fires, preserving the existing row id.
  const updateSet: InsertUser = {
    lastSignedIn: now,
    ...(extra?.name ? { name: extra.name } : {}),
    // Backfill phoneHash if it was missing on the existing row.
    ...(phoneHash
      ? {
          phoneHash:
            sql`COALESCE(${users.phoneHash}, ${phoneHash})` as unknown as string,
        }
      : {}),
  };
  await db
    .insert(users)
    .values(insertValues)
    .onDuplicateKeyUpdate({ set: updateSet });
  // Fetch the canonical row to return the correct id (works for both insert and update).
  const row = await getUserByPhone(phone);
  if (!row) throw new Error("upsertUserByPhone: row not found after upsert");
  return { id: row.id };
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

/**
 * verifyOtp — atomic OTP consumption.
 *
 * Wraps SELECT + UPDATE in a single DB transaction with SELECT ... FOR UPDATE
 * to prevent replay attacks. Concurrent verification attempts for the same OTP
 * row will serialize at the row lock; only the first transaction to acquire the
 * lock and find isUsed=false will succeed. All subsequent attempts see isUsed=true
 * and return false, eliminating the TOCTOU race in the prior implementation.
 */
export async function verifyOtp(phone: string, code: string) {
  const db = await getDb();
  if (!db) return false;
  const now = new Date();
  return db.transaction(async tx => {
    // SELECT ... FOR UPDATE acquires a row-level exclusive lock, serializing
    // concurrent verification attempts for the same OTP row.
    const result = await tx
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
      .limit(1)
      .for("update");
    if (result.length === 0) return false;
    // Mark consumed atomically within the same transaction.
    await tx
      .update(otpCodes)
      .set({ isUsed: true })
      .where(eq(otpCodes.id, result[0].id));
    return true;
  });
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
    conditions.push(
      eq(
        products.category,
        category as InferSelectModel<typeof products>["category"]
      )
    );
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

// ─── Cart & Orders ────────────────────────────────────────────────────────────
export {
  getCart,
  upsertCartItem,
  clearCart,
  softLockCart,
  releaseCartLock,
  applySoftLockToSkus,
  releaseSoftLock,
  createOrder,
  getOrdersByUser,
  getAllOrders,
  getOrderById,
  getOrderItems,
  updateOrderStatus,
  updateOrderInvoice,
} from "./db-cart-orders";

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
  const [r] = (await db.insert(prescriptions).values({
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
  })) as unknown as [ResultSetHeader];
  return r.insertId;
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
  return rows.map((rx: (typeof rows)[number]) => ({
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
  const [r] = (await db.insert(rxPriorApprovals).values({
    rxId,
    approvedByPharmacistId: pharmacistId,
    validUntil,
    linkedProductIds: JSON.stringify(linkedProductIds),
    notes,
  })) as unknown as [ResultSetHeader];
  return r.insertId;
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
