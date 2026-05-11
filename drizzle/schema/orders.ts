import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    storeId: int("storeId").notNull(),
    prescriptionId: int("prescriptionId"),
    status: mysqlEnum("status", [
      "draft",
      "awaiting_prescription",
      "awaiting_pharmacist_review",
      "clarification_needed",
      "rejected",
      "awaiting_allocation",
      "backorder_review",
      "reserved",
      "picking",
      "packed",
      "assigned_to_rider",
      "out_for_delivery",
      "delivery_exception",
      "returned",
      "delivered",
      "closed",
      "cancelled",
      // legacy compat
      "created",
      "pharmacist_reviewing",
      "return_to_stock",
    ])
      .default("draft")
      .notNull(),
    // Rx lane for this order
    rxLane: mysqlEnum("rxLane", [
      "otc",
      "digital",
      "on_file",
      "fallback",
      "doctor_consult",
    ])
      .default("otc")
      .notNull(),
    rxGateCleared: boolean("rxGateCleared").default(false).notNull(),
    rxGateClearedAt: timestamp("rxGateClearedAt"),
    rxGateClearedBy: int("rxGateClearedBy"), // pharmacistId who cleared the gate
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),
    promisedSlaMins: int("promisedSlaMins").default(20).notNull(),
    deliveryAddress: text("deliveryAddress"),
    flatNumber: varchar("flatNumber", { length: 20 }),
    buildingId: int("buildingId"),
    source: mysqlEnum("source", ["app", "whatsapp"]).default("app").notNull(),
    statusReason: varchar("statusReason", { length: 500 }),
    statusChangedBy: int("statusChangedBy"),
    statusChangedAt: timestamp("statusChangedAt"),
    invoiceUrl: text("invoiceUrl"),
    invoiceKey: varchar("invoiceKey", { length: 500 }),
    // Rider assignment
    riderId: int("riderId"),
    placedAt: timestamp("placedAt").defaultNow().notNull(),
    deliveredAt: timestamp("deliveredAt"),
    cancelledAt: timestamp("cancelledAt"),
    cancellationReason: text("cancellationReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idxOrdersStoreStatusCreated: index("idx_orders_store_status_created").on(
      t.storeId,
      t.status,
      t.createdAt
    ),
    idxOrdersUserStatusCreated: index("idx_orders_user_status_created").on(
      t.userId,
      t.status,
      t.createdAt
    ),
    idxOrdersStoreCreated: index("idx_orders_store_created").on(
      t.storeId,
      t.createdAt
    ),
    idxOrdersPrescription: index("idx_orders_prescription").on(
      t.prescriptionId
    ),
  })
);

// ─── Order Items ──────────────────────────────────────────────────────────────
export const orderItems = mysqlTable(
  "order_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull(),
    productId: int("productId").notNull(),
    variantId: int("variantId"),
    storeSkuId: int("storeSkuId").notNull(),
    allocatedBatchId: int("allocatedBatchId"),
    quantity: int("quantity").notNull(),
    unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
    lineTotal: decimal("lineTotal", { precision: 10, scale: 2 }).notNull(),
    requiresPrescription: boolean("requiresPrescription")
      .default(false)
      .notNull(),
    rxGateCleared: boolean("rxGateCleared").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    idxOrderItemsOrder: index("idx_order_items_order").on(t.orderId),
    idxOrderItemsProduct: index("idx_order_items_product").on(t.productId),
    idxOrderItemsSku: index("idx_order_items_sku").on(t.storeSkuId),
  })
);

// ─── Cart Items ───────────────────────────────────────────────────────────────
export const cartItems = mysqlTable("cart_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  variantId: int("variantId"),
  storeSkuId: int("storeSkuId").notNull(),
  quantity: int("quantity").notNull(),
  isLocked: boolean("isLocked").default(false).notNull(),
  lockedAt: timestamp("lockedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── SLA Events ───────────────────────────────────────────────────────────────
export const slaEvents = mysqlTable("sla_events", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  storeId: int("storeId").notNull(),
  slaStartedAt: timestamp("slaStartedAt").notNull(),
  promisedSlaMins: int("promisedSlaMins").notNull(),
  slaDeadline: timestamp("slaDeadline").notNull(),
  deliveredAt: timestamp("deliveredAt"),
  breached: boolean("breached").default(false).notNull(),
  breachDetectedAt: timestamp("breachDetectedAt"),
  breachAlertSent: boolean("breachAlertSent").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type SlaEvent = typeof slaEvents.$inferSelect;
