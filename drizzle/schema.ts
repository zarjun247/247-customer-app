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
    "cashier",
    "salesman",
    "purchase_manager",
    "accountant",
    "super_admin",
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
  // Multi-angle image slots (CDN/storage-ready)
  imageHeroUrl: text("imageHeroUrl"),
  imageSideUrl: text("imageSideUrl"),
  imageRearUrl: text("imageRearUrl"),
  imageLabelUrl: text("imageLabelUrl"),
  imageNutritionUrl: text("imageNutritionUrl"),
  // Catalog truth fields
  gstRate: decimal("gstRate", { precision: 5, scale: 2 }).default("12.00"),
  searchableTokens: text("searchableTokens"),  // space-separated normalized tokens for FTS
  canonicalName: varchar("canonicalName", { length: 300 }),  // normalized deduped name
  masterProductId: int("masterProductId"),  // FK to canonical product (for dedup)
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
  // Sponsored shelf / monetization hooks (OTC/wellness/nutrition/devices/personal care only)
  isFeatured: boolean("isFeatured").default(false).notNull(),
  sponsorPriority: int("sponsorPriority").default(0).notNull(),  // higher = shown first
  sponsorCategory: varchar("sponsorCategory", { length: 50 }),  // 'featured_brand' | 'sponsored_shelf' | 'brand_spotlight'
  sponsorLabel: varchar("sponsorLabel", { length: 100 }),  // display label e.g. "Sponsored"
  sponsorValidUntil: timestamp("sponsorValidUntil"),  // null = permanent
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
  lane: mysqlEnum("lane", ["otc", "digital", "on_file", "fallback", "doctor_consult"]).default("digital").notNull(),
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
  rxLane: mysqlEnum("rxLane", ["otc", "digital", "on_file", "fallback", "doctor_consult"]).default("otc").notNull(),
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
  snoozedUntil: timestamp("snoozedUntil"),  // null = not snoozed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
// ─── WhatsApp Sessionss ────────────────────────────────────────────────────────
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

// ─── Priority 3: Invoice Ingestion Engine ────────────────────────────────────
export const invoiceIngestions = mysqlTable("invoice_ingestions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  fileUrl: varchar("fileUrl", { length: 500 }).notNull(),
  originalFilename: varchar("originalFilename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).default("application/pdf").notNull(),
  status: mysqlEnum("status", ["pending_ocr", "ocr_complete", "under_review", "approved", "rejected"]).default("pending_ocr").notNull(),
  ocrRawText: text("ocrRawText"),
  itemCount: int("itemCount").default(0).notNull(),
  approvedCount: int("approvedCount").default(0).notNull(),
  rejectedCount: int("rejectedCount").default(0).notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const ocrJobs = mysqlTable("ocr_jobs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  ingestionId: bigint("ingestionId", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["queued", "processing", "complete", "failed"]).default("queued").notNull(),
  provider: varchar("provider", { length: 50 }).default("llm").notNull(),
  rawResponse: text("rawResponse"),
  parsedJson: text("parsedJson"),  // JSON array of extracted line items
  errorMessage: text("errorMessage"),
  attempts: int("attempts").default(0).notNull(),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const humanReviewItems = mysqlTable("human_review_items", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  ingestionId: bigint("ingestionId", { mode: "number" }).notNull(),
  rawLine: text("rawLine").notNull(),
  parsedName: varchar("parsedName", { length: 255 }),
  parsedBatch: varchar("parsedBatch", { length: 100 }),
  parsedExpiry: varchar("parsedExpiry", { length: 50 }),
  parsedQty: int("parsedQty"),
  parsedUnitCost: decimal("parsedUnitCost", { precision: 10, scale: 2 }),
  parsedMrp: decimal("parsedMrp", { precision: 10, scale: 2 }),
  parsedBarcode: varchar("parsedBarcode", { length: 100 }),
  matchedProductId: int("matchedProductId"),
  matchedVariantId: int("matchedVariantId"),
  matchConfidence: decimal("matchConfidence", { precision: 5, scale: 2 }),
  isDuplicate: boolean("isDuplicate").default(false).notNull(),
  duplicateOfId: bigint("duplicateOfId", { mode: "number" }),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "merged"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Priority 9: Helpdesk / Grievance ─────────────────────────────────────────
export const helpdeskTickets = mysqlTable("helpdesk_tickets", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  orderId: int("orderId"),
  prescriptionId: int("prescriptionId"),
  category: mysqlEnum("category", ["order", "prescription", "delivery", "billing", "product", "account", "other"]).default("other").notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  assignedTo: int("assignedTo"),
  resolvedAt: timestamp("resolvedAt"),
  resolutionNote: text("resolutionNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const userConsents = mysqlTable("user_consents", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  consentType: mysqlEnum("consentType", ["terms_of_service", "privacy_policy", "rx_data_processing", "marketing", "location"]).notNull(),
  version: varchar("version", { length: 20 }).notNull(),
  granted: boolean("granted").default(true).notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: varchar("userAgent", { length: 500 }),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

// ─── Doctor Consult Requests ─────────────────────────────────────────────────
export const doctorConsultRequests = mysqlTable("doctor_consult_requests", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  consultType: mysqlEnum("consultType", ["instant", "scheduled"]).default("instant").notNull(),
  status: mysqlEnum("status", [
    "requested",
    "assigned",
    "in_progress",
    "completed",
    "cancelled",
    "no_show",
  ]).default("requested").notNull(),
  // Doctor assigned to this consult
  assignedDoctorName: varchar("assignedDoctorName", { length: 200 }),
  assignedDoctorReg: varchar("assignedDoctorReg", { length: 100 }),
  // Patient-stated reason for consult
  chiefComplaint: text("chiefComplaint"),
  // Doctor note after consult
  consultNote: text("consultNote"),
  // If doctor issued a prescription during consult, it is linked here
  linkedPrescriptionId: int("linkedPrescriptionId"),
  // Scheduling
  scheduledAt: timestamp("scheduledAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  // Consent: patient confirmed they understand this is a real medical consult
  consentGiven: boolean("consentGiven").default(false).notNull(),
  // Platform note (internal)
  platformNote: text("platformNote"),
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
export type DoctorConsultRequest = typeof doctorConsultRequests.$inferSelect;

// ─── Payment Records ──────────────────────────────────────────────────────────
export const paymentRecords = mysqlTable("payment_records", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  userId: int("userId").notNull(),
  gatewayOrderId: varchar("gatewayOrderId", { length: 100 }).notNull(),
  gatewayPaymentId: varchar("gatewayPaymentId", { length: 100 }),
  gatewaySignature: varchar("gatewaySignature", { length: 500 }),
  amount: int("amount").notNull(), // in paise
  currency: varchar("currency", { length: 10 }).default("INR").notNull(),
  status: mysqlEnum("status", ["pending", "paid", "failed", "refunded"]).default("pending").notNull(),
  method: varchar("method", { length: 50 }), // upi, card, netbanking, etc.
  paidAt: timestamp("paidAt"),
  failureReason: text("failureReason"),
  refundId: varchar("refundId", { length: 100 }),
  refundedAt: timestamp("refundedAt"),
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

// ─── Medivision Sync Log ──────────────────────────────────────────────────────
export const medivisionSyncLog = mysqlTable("medivision_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  rowsProcessed: int("rowsProcessed").default(0).notNull(),
  rowsInserted: int("rowsInserted").default(0).notNull(),
  rowsUpdated: int("rowsUpdated").default(0).notNull(),
  rowsSkipped: int("rowsSkipped").default(0).notNull(),
  errors: text("errors"),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type PaymentRecord = typeof paymentRecords.$inferSelect;
export type SlaEvent = typeof slaEvents.$inferSelect;
export type MedivisionSyncLog = typeof medivisionSyncLog.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// PHARMACY OS — MASTER DATA TABLES (v22)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── States ──────────────────────────────────────────────────────────────────
export const states = mysqlTable("states", {
  id: int("id").autoincrement().primaryKey(),
  stateName: varchar("stateName", { length: 100 }).notNull(),
  stateCode: varchar("stateCode", { length: 10 }).notNull(),
  gstStateCode: varchar("gstStateCode", { length: 4 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  supplierName: varchar("supplierName", { length: 300 }).notNull(),
  gstin: varchar("gstin", { length: 20 }),
  address: text("address"),
  stateId: int("stateId"),
  contactPerson: varchar("contactPerson", { length: 200 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  paymentTerms: varchar("paymentTerms", { length: 100 }),
  defaultDiscount: decimal("defaultDiscount", { precision: 5, scale: 2 }).default("0.00"),
  cashDiscount: decimal("cashDiscount", { precision: 5, scale: 2 }).default("0.00"),
  creditDays: int("creditDays").default(0),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Manufacturers / Companies ────────────────────────────────────────────────
export const manufacturers = mysqlTable("manufacturers", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 300 }).notNull(),
  aliases: text("aliases"),
  gstin: varchar("gstin", { length: 20 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Generics / Salts ─────────────────────────────────────────────────────────
export const generics = mysqlTable("generics", {
  id: int("id").autoincrement().primaryKey(),
  genericName: varchar("genericName", { length: 300 }).notNull(),
  aliases: text("aliases"),
  therapeuticClass: varchar("therapeuticClass", { length: 200 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Doctors ──────────────────────────────────────────────────────────────────
export const doctors = mysqlTable("doctors", {
  id: int("id").autoincrement().primaryKey(),
  doctorName: varchar("doctorName", { length: 300 }).notNull(),
  registrationNo: varchar("registrationNo", { length: 100 }),
  clinicHospital: varchar("clinicHospital", { length: 300 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  specialization: varchar("specialization", { length: 200 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Patient Categories ───────────────────────────────────────────────────────
export const patientCategories = mysqlTable("patient_categories", {
  id: int("id").autoincrement().primaryKey(),
  categoryName: varchar("categoryName", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Schedule Master ──────────────────────────────────────────────────────────
export const scheduleMaster = mysqlTable("schedule_master", {
  id: int("id").autoincrement().primaryKey(),
  scheduleCode: varchar("scheduleCode", { length: 10 }).notNull(),
  prescriptionRequired: boolean("prescriptionRequired").default(false).notNull(),
  pharmacistReviewRequired: boolean("pharmacistReviewRequired").default(false).notNull(),
  h1RegisterRequired: boolean("h1RegisterRequired").default(false).notNull(),
  repeatDispenseAllowed: boolean("repeatDispenseAllowed").default(true).notNull(),
  retentionPolicyDays: int("retentionPolicyDays").default(365),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Discount Categories ──────────────────────────────────────────────────────
export const discountCategories = mysqlTable("discount_categories", {
  id: int("id").autoincrement().primaryKey(),
  categoryName: varchar("categoryName", { length: 100 }).notNull(),
  maxDiscount: decimal("maxDiscount", { precision: 5, scale: 2 }).default("0.00"),
  minMargin: decimal("minMargin", { precision: 5, scale: 2 }).default("0.00"),
  roleOverrideRequired: boolean("roleOverrideRequired").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Message Templates ────────────────────────────────────────────────────────
export const messageTemplates = mysqlTable("message_templates", {
  id: int("id").autoincrement().primaryKey(),
  templateName: varchar("templateName", { length: 200 }).notNull(),
  channel: mysqlEnum("channel", ["whatsapp", "sms", "email", "app"]).default("sms").notNull(),
  messageBody: text("messageBody").notNull(),
  variables: text("variables"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Printers ─────────────────────────────────────────────────────────────────
export const printers = mysqlTable("printers", {
  id: int("id").autoincrement().primaryKey(),
  printerName: varchar("printerName", { length: 200 }).notNull(),
  printerType: mysqlEnum("printerType", ["bill", "barcode", "a4", "thermal"]).default("thermal").notNull(),
  assignedTerminal: varchar("assignedTerminal", { length: 100 }),
  assignedStoreId: int("assignedStoreId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Financial Years ──────────────────────────────────────────────────────────
export const financialYears = mysqlTable("financial_years", {
  id: int("id").autoincrement().primaryKey(),
  yearLabel: varchar("yearLabel", { length: 20 }).notNull(),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  isCurrent: boolean("isCurrent").default(false).notNull(),
  isLocked: boolean("isLocked").default(false).notNull(),
  lockedAt: timestamp("lockedAt"),
  lockedBy: int("lockedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Product Aliases ──────────────────────────────────────────────────────────
export const productAliases = mysqlTable("product_aliases", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  alias: varchar("alias", { length: 300 }).notNull(),
  aliasType: mysqlEnum("aliasType", ["supplier_code", "legacy_code", "medivision_code", "samarth_code", "barcode", "other"]).default("other").notNull(),
  supplierId: int("supplierId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Product Supplier Mappings ────────────────────────────────────────────────
export const productSupplierMappings = mysqlTable("product_supplier_mappings", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  supplierId: int("supplierId").notNull(),
  supplierProductCode: varchar("supplierProductCode", { length: 100 }),
  lastPurchaseRate: decimal("lastPurchaseRate", { precision: 10, scale: 2 }),
  isPreferred: boolean("isPreferred").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Product Locks ────────────────────────────────────────────────────────────
export const productLocks = mysqlTable("product_locks", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  lockType: mysqlEnum("lockType", ["min_margin", "max_discount", "price_lock", "sale_block"]).notNull(),
  lockValue: decimal("lockValue", { precision: 10, scale: 2 }),
  roleOverrideRequired: boolean("roleOverrideRequired").default(true).notNull(),
  reason: text("reason"),
  createdBy: int("createdBy").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Stock Movements ──────────────────────────────────────────────────────────
export const stockMovements = mysqlTable("stock_movements", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  storeId: int("storeId").notNull(),
  movementType: mysqlEnum("movementType", [
    "purchase_inward",
    "sale_reserve",
    "sale_fulfil",
    "cancellation_release",
    "sale_return",
    "purchase_return",
    "stock_adjustment",
    "stock_transfer",
    "batch_transfer",
    "quarantine",
    "disposal",
    "audit_correction",
  ]).notNull(),
  qty: int("qty").notNull(),
  qtyBefore: int("qtyBefore").notNull(),
  qtyAfter: int("qtyAfter").notNull(),
  referenceType: varchar("referenceType", { length: 50 }),
  referenceId: int("referenceId"),
  reason: text("reason"),
  performedBy: int("performedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Stock Adjustments ────────────────────────────────────────────────────────
export const stockAdjustments = mysqlTable("stock_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  storeId: int("storeId").notNull(),
  adjustmentType: mysqlEnum("adjustmentType", ["increase", "decrease"]).notNull(),
  qty: int("qty").notNull(),
  reason: text("reason").notNull(),
  supportingNote: text("supportingNote"),
  status: mysqlEnum("status", ["pending_approval", "approved", "rejected"]).default("pending_approval").notNull(),
  requestedBy: int("requestedBy").notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Purchase Invoices ────────────────────────────────────────────────────────
export const purchaseInvoices = mysqlTable("purchase_invoices", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId").notNull(),
  storeId: int("storeId").notNull(),
  invoiceNo: varchar("invoiceNo", { length: 100 }).notNull(),
  invoiceDate: timestamp("invoiceDate").notNull(),
  supplierGstin: varchar("supplierGstin", { length: 20 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).default("0.00"),
  totalGst: decimal("totalGst", { precision: 12, scale: 2 }).default("0.00"),
  totalDiscount: decimal("totalDiscount", { precision: 12, scale: 2 }).default("0.00"),
  netAmount: decimal("netAmount", { precision: 12, scale: 2 }).default("0.00"),
  status: mysqlEnum("status", ["draft", "committed", "partially_returned", "returned", "cancelled"]).default("draft").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy").notNull(),
  committedAt: timestamp("committedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Purchase Lines ───────────────────────────────────────────────────────────
export const purchaseLines = mysqlTable("purchase_lines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseInvoiceId: int("purchaseInvoiceId").notNull(),
  productId: int("productId").notNull(),
  batchNo: varchar("batchNo", { length: 100 }).notNull(),
  expiryDate: timestamp("expiryDate").notNull(),
  mrp: decimal("mrp", { precision: 10, scale: 2 }).notNull(),
  purchaseRate: decimal("purchaseRate", { precision: 10, scale: 2 }).notNull(),
  saleRate: decimal("saleRate", { precision: 10, scale: 2 }),
  qty: int("qty").notNull(),
  freeQty: int("freeQty").default(0),
  schemeDiscount: decimal("schemeDiscount", { precision: 5, scale: 2 }).default("0.00"),
  cashDiscount: decimal("cashDiscount", { precision: 5, scale: 2 }).default("0.00"),
  hsnCode: varchar("hsnCode", { length: 20 }),
  gstRate: decimal("gstRate", { precision: 5, scale: 2 }).default("12.00"),
  landingCost: decimal("landingCost", { precision: 10, scale: 2 }),
  margin: decimal("margin", { precision: 5, scale: 2 }),
  batchId: int("batchId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Purchase Returns ─────────────────────────────────────────────────────────
export const purchaseReturns = mysqlTable("purchase_returns", {
  id: int("id").autoincrement().primaryKey(),
  purchaseInvoiceId: int("purchaseInvoiceId").notNull(),
  supplierId: int("supplierId").notNull(),
  storeId: int("storeId").notNull(),
  returnDate: timestamp("returnDate").defaultNow().notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).default("0.00"),
  reason: text("reason"),
  status: mysqlEnum("status", ["draft", "committed"]).default("draft").notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Purchase Return Lines ────────────────────────────────────────────────────
export const purchaseReturnLines = mysqlTable("purchase_return_lines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseReturnId: int("purchaseReturnId").notNull(),
  purchaseLineId: int("purchaseLineId").notNull(),
  batchId: int("batchId").notNull(),
  qty: int("qty").notNull(),
  returnRate: decimal("returnRate", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Supplier Payments ────────────────────────────────────────────────────────
export const supplierPayments = mysqlTable("supplier_payments", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId").notNull(),
  storeId: int("storeId").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMode: mysqlEnum("paymentMode", ["cash", "cheque", "upi", "neft", "rtgs"]).default("upi").notNull(),
  referenceNo: varchar("referenceNo", { length: 100 }),
  paymentDate: timestamp("paymentDate").defaultNow().notNull(),
  notes: text("notes"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── OCR / AI Ingestion Tables ────────────────────────────────────────────────
export const ingestionJobs = mysqlTable("ingestion_jobs", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  jobType: mysqlEnum("jobType", ["purchase_bill", "prescription", "stock_audit"]).default("purchase_bill").notNull(),
  status: mysqlEnum("status", ["queued", "processing", "ocr_complete", "under_review", "committed", "failed"]).default("queued").notNull(),
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  filename: varchar("filename", { length: 255 }),
  mimeType: varchar("mimeType", { length: 100 }),
  ocrRawText: text("ocrRawText"),
  ocrConfidence: decimal("ocrConfidence", { precision: 5, scale: 2 }),
  errorMessage: text("errorMessage"),
  createdBy: int("createdBy").notNull(),
  processedAt: timestamp("processedAt"),
  committedAt: timestamp("committedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const ocrExtractedHeaders = mysqlTable("ocr_extracted_headers", {
  id: int("id").autoincrement().primaryKey(),
  ingestionJobId: int("ingestionJobId").notNull(),
  supplierName: varchar("supplierName", { length: 300 }),
  supplierGstin: varchar("supplierGstin", { length: 20 }),
  invoiceNo: varchar("invoiceNo", { length: 100 }),
  invoiceDate: varchar("invoiceDate", { length: 50 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  matchedSupplierId: int("matchedSupplierId"),
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ocrExtractedLines = mysqlTable("ocr_extracted_lines", {
  id: int("id").autoincrement().primaryKey(),
  ingestionJobId: int("ingestionJobId").notNull(),
  lineNo: int("lineNo").notNull(),
  rawText: text("rawText"),
  itemName: varchar("itemName", { length: 300 }),
  manufacturer: varchar("manufacturer", { length: 200 }),
  batchNo: varchar("batchNo", { length: 100 }),
  expiryDate: varchar("expiryDate", { length: 50 }),
  mrp: decimal("mrp", { precision: 10, scale: 2 }),
  purchaseRate: decimal("purchaseRate", { precision: 10, scale: 2 }),
  qty: int("qty"),
  freeQty: int("freeQty").default(0),
  discount: decimal("discount", { precision: 5, scale: 2 }),
  gstRate: decimal("gstRate", { precision: 5, scale: 2 }),
  hsnCode: varchar("hsnCode", { length: 20 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  matchedProductId: int("matchedProductId"),
  matchConfidence: decimal("matchConfidence", { precision: 5, scale: 2 }),
  matchStatus: mysqlEnum("matchStatus", ["auto_matched", "review_required", "unknown_sku", "rejected"]).default("review_required").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const skuCreationDrafts = mysqlTable("sku_creation_drafts", {
  id: int("id").autoincrement().primaryKey(),
  ingestionJobId: int("ingestionJobId").notNull(),
  ocrLineId: int("ocrLineId"),
  draftName: varchar("draftName", { length: 300 }).notNull(),
  brand: varchar("brand", { length: 200 }),
  genericName: varchar("genericName", { length: 300 }),
  manufacturer: varchar("manufacturer", { length: 200 }),
  scheduleFlag: varchar("scheduleFlag", { length: 10 }),
  hsnCode: varchar("hsnCode", { length: 20 }),
  gstRate: decimal("gstRate", { precision: 5, scale: 2 }),
  packSize: varchar("packSize", { length: 100 }),
  status: mysqlEnum("status", ["pending_review", "approved", "rejected"]).default("pending_review").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  activatedProductId: int("activatedProductId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const purchaseDrafts = mysqlTable("purchase_drafts", {
  id: int("id").autoincrement().primaryKey(),
  ingestionJobId: int("ingestionJobId").notNull(),
  supplierId: int("supplierId"),
  invoiceNo: varchar("invoiceNo", { length: 100 }),
  invoiceDate: varchar("invoiceDate", { length: 50 }),
  status: mysqlEnum("status", ["draft", "under_review", "approved", "committed", "rejected"]).default("draft").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  committedInvoiceId: int("committedInvoiceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseDraftLines = mysqlTable("purchase_draft_lines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseDraftId: int("purchaseDraftId").notNull(),
  ocrLineId: int("ocrLineId"),
  productId: int("productId"),
  batchNo: varchar("batchNo", { length: 100 }),
  expiryDate: varchar("expiryDate", { length: 50 }),
  mrp: decimal("mrp", { precision: 10, scale: 2 }),
  purchaseRate: decimal("purchaseRate", { precision: 10, scale: 2 }),
  qty: int("qty"),
  freeQty: int("freeQty").default(0),
  discount: decimal("discount", { precision: 5, scale: 2 }),
  gstRate: decimal("gstRate", { precision: 5, scale: 2 }),
  hsnCode: varchar("hsnCode", { length: 20 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── H1 Register ──────────────────────────────────────────────────────────────
export const h1Register = mysqlTable("h1_register", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId"),
  prescriptionId: int("prescriptionId"),
  storeId: int("storeId").notNull(),
  patientName: varchar("patientName", { length: 300 }).notNull(),
  patientPhone: varchar("patientPhone", { length: 20 }),
  prescribingDoctor: varchar("prescribingDoctor", { length: 300 }),
  drugName: varchar("drugName", { length: 300 }).notNull(),
  batchNo: varchar("batchNo", { length: 100 }),
  qty: int("qty").notNull(),
  prescriptionRef: varchar("prescriptionRef", { length: 100 }),
  pharmacistId: int("pharmacistId").notNull(),
  billNo: varchar("billNo", { length: 100 }),
  dispensedAt: timestamp("dispensedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Ledgers ──────────────────────────────────────────────────────────────────
export const ledgers = mysqlTable("ledgers", {
  id: int("id").autoincrement().primaryKey(),
  ledgerName: varchar("ledgerName", { length: 200 }).notNull(),
  ledgerType: mysqlEnum("ledgerType", [
    "supplier", "customer", "sales", "purchases",
    "gst_output", "gst_input", "cash", "bank",
    "upi_settlement", "discounts", "purchase_returns",
    "sales_returns", "stock_adjustment", "expiry_loss",
    "gross_margin", "expenses",
  ]).notNull(),
  storeId: int("storeId"),
  supplierId: int("supplierId"),
  customerId: int("customerId"),
  openingBalance: decimal("openingBalance", { precision: 14, scale: 2 }).default("0.00"),
  currentBalance: decimal("currentBalance", { precision: 14, scale: 2 }).default("0.00"),
  financialYearId: int("financialYearId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const ledgerEntries = mysqlTable("ledger_entries", {
  id: int("id").autoincrement().primaryKey(),
  ledgerId: int("ledgerId").notNull(),
  entryDate: timestamp("entryDate").defaultNow().notNull(),
  entryType: mysqlEnum("entryType", ["debit", "credit"]).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  referenceType: varchar("referenceType", { length: 50 }),
  referenceId: int("referenceId"),
  narration: text("narration"),
  runningBalance: decimal("runningBalance", { precision: 14, scale: 2 }),
  financialYearId: int("financialYearId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Shift Closings ───────────────────────────────────────────────────────────
export const shiftClosings = mysqlTable("shift_closings", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  shiftDate: timestamp("shiftDate").notNull(),
  openingCash: decimal("openingCash", { precision: 12, scale: 2 }).default("0.00"),
  cashSales: decimal("cashSales", { precision: 12, scale: 2 }).default("0.00"),
  upiCardSales: decimal("upiCardSales", { precision: 12, scale: 2 }).default("0.00"),
  creditSales: decimal("creditSales", { precision: 12, scale: 2 }).default("0.00"),
  refunds: decimal("refunds", { precision: 12, scale: 2 }).default("0.00"),
  expenses: decimal("expenses", { precision: 12, scale: 2 }).default("0.00"),
  cashDeposited: decimal("cashDeposited", { precision: 12, scale: 2 }).default("0.00"),
  expectedCash: decimal("expectedCash", { precision: 12, scale: 2 }).default("0.00"),
  actualCash: decimal("actualCash", { precision: 12, scale: 2 }).default("0.00"),
  variance: decimal("variance", { precision: 12, scale: 2 }).default("0.00"),
  cashierId: int("cashierId").notNull(),
  pharmacistOnDutyId: int("pharmacistOnDutyId"),
  pendingOrders: int("pendingOrders").default(0),
  cancelledBills: int("cancelledBills").default(0),
  status: mysqlEnum("status", ["open", "submitted", "approved", "locked"]).default("open").notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── System Settings ──────────────────────────────────────────────────────────
export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 200 }).notNull(),
  settingValue: text("settingValue"),
  settingType: mysqlEnum("settingType", ["string", "number", "boolean", "json"]).default("string").notNull(),
  description: text("description"),
  isLocked: boolean("isLocked").default(false).notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Report Exports ───────────────────────────────────────────────────────────
export const reportExports = mysqlTable("report_exports", {
  id: int("id").autoincrement().primaryKey(),
  reportType: varchar("reportType", { length: 100 }).notNull(),
  parameters: text("parameters"),
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  status: mysqlEnum("status", ["queued", "generating", "ready", "failed"]).default("queued").notNull(),
  requestedBy: int("requestedBy").notNull(),
  storeId: int("storeId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Supplier = typeof suppliers.$inferSelect;
export type Manufacturer = typeof manufacturers.$inferSelect;
export type Generic = typeof generics.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect;
export type PurchaseLine = typeof purchaseLines.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type OcrExtractedLine = typeof ocrExtractedLines.$inferSelect;
export type ShiftClosing = typeof shiftClosings.$inferSelect;
export type Ledger = typeof ledgers.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type FinancialYear = typeof financialYears.$inferSelect;
