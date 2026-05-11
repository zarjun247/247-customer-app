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
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── Phase 7: Riders ─────────────────────────────────────────────────────────
export const riders = mysqlTable("riders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  storeId: int("storeId").notNull(),
  status: mysqlEnum("status", ["available", "on_delivery", "offline"])
    .default("available")
    .notNull(),
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

// ─── routing_decisions: full audit trail of every node resolution ─────────────
export const routingDecisions = mysqlTable("routing_decisions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  orderId: int("orderId"), // null during pre-order routing checks
  buildingId: int("buildingId"),
  requestedSkuIds: text("requestedSkuIds"), // JSON array of storeSkuIds requested
  // Resolution outcome
  resolvedStoreId: int("resolvedStoreId"),
  resolutionPath: mysqlEnum("resolutionPath", [
    "primary_assignment",
    "geo_nearest",
    "geo_nearest_with_stock",
    "pincode_fallback",
    "manual_override",
    "no_store_found",
  ]).notNull(),
  // 12-step check results (JSON object per step)
  stepResults: text("stepResults"), // JSON: { step: string, passed: boolean, reason?: string }[]
  // Fallback chain
  primaryStoreId: int("primaryStoreId"),
  primaryStoreRejectedReason: varchar("primaryStoreRejectedReason", {
    length: 500,
  }),
  secondaryStoreId: int("secondaryStoreId"),
  secondaryStoreRejectedReason: varchar("secondaryStoreRejectedReason", {
    length: 500,
  }),
  pincodeUsed: varchar("pincodeUsed", { length: 10 }),
  // ETA
  etaMins: int("etaMins"),
  etaSource: mysqlEnum("etaSource", [
    "google_maps",
    "sla_fallback",
    "manual",
  ]).default("sla_fallback"),
  // Context flags
  requiresColdChain: boolean("requiresColdChain").default(false).notNull(),
  requiresControlledDrug: boolean("requiresControlledDrug")
    .default(false)
    .notNull(),
  // Actor
  triggeredBy: mysqlEnum("triggeredBy", [
    "checkout",
    "whatsapp",
    "admin_override",
    "reallocation",
    "system",
  ])
    .default("checkout")
    .notNull(),
  triggeredByUserId: int("triggeredByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── delivery_tasks: one task per order-rider assignment ─────────────────────
export const deliveryTasks = mysqlTable("delivery_tasks", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  riderId: int("riderId").notNull(),
  storeId: int("storeId").notNull(),
  status: mysqlEnum("status", [
    "assigned",
    "pickup_confirmed",
    "out_for_delivery",
    "delivered",
    "failed_attempt",
    "returned",
    "cancelled",
  ])
    .default("assigned")
    .notNull(),
  // Timestamps
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  pickupConfirmedAt: timestamp("pickupConfirmedAt"),
  outForDeliveryAt: timestamp("outForDeliveryAt"),
  deliveredAt: timestamp("deliveredAt"),
  failedAt: timestamp("failedAt"),
  returnedAt: timestamp("returnedAt"),
  // Proof of delivery
  podType: mysqlEnum("podType", ["otp", "signature", "photo", "none"]).default(
    "otp"
  ),
  podOtp: varchar("podOtp", { length: 10 }),
  podOtpVerifiedAt: timestamp("podOtpVerifiedAt"),
  podPhotoUrl: text("podPhotoUrl"),
  podPhotoKey: varchar("podPhotoKey", { length: 500 }),
  podNote: text("podNote"),
  // Failed delivery
  failedReason: mysqlEnum("failedReason", [
    "customer_unavailable",
    "wrong_address",
    "customer_refused",
    "payment_issue",
    "damaged_package",
    "other",
  ]),
  failedNote: text("failedNote"),
  failedLat: decimal("failedLat", { precision: 10, scale: 8 }),
  failedLng: decimal("failedLng", { precision: 11, scale: 8 }),
  attemptCount: int("attemptCount").default(1).notNull(),
  // COD
  isCod: boolean("isCod").default(false).notNull(),
  codAmount: decimal("codAmount", { precision: 10, scale: 2 }),
  codCollectedAt: timestamp("codCollectedAt"),
  codCollectedAmount: decimal("codCollectedAmount", {
    precision: 10,
    scale: 2,
  }),
  codReconciled: boolean("codReconciled").default(false).notNull(),
  codReconciledAt: timestamp("codReconciledAt"),
  codReconciledBy: int("codReconciledBy"),
  // Delivery location
  deliveryLat: decimal("deliveryLat", { precision: 10, scale: 8 }),
  deliveryLng: decimal("deliveryLng", { precision: 11, scale: 8 }),
  // SLA breach
  slaBreached: boolean("slaBreached").default(false).notNull(),
  slaBreachReason: varchar("slaBreachReason", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── rider_locations: heartbeat/manual location history ──────────────────────
export const riderLocations = mysqlTable("rider_locations", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  riderId: int("riderId").notNull(),
  lat: decimal("lat", { precision: 10, scale: 8 }).notNull(),
  lng: decimal("lng", { precision: 11, scale: 8 }).notNull(),
  accuracy: decimal("accuracy", { precision: 8, scale: 2 }), // metres
  source: mysqlEnum("source", ["gps", "manual", "network"])
    .default("gps")
    .notNull(),
  activeTaskId: int("activeTaskId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── order_timestamps: per-order lifecycle timestamp log ─────────────────────
export const orderTimestamps = mysqlTable("order_timestamps", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  event: mysqlEnum("event", [
    "order_placed",
    "prescription_uploaded",
    "pharmacist_approved",
    "allocation_completed",
    "reservation_confirmed",
    "picking_started",
    "packed",
    "rider_assigned",
    "pickup_confirmed",
    "out_for_delivery",
    "delivered",
    "failed_attempt",
    "returned",
    "cancelled",
    "sla_breached",
    "clarification_requested",
    "rejected",
  ]).notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  actorId: int("actorId"),
  actorType: mysqlEnum("actorType", [
    "customer",
    "pharmacist",
    "rider",
    "system",
    "admin",
  ])
    .default("system")
    .notNull(),
  note: varchar("note", { length: 500 }),
  // SLA breach context
  breachReason: varchar("breachReason", { length: 500 }),
  minutesLate: int("minutesLate"),
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

// ─── PART 10: WhatsApp Full Channel ──────────────────────────────────────────

// whatsapp_links: verified phone ↔ userId mapping (ownership proven via OTP)
export const whatsappLinks = mysqlTable("whatsapp_links", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  userId: int("userId").notNull(),
  verifiedAt: timestamp("verifiedAt").notNull(),
  verificationMethod: mysqlEnum("verificationMethod", [
    "otp",
    "app_login",
    "staff_override",
  ])
    .default("otp")
    .notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  linkedBy: int("linkedBy"), // staff userId if staff_override
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// whatsapp_messages: full audit log of every inbound/outbound message
export const whatsappMessages = mysqlTable("whatsapp_messages", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull(),
  userId: int("userId"), // resolved after linking
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  messageType: mysqlEnum("messageType", [
    "text",
    "image",
    "document",
    "audio",
    "template",
    "button",
    "interactive",
  ])
    .default("text")
    .notNull(),
  body: text("body"),
  mediaUrl: text("mediaUrl"),
  mediaKey: varchar("mediaKey", { length: 500 }),
  templateName: varchar("templateName", { length: 100 }),
  templateParams: text("templateParams"), // JSON array of template variable values
  externalMsgId: varchar("externalMsgId", { length: 200 }), // WABA message ID
  sessionId: int("sessionId"), // FK to whatsapp_sessions
  flow: varchar("flow", { length: 50 }),
  status: mysqlEnum("status", [
    "received",
    "sent",
    "delivered",
    "read",
    "failed",
  ])
    .default("received")
    .notNull(),
  errorCode: varchar("errorCode", { length: 50 }),
  errorMessage: varchar("errorMessage", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// whatsapp_carts: per-phone draft cart that converts to a real order on confirm
export const whatsappCarts = mysqlTable("whatsapp_carts", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull(),
  userId: int("userId"),
  storeId: int("storeId"),
  status: mysqlEnum("status", ["active", "confirmed", "expired", "abandoned"])
    .default("active")
    .notNull(),
  prescriptionId: int("prescriptionId"),
  deliveryAddress: text("deliveryAddress"),
  flatNumber: varchar("flatNumber", { length: 50 }),
  buildingId: int("buildingId"),
  convertedOrderId: int("convertedOrderId"), // set when status = confirmed
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// whatsapp_cart_lines: items in a WhatsApp draft cart
export const whatsappCartLines = mysqlTable("whatsapp_cart_lines", {
  id: int("id").autoincrement().primaryKey(),
  cartId: int("cartId").notNull(),
  productId: int("productId").notNull(),
  variantId: int("variantId"),
  storeSkuId: int("storeSkuId").notNull(),
  qty: int("qty").notNull().default(1),
  unitPrice: varchar("unitPrice", { length: 20 }).notNull(),
  lineTotal: varchar("lineTotal", { length: 20 }).notNull(),
  requiresPrescription: boolean("requiresPrescription")
    .default(false)
    .notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});

// waba_message_templates: WABA-approved WhatsApp templates with param support
export const wabaMessageTemplates = mysqlTable("waba_message_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  category: mysqlEnum("category", [
    "order_status",
    "refill_reminder",
    "rx_received",
    "delivery_otp",
    "bill_share",
    "staff_handoff",
    "delivery_exception",
    "welcome",
    "supplier_bill",
    "custom",
  ]).notNull(),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  body: text("body").notNull(), // template text with {{1}} {{2}} placeholders
  headerText: varchar("headerText", { length: 200 }),
  footerText: varchar("footerText", { length: 200 }),
  buttonLabels: text("buttonLabels"), // JSON array of button labels
  paramCount: int("paramCount").default(0).notNull(),
  paramDescriptions: text("paramDescriptions"), // JSON array of param descriptions
  wabaTemplateId: varchar("wabaTemplateId", { length: 200 }), // approved WABA template ID
  wabaStatus: mysqlEnum("wabaStatus", [
    "draft",
    "pending",
    "approved",
    "rejected",
  ])
    .default("draft")
    .notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// staff_handoffs: WhatsApp conversations escalated to human staff
export const staffHandoffs = mysqlTable("staff_handoffs", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull(),
  userId: int("userId"),
  sessionId: int("sessionId"),
  reason: mysqlEnum("reason", [
    "customer_request",
    "bot_confused",
    "rx_clarification",
    "delivery_exception",
    "complaint",
    "supplier_bill",
    "other",
  ]).notNull(),
  reasonNote: text("reasonNote"),
  status: mysqlEnum("status", ["open", "assigned", "resolved", "closed"])
    .default("open")
    .notNull(),
  assignedTo: int("assignedTo"), // staff userId
  assignedAt: timestamp("assignedAt"),
  resolvedAt: timestamp("resolvedAt"),
  resolutionNote: text("resolutionNote"),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"])
    .default("normal")
    .notNull(),
  relatedOrderId: int("relatedOrderId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// whatsapp_webhook_log: raw inbound webhook payloads for debugging
export const whatsappWebhookLog = mysqlTable("whatsapp_webhook_log", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  source: varchar("source", { length: 50 }).default("waba").notNull(), // waba | twilio | meta
  payload: text("payload").notNull(),
  signature: varchar("signature", { length: 500 }),
  signatureValid: boolean("signatureValid"),
  processedAt: timestamp("processedAt"),
  errorMessage: varchar("errorMessage", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Rider = typeof riders.$inferSelect;
export type DeliveryEvent = typeof deliveryEvents.$inferSelect;
export type DeliveryOtp = typeof deliveryOtps.$inferSelect;
export type RoutingDecision = typeof routingDecisions.$inferSelect;
export type DeliveryTask = typeof deliveryTasks.$inferSelect;
export type RiderLocation = typeof riderLocations.$inferSelect;
export type OrderTimestamp = typeof orderTimestamps.$inferSelect;
export type WhatsappSession = typeof whatsappSessions.$inferSelect;
export type WhatsappLink = typeof whatsappLinks.$inferSelect;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type WhatsappCart = typeof whatsappCarts.$inferSelect;
export type WhatsappCartLine = typeof whatsappCartLines.$inferSelect;
export type WabaMessageTemplate = typeof wabaMessageTemplates.$inferSelect;
export type StaffHandoff = typeof staffHandoffs.$inferSelect;
export type WhatsappWebhookLog = typeof whatsappWebhookLog.$inferSelect;
