import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  bigint,
  date,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── Phase 6: User Importance Scores ─────────────────────────────────────────
export const userImportanceScores = mysqlTable("user_importance_scores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  score: int("score").default(50).notNull(), // 0-100
  isChronic: boolean("isChronic").default(false).notNull(),
  isElderly: boolean("isElderly").default(false).notNull(),
  isAdherenceRisk: boolean("isAdherenceRisk").default(false).notNull(),
  flags: text("flags"), // JSON array of flag strings
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Patient/customer management tables
export const familyMembers = mysqlTable("family_members", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(), // owner account
  name: varchar("name", { length: 200 }).notNull(),
  relation: varchar("relation", { length: 50 }), // self/spouse/child/parent/other
  dateOfBirth: date("dateOfBirth"),
  gender: mysqlEnum("gender", ["male", "female", "other"]),
  phone: varchar("phone", { length: 20 }),
  patientCategoryId: int("patientCategoryId"), // FK patient_categories
  chronicConditions: text("chronicConditions"), // JSON array of condition strings
  allergies: text("allergies"), // JSON array
  bloodGroup: varchar("bloodGroup", { length: 10 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const customerMedicineRecords = mysqlTable("customer_medicine_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  familyMemberId: int("familyMemberId"), // null = self
  productId: int("productId").notNull(),
  batchId: int("batchId"), // batch_ledger.id if available
  orderId: int("orderId"), // orders.id (app checkout)
  saleId: int("saleId"), // sales.id (counter billing)
  prescriptionId: int("prescriptionId"), // prescriptions.id if Rx
  purchaseType: mysqlEnum("purchaseType", [
    "prescribed",
    "otc",
    "chronic_refill",
    "counter",
    "whatsapp",
  ])
    .default("otc")
    .notNull(),
  qty: int("qty").notNull(),
  purchaseDate: timestamp("purchaseDate").notNull(),
  doctorName: varchar("doctorName", { length: 200 }),
  doctorReg: varchar("doctorReg", { length: 100 }),
  isNewMedicine: boolean("isNewMedicine").default(false).notNull(), // first time buying this
  isChronicFlag: boolean("isChronicFlag").default(false).notNull(),
  discontinued: boolean("discontinued").default(false).notNull(),
  discontinuedReason: varchar("discontinuedReason", { length: 500 }),
  discontinuedAt: timestamp("discontinuedAt"),
  pharmacistNote: text("pharmacistNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const refillPlans = mysqlTable("refill_plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  familyMemberId: int("familyMemberId"),
  productId: int("productId").notNull(),
  prescriptionId: int("prescriptionId"),
  frequencyDays: int("frequencyDays").notNull(), // e.g. 30 for monthly
  qty: int("qty").notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate"), // null = indefinite
  nextDueDate: date("nextDueDate").notNull(),
  lastFulfilledDate: date("lastFulfilledDate"),
  status: mysqlEnum("status", ["active", "paused", "completed", "cancelled"])
    .default("active")
    .notNull(),
  reminderDaysBefore: int("reminderDaysBefore").default(3).notNull(),
  whatsappReminder: boolean("whatsappReminder").default(true).notNull(),
  appReminder: boolean("appReminder").default(true).notNull(),
  prescriptionExpiryDate: date("prescriptionExpiryDate"),
  needsFreshRx: boolean("needsFreshRx").default(false).notNull(),
  createdBy: int("createdBy"), // staff/pharmacist who created
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const refillEvents = mysqlTable("refill_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  refillPlanId: int("refillPlanId").notNull(),
  userId: int("userId").notNull(),
  eventType: mysqlEnum("eventType", [
    "reminder_sent_app",
    "reminder_sent_whatsapp",
    "reminder_sent_sms",
    "refill_ordered",
    "refill_missed",
    "refill_snoozed",
    "refill_cancelled",
    "prescription_expired",
    "fresh_rx_required",
    "plan_paused",
    "plan_resumed",
  ]).notNull(),
  dueDate: date("dueDate").notNull(),
  orderId: int("orderId"),
  saleId: int("saleId"),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const dosageSchedules = mysqlTable("dosage_schedules", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  familyMemberId: int("familyMemberId"),
  prescriptionId: int("prescriptionId"),
  saleLineId: int("saleLineId"),
  productId: int("productId"),
  medicineNameSnapshot: varchar("medicineNameSnapshot", { length: 255 }),
  scheduleJson: text("scheduleJson").notNull(),
  source: mysqlEnum("source", ["prescription", "pharmacist", "user"]).notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const doseLogs = mysqlTable("dose_logs", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  scheduleId: bigint("scheduleId", { mode: "number" }).notNull(),
  userId: int("userId").notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  status: mysqlEnum("status", ["taken", "skipped", "missed"]).notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const orderRatings = mysqlTable(
  "order_ratings",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    orderId: int("orderId").notNull(),
    userId: int("userId").notNull(),
    overall: int("overall").notNull(),
    delivery: int("delivery"),
    packaging: int("packaging"),
    pharmacistSupport: int("pharmacistSupport"),
    availability: int("availability"),
    issueTagsJson: text("issueTagsJson"),
    comment: text("comment"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    orderUserUnique: uniqueIndex("order_ratings_order_user_uq").on(
      t.orderId,
      t.userId
    ),
  })
);

export const customerConsents = mysqlTable("customer_consents", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  consentType: mysqlEnum("consentType", [
    "medicine_record_storage",
    "family_profile",
    "refill_reminder_whatsapp",
    "refill_reminder_app",
    "refill_reminder_sms",
    "prescription_data_processing",
    "chronic_condition_tracking",
    "marketing_communications",
    "data_sharing_doctor",
  ]).notNull(),
  granted: boolean("granted").default(true).notNull(),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  version: varchar("version", { length: 20 }).default("1.0").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const medicineRecordAccessLog = mysqlTable(
  "medicine_record_access_log",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    targetUserId: int("targetUserId").notNull(), // whose record was accessed
    accessedBy: int("accessedBy").notNull(), // staff/pharmacist/admin
    accessType: mysqlEnum("accessType", [
      "view",
      "export",
      "admin_view",
      "api_check",
    ]).notNull(),
    purpose: varchar("purpose", { length: 200 }),
    ipAddress: varchar("ipAddress", { length: 45 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  }
);

export const userConsents = mysqlTable("user_consents", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  consentType: mysqlEnum("consentType", [
    "terms_of_service",
    "privacy_policy",
    "rx_data_processing",
    "marketing",
    "location",
  ]).notNull(),
  version: varchar("version", { length: 20 }).notNull(),
  granted: boolean("granted").default(true).notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: varchar("userAgent", { length: 500 }),
  grantedAt: timestamp("grantedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

// Master data tables — reference/clinical data
export const generics = mysqlTable("generics", {
  id: int("id").autoincrement().primaryKey(),
  genericName: varchar("genericName", { length: 300 }).notNull(),
  aliases: text("aliases"),
  therapeuticClass: varchar("therapeuticClass", { length: 200 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

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

export const patientCategories = mysqlTable("patient_categories", {
  id: int("id").autoincrement().primaryKey(),
  categoryName: varchar("categoryName", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const scheduleMaster = mysqlTable("schedule_master", {
  id: int("id").autoincrement().primaryKey(),
  scheduleCode: varchar("scheduleCode", { length: 10 }).notNull(),
  prescriptionRequired: boolean("prescriptionRequired")
    .default(false)
    .notNull(),
  pharmacistReviewRequired: boolean("pharmacistReviewRequired")
    .default(false)
    .notNull(),
  h1RegisterRequired: boolean("h1RegisterRequired").default(false).notNull(),
  repeatDispenseAllowed: boolean("repeatDispenseAllowed")
    .default(true)
    .notNull(),
  retentionPolicyDays: int("retentionPolicyDays").default(365),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type UserImportanceScore = typeof userImportanceScores.$inferSelect;
export type FamilyMember = typeof familyMembers.$inferSelect;
export type NewFamilyMember = typeof familyMembers.$inferInsert;
export type CustomerMedicineRecord =
  typeof customerMedicineRecords.$inferSelect;
export type NewCustomerMedicineRecord =
  typeof customerMedicineRecords.$inferInsert;
export type RefillPlan = typeof refillPlans.$inferSelect;
export type NewRefillPlan = typeof refillPlans.$inferInsert;
export type RefillEvent = typeof refillEvents.$inferSelect;
export type NewRefillEvent = typeof refillEvents.$inferInsert;
export type CustomerConsent = typeof customerConsents.$inferSelect;
export type NewCustomerConsent = typeof customerConsents.$inferInsert;
export type MedicineRecordAccessLog =
  typeof medicineRecordAccessLog.$inferSelect;
export type Generic = typeof generics.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
