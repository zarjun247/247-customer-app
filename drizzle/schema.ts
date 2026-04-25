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
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", [
    "user",
    "admin",
    "pharmacist",
    "store_manager",
    "inventory_operator",
    "delivery_operator",
    "auditor",
  ]).default("user").notNull(),
  // Building/flat identity for routing
  buildingId: int("buildingId"),
  flatNumber: varchar("flatNumber", { length: 20 }),
  assignedStoreId: int("assignedStoreId"),
  onboardingComplete: boolean("onboardingComplete").default(false).notNull(),
  // Free-form address (when user types address instead of selecting a building)
  userAddress: text("userAddress"),
  userLat: decimal("userLat", { precision: 10, scale: 8 }),
  userLng: decimal("userLng", { precision: 11, scale: 8 }),
  // Staff assignment
  staffStoreId: int("staffStoreId"),  // which store this staff member operates at
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ─── Buildings ────────────────────────────────────────────────────────────────
export const buildings = mysqlTable("buildings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  address: text("address"),
  addressLine1: varchar("addressLine1", { length: 300 }),
  landmark: varchar("landmark", { length: 200 }),
  pincode: varchar("pincode", { length: 10 }),
  city: varchar("city", { length: 100 }),
  lat: decimal("lat", { precision: 10, scale: 8 }),
  lng: decimal("lng", { precision: 11, scale: 8 }),
  primaryStoreId: int("primaryStoreId"),   // assigned serving pharmacy
  fallbackStoreId: int("fallbackStoreId"), // pincode-level fallback
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
  lat: decimal("lat", { precision: 10, scale: 8 }),
  lng: decimal("lng", { precision: 11, scale: 8 }),
  serviceRadius: int("serviceRadius").default(3000).notNull(),
  openingHours: text("openingHours"),
  priority: int("priority").default(10).notNull(),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Products (Global Catalog) ────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 300 }).notNull(),
  brand: varchar("brand", { length: 200 }),
  genericName: varchar("genericName", { length: 300 }),
  form: varchar("form", { length: 100 }),
  strength: varchar("strength", { length: 100 }),
  packSize: varchar("packSize", { length: 100 }),
  schedule: mysqlEnum("schedule", ["OTC", "H", "H1", "X"]).default("OTC").notNull(),
  requiresPrescription: boolean("requiresPrescription").default(false).notNull(),
  isChronicMedication: boolean("isChronicMedication").default(false).notNull(),
  category: mysqlEnum("category", ["medicine", "devices", "baby", "nutrition", "fmcg", "wellness"]).default("medicine").notNull(),
  companyName: varchar("companyName", { length: 200 }),
  companyCode: varchar("companyCode", { length: 20 }),
  hsnCode: varchar("hsnCode", { length: 20 }),
  barcode: varchar("barcode", { length: 100 }),
  imageUrl: text("imageUrl"),
  imageApprovalStatus: mysqlEnum("imageApprovalStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  imageApprovedAt: timestamp("imageApprovedAt"),
  imageApprovedBy: int("imageApprovedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Product Variants ─────────────────────────────────────────────────────────
export const productVariants = mysqlTable("product_variants", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  strength: varchar("strength", { length: 100 }),
  packSize: varchar("packSize", { length: 100 }),
  form: varchar("form", { length: 100 }),
  unit: varchar("unit", { length: 20 }),
  displayLabel: varchar("displayLabel", { length: 200 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Store SKUs ───────────────────────────────────────────────────────────────
export const storeSkus = mysqlTable("store_skus", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  productId: int("productId").notNull(),
  variantId: int("variantId"),
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
  variantId: int("variantId"),
  batchNumber: varchar("batchNumber", { length: 100 }).notNull(),
  expiryDate: timestamp("expiryDate").notNull(),
  quantity: int("quantity").default(0).notNull(),
  status: mysqlEnum("status", ["active", "quarantined", "depleted", "expired"])
    .default("active").notNull(),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }),
  supplierId: int("supplierId"),  // FK → vendors.id
  grnId: int("grnId"),           // FK → grn_records.id
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
    "quick_verify",
    "approved",
    "rejected",
    "additional_verification",
    "on_file",
  ]).default("pending_ocr").notNull(),
  // Rx lane classification
  lane: mysqlEnum("lane", ["otc", "digital", "on_file", "fallback"]).default("digital").notNull(),
  // Doctor / prescription metadata
  doctorName: varchar("doctorName", { length: 200 }),
  doctorReg: varchar("doctorReg", { length: 100 }),  // MCI/state registration number
  prescribedDate: timestamp("prescribedDate"),
  expiryDate: timestamp("expiryDate"),               // Rx valid until (typically 6 months)
  // Linked products (JSON array of productIds extracted from Rx)
  linkedProductIds: text("linkedProductIds"),
  // Patient note (e.g. "chronic patient, 3-month supply")
  patientNote: text("patientNote"),
  // Prior approval reference
  priorApprovalId: int("priorApprovalId"),
  // OCR and pharmacist review
  ocrText: text("ocrText"),
  pharmacistNote: text("pharmacistNote"),
  pharmacistId: int("pharmacistId"),
  reviewedAt: timestamp("reviewedAt"),
  // Dispensing record
  dispensingPharmacistId: int("dispensingPharmacistId"),
  dispensedAt: timestamp("dispensedAt"),
  // Retention flag (5-year regulatory requirement)
  retainUntil: timestamp("retainUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Rx Prior Approvals ───────────────────────────────────────────────────────
export const rxPriorApprovals = mysqlTable("rx_prior_approvals", {
  id: int("id").autoincrement().primaryKey(),
  rxId: int("rxId").notNull(),                          // FK → prescriptions.id
  approvedByPharmacistId: int("approvedByPharmacistId").notNull(),
  validUntil: timestamp("validUntil").notNull(),
  linkedProductIds: text("linkedProductIds"),           // JSON array of productIds
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Rx Compliance Log ────────────────────────────────────────────────────────
export const rxComplianceLog = mysqlTable("rx_compliance_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  rxId: int("rxId").notNull(),
  orderId: int("orderId"),
  pharmacistId: int("pharmacistId").notNull(),
  action: mysqlEnum("action", [
    "received",
    "ocr_complete",
    "quick_verify",
    "manual_review",
    "approved",
    "rejected",
    "dispensed",
    "prior_approval_granted",
    "fallback_applied",
  ]).notNull(),
  note: text("note"),
  fallbackMode: boolean("fallbackMode").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
    "return_to_stock",
  ]).default("created").notNull(),
  // Rx lane for this order
  rxLane: mysqlEnum("rxLane", ["otc", "digital", "on_file", "fallback"]).default("otc").notNull(),
  rxGateCleared: boolean("rxGateCleared").default(false).notNull(),
  rxGateClearedAt: timestamp("rxGateClearedAt"),
  rxGateClearedBy: int("rxGateClearedBy"),  // pharmacistId who cleared the gate
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  promisedSlaMins: int("promisedSlaMins").default(20).notNull(),
  deliveryAddress: text("deliveryAddress"),
  flatNumber: varchar("flatNumber", { length: 20 }),
  buildingId: int("buildingId"),
  source: mysqlEnum("source", ["app", "whatsapp"]).default("app").notNull(),
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
});

// ─── Order Items ──────────────────────────────────────────────────────────────
export const orderItems = mysqlTable("order_items", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  productId: int("productId").notNull(),
  variantId: int("variantId"),
  storeSkuId: int("storeSkuId").notNull(),
  allocatedBatchId: int("allocatedBatchId"),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("lineTotal", { precision: 10, scale: 2 }).notNull(),
  requiresPrescription: boolean("requiresPrescription").default(false).notNull(),
  rxGateCleared: boolean("rxGateCleared").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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
  flowState: text("flowState"),
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
  payload: text("payload"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Phase 5: Vendors ─────────────────────────────────────────────────────────
export const vendors = mysqlTable("vendors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  contactName: varchar("contactName", { length: 200 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  gstin: varchar("gstin", { length: 20 }),
  address: text("address"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Phase 5: Purchase Orders ─────────────────────────────────────────────────
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull(),
  storeId: int("storeId").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "partially_received", "received", "cancelled"]).default("draft").notNull(),
  expectedDelivery: timestamp("expectedDelivery"),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Phase 5: PO Items ────────────────────────────────────────────────────────
export const poItems = mysqlTable("po_items", {
  id: int("id").autoincrement().primaryKey(),
  poId: int("poId").notNull(),
  productId: int("productId").notNull(),
  variantId: int("variantId"),
  orderedQty: int("orderedQty").notNull(),
  receivedQty: int("receivedQty").default(0).notNull(),
  unitCost: decimal("unitCost", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Phase 5: GRN Records (Goods Received Note) ───────────────────────────────
export const grnRecords = mysqlTable("grn_records", {
  id: int("id").autoincrement().primaryKey(),
  poId: int("poId"),  // nullable for direct GRN without PO
  storeId: int("storeId").notNull(),
  receivedByUserId: int("receivedByUserId").notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["pending", "verified", "discrepancy"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Phase 5: Staff Assignments ───────────────────────────────────────────────
export const staffAssignments = mysqlTable("staff_assignments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  storeId: int("storeId").notNull(),
  role: mysqlEnum("role", ["pharmacist", "store_manager", "inventory_operator", "delivery_operator", "auditor"]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  assignedByUserId: int("assignedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Phase 6: Workflow Events (State Machine Audit Trail) ─────────────────────
export const workflowEvents = mysqlTable("workflow_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  entityType: mysqlEnum("entityType", ["order", "prescription", "refill", "delivery", "po", "grn"]).notNull(),
  entityId: int("entityId").notNull(),
  fromState: varchar("fromState", { length: 100 }),
  toState: varchar("toState", { length: 100 }).notNull(),
  triggeredByUserId: int("triggeredByUserId"),
  triggeredBySystem: boolean("triggeredBySystem").default(false).notNull(),
  payload: text("payload"),  // JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Phase 6: User Importance Scores ─────────────────────────────────────────
export const userImportanceScores = mysqlTable("user_importance_scores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  score: int("score").default(50).notNull(),  // 0-100
  isChronic: boolean("isChronic").default(false).notNull(),
  isElderly: boolean("isElderly").default(false).notNull(),
  isAdherenceRisk: boolean("isAdherenceRisk").default(false).notNull(),
  flags: text("flags"),  // JSON array of flag strings
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Phase 7: Riders ─────────────────────────────────────────────────────────
export const riders = mysqlTable("riders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  storeId: int("storeId").notNull(),
  status: mysqlEnum("status", ["available", "on_delivery", "offline"]).default("available").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  currentLat: decimal("currentLat", { precision: 10, scale: 8 }),
  currentLng: decimal("currentLng", { precision: 11, scale: 8 }),
  lastLocationAt: timestamp("lastLocationAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Phase 7: Delivery Events ─────────────────────────────────────────────────
export const deliveryEvents = mysqlTable("delivery_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  riderId: int("riderId"),
  eventType: mysqlEnum("eventType", [
    "assigned",
    "picked_up",
    "arrived",
    "otp_verified",
    "delivered",
    "failed_attempt",
    "returned",
    "exception",
  ]).notNull(),
  lat: decimal("lat", { precision: 10, scale: 8 }),
  lng: decimal("lng", { precision: 11, scale: 8 }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Phase 7: Delivery OTPs ───────────────────────────────────────────────────
export const deliveryOtps = mysqlTable("delivery_otps", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().unique(),
  otp: varchar("otp", { length: 10 }).notNull(),
  isUsed: boolean("isUsed").default(false).notNull(),
  usedAt: timestamp("usedAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Phase 8: Metrics Events ──────────────────────────────────────────────────
export const metricsEvents = mysqlTable("metrics_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  userId: int("userId"),
  storeId: int("storeId"),
  orderId: int("orderId"),
  value: decimal("value", { precision: 12, scale: 2 }),
  metadata: text("metadata"),  // JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = typeof productVariants.$inferInsert;
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
export type Vendor = typeof vendors.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PoItem = typeof poItems.$inferSelect;
export type GrnRecord = typeof grnRecords.$inferSelect;
export type StaffAssignment = typeof staffAssignments.$inferSelect;
export type WorkflowEvent = typeof workflowEvents.$inferSelect;
export type UserImportanceScore = typeof userImportanceScores.$inferSelect;
export type Rider = typeof riders.$inferSelect;
export type DeliveryEvent = typeof deliveryEvents.$inferSelect;
export type DeliveryOtp = typeof deliveryOtps.$inferSelect;
export type MetricsEvent = typeof metricsEvents.$inferSelect;
export type RxPriorApproval = typeof rxPriorApprovals.$inferSelect;
