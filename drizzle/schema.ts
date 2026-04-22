import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  bigint,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Building/flat identity for routing
  buildingId: int("buildingId"),
  flatNumber: varchar("flatNumber", { length: 20 }),
  assignedStoreId: int("assignedStoreId"),
  onboardingComplete: boolean("onboardingComplete").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ─── Buildings ────────────────────────────────────────────────────────────────
export const buildings = mysqlTable("buildings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  address: text("address"),
  pincode: varchar("pincode", { length: 10 }),
  city: varchar("city", { length: 100 }),
  primaryStoreId: int("primaryStoreId"),
  fallbackStoreId: int("fallbackStoreId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Stores (Pharmacy Nodes) ──────────────────────────────────────────────────
export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  type: mysqlEnum("type", ["in_building", "cluster_hub"]).default("in_building").notNull(),
  address: text("address"),
  pincode: varchar("pincode", { length: 10 }),
  phone: varchar("phone", { length: 20 }),
  isActive: boolean("isActive").default(true).notNull(),
  slaMins: int("slaMins").default(20).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Products (Global Catalog) ────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 300 }).notNull(),
  brand: varchar("brand", { length: 200 }),
  genericName: varchar("genericName", { length: 300 }),
  form: varchar("form", { length: 100 }),        // tablet, syrup, injection
  strength: varchar("strength", { length: 100 }), // 500mg, 10ml
  packSize: varchar("packSize", { length: 100 }),
  schedule: mysqlEnum("schedule", ["OTC", "H", "H1", "X"]).default("OTC").notNull(),
  requiresPrescription: boolean("requiresPrescription").default(false).notNull(),
  isChronicMedication: boolean("isChronicMedication").default(false).notNull(),
  hsnCode: varchar("hsnCode", { length: 20 }),
  barcode: varchar("barcode", { length: 100 }),
  imageUrl: text("imageUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Store SKUs (Node-specific catalog) ───────────────────────────────────────
export const storeSkus = mysqlTable("store_skus", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  productId: int("productId").notNull(),
  mrp: decimal("mrp", { precision: 10, scale: 2 }).notNull(),
  sellingPrice: decimal("sellingPrice", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  stockQty: int("stockQty").default(0).notNull(),
  softLockedQty: int("softLockedQty").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Batches (FEFO tracking) ──────────────────────────────────────────────────
export const batches = mysqlTable("batches", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  productId: int("productId").notNull(),
  batchNumber: varchar("batchNumber", { length: 100 }).notNull(),
  expiryDate: timestamp("expiryDate").notNull(),
  quantity: int("quantity").default(0).notNull(),
  status: mysqlEnum("status", ["active", "quarantined", "depleted", "expired"])
    .default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Prescriptions ────────────────────────────────────────────────────────────
export const prescriptions = mysqlTable("prescriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  storeId: int("storeId"),
  imageUrl: text("imageUrl").notNull(),
  imageKey: varchar("imageKey", { length: 500 }),
  status: mysqlEnum("status", [
    "pending_ocr",
    "pending_pharmacist",
    "approved",
    "rejected",
  ]).default("pending_ocr").notNull(),
  ocrText: text("ocrText"),
  pharmacistNote: text("pharmacistNote"),
  pharmacistId: int("pharmacistId"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Orders ───────────────────────────────────────────────────────────────────
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  storeId: int("storeId").notNull(),
  prescriptionId: int("prescriptionId"),
  status: mysqlEnum("status", [
    "created",
    "pharmacist_reviewing",
    "picking",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ]).default("created").notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  promisedSlaMins: int("promisedSlaMins").default(20).notNull(),
  deliveryAddress: text("deliveryAddress"),
  flatNumber: varchar("flatNumber", { length: 20 }),
  buildingId: int("buildingId"),
  source: mysqlEnum("source", ["app", "whatsapp"]).default("app").notNull(),
  invoiceUrl: text("invoiceUrl"),
  invoiceKey: varchar("invoiceKey", { length: 500 }),
  placedAt: timestamp("placedAt").defaultNow().notNull(),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Order Items ──────────────────────────────────────────────────────────────
export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId").notNull(),
  storeSkuId: int("storeSkuId").notNull(),
  allocatedBatchId: int("allocatedBatchId"),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("lineTotal", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Cart Items (soft-locked at checkout) ─────────────────────────────────────
export const cartItems = mysqlTable("cart_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  storeSkuId: int("storeSkuId").notNull(),
  quantity: int("quantity").notNull(),
  isLocked: boolean("isLocked").default(false).notNull(),
  lockedAt: timestamp("lockedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Refill Reminders ─────────────────────────────────────────────────────────
export const refillReminders = mysqlTable("refill_reminders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  lastOrderedAt: timestamp("lastOrderedAt").notNull(),
  avgIntervalDays: int("avgIntervalDays").default(30).notNull(),
  nextReminderAt: timestamp("nextReminderAt").notNull(),
  isDismissed: boolean("isDismissed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── WhatsApp Sessions ────────────────────────────────────────────────────────
export const whatsappSessions = mysqlTable("whatsapp_sessions", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull(),
  userId: int("userId"),
  currentFlow: varchar("currentFlow", { length: 50 }),
  flowState: text("flowState"),   // JSON blob for conversation state
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── OTP Codes ────────────────────────────────────────────────────────────────
export const otpCodes = mysqlTable("otp_codes", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  isUsed: boolean("isUsed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditLogs = mysqlTable("audit_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId"),
  action: varchar("action", { length: 200 }).notNull(),
  entityType: varchar("entityType", { length: 100 }),
  entityId: int("entityId"),
  payload: text("payload"),   // JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Building = typeof buildings.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type Product = typeof products.$inferSelect;
export type StoreSku = typeof storeSkus.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type Prescription = typeof prescriptions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type RefillReminder = typeof refillReminders.$inferSelect;
export type WhatsappSession = typeof whatsappSessions.$inferSelect;
export type OtpCode = typeof otpCodes.$inferSelect;
