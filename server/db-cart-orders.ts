import type { ResultSetHeader } from "mysql2";
import { and, desc, eq, type InferSelectModel, sql } from "drizzle-orm";
import {
  cartItems,
  orderItems,
  orders,
  productVariants,
  products,
  storeSkus,
} from "../drizzle/schema";
import { getDb } from "./db";

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
  // Wrap order header + all line items in a single transaction so a partial failure
  // (e.g. DB error on item N) cannot leave a ghost order with no items.
  return db.transaction(async tx => {
    const [result] = (await tx.insert(orders).values({
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
    })) as unknown as [ResultSetHeader];
    const orderId = result.insertId;
    for (const item of data.items) {
      await tx.insert(orderItems).values({
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
  });
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
  if (opts?.status)
    conditions.push(
      eq(
        orders.status,
        opts.status as InferSelectModel<typeof orders>["status"]
      )
    );
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

type OrderStatus = (typeof orders.$inferSelect)["status"];

/**
 * Valid FSM transitions for order status.
 * A transition not listed here is rejected with an error.
 * Use opts.force = true to bypass FSM validation for admin/system corrections.
 */
const ORDER_FSM: Record<OrderStatus, ReadonlyArray<OrderStatus>> = {
  draft: [
    "awaiting_prescription",
    "awaiting_pharmacist_review",
    "awaiting_allocation",
    "reserved",
    "created",
    "cancelled",
  ],
  awaiting_prescription: [
    "awaiting_pharmacist_review",
    "awaiting_allocation",
    "cancelled",
  ],
  awaiting_pharmacist_review: [
    "clarification_needed",
    "rejected",
    "awaiting_allocation",
    "reserved",
    "pharmacist_reviewing",
    "cancelled",
  ],
  pharmacist_reviewing: [
    "clarification_needed",
    "rejected",
    "awaiting_allocation",
    "reserved",
    "cancelled",
  ],
  clarification_needed: [
    "awaiting_pharmacist_review",
    "pharmacist_reviewing",
    "cancelled",
  ],
  rejected: ["cancelled"],
  awaiting_allocation: ["backorder_review", "reserved", "cancelled"],
  backorder_review: ["awaiting_allocation", "reserved", "cancelled"],
  reserved: ["picking", "cancelled"],
  picking: ["packed", "cancelled"],
  packed: ["assigned_to_rider", "cancelled"],
  assigned_to_rider: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "delivery_exception", "returned"],
  delivery_exception: ["out_for_delivery", "returned", "cancelled"],
  returned: ["return_to_stock", "closed"],
  return_to_stock: ["closed"],
  delivered: ["closed"],
  closed: [],
  cancelled: [],
  // Legacy compat statuses
  created: [
    "pharmacist_reviewing",
    "picking",
    "awaiting_allocation",
    "reserved",
    "cancelled",
  ],
};

export async function updateOrderStatus(
  orderId: number,
  status: OrderStatus,
  opts?: { reason?: string; changedBy?: number; force?: boolean }
) {
  const db = await getDb();
  if (!db) return;

  // FSM validation: check that the transition is allowed unless force=true.
  if (!opts?.force) {
    const [current] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (current) {
      const allowed = ORDER_FSM[current.status] ?? [];
      if (!allowed.includes(status)) {
        throw new Error(
          `Invalid order status transition: ${current.status} → ${status} (orderId=${orderId})`
        );
      }
    }
  }

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
