import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  bigint,
  json,
  smallint,
  index,
} from "drizzle-orm/mysql-core";

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
  ])
    .default("pending_ocr")
    .notNull(),
  // Rx lane classification
  lane: mysqlEnum("lane", [
    "otc",
    "digital",
    "on_file",
    "fallback",
    "doctor_consult",
  ])
    .default("digital")
    .notNull(),
  // Doctor / prescription metadata
  doctorName: varchar("doctorName", { length: 200 }),
  doctorReg: varchar("doctorReg", { length: 100 }), // MCI/state registration number (legacy)
  doctorRegNo: varchar("doctorRegNo", { length: 100 }),
  clinicName: varchar("clinicName", { length: 200 }),
  prescribedDate: timestamp("prescribedDate"),
  prescriptionDate: timestamp("prescriptionDate"),
  expiryDate: timestamp("expiryDate"), // Rx valid until (typically 6 months; legacy)
  validUntil: timestamp("validUntil"),
  // Linked products (JSON array of productIds extracted from Rx)
  linkedProductIds: text("linkedProductIds"),
  source: mysqlEnum("source", [
    "upload",
    "whatsapp",
    "doctor",
    "pharmacist",
    "manual",
  ]).default("upload"),
  consentGivenAt: timestamp("consentGivenAt"),
  consentSource: mysqlEnum("consentSource", [
    "app",
    "whatsapp",
    "pharmacist",
    "doctor",
    "manual",
  ]),
  consentRevokedAt: timestamp("consentRevokedAt"),
  onFileMarkedBy: int("onFileMarkedBy"),
  onFileMarkedAt: timestamp("onFileMarkedAt"),
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
  // Patient details
  patientName: varchar("patientName", { length: 300 }),
  patientPhone: varchar("patientPhone", { length: 500 }), // widened: AES-GCM envelope needs ~67 chars
  patientAddress: text("patientAddress"),
  // Clarification workflow
  clarificationNote: text("clarificationNote"),
  clarificationRequestedAt: timestamp("clarificationRequestedAt"),
  // Repeat dispense
  repeatDispenseCount: int("repeatDispenseCount").default(0),
  repeatDispenseMax: int("repeatDispenseMax").default(1),
  // Links to sale/order
  linkedSaleId: int("linkedSaleId"),
  linkedOrderId: int("linkedOrderId"),
  // SM-B migration 0061: key version for field-level PII encryption
  encryptionKeyVersion: smallint("encryption_key_version").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Rx Prior Approvals ───────────────────────────────────────────────────────
export const rxPriorApprovals = mysqlTable("rx_prior_approvals", {
  id: int("id").autoincrement().primaryKey(),
  rxId: int("rxId").notNull(), // FK → prescriptions.id
  approvedByPharmacistId: int("approvedByPharmacistId").notNull(),
  validUntil: timestamp("validUntil").notNull(),
  linkedProductIds: text("linkedProductIds"), // JSON array of productIds
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

// ─── PART 8: Prescription Governance ─────────────────────────────────────────
export const prescriptionLines = mysqlTable("prescription_lines", {
  id: int("id").autoincrement().primaryKey(),
  prescriptionId: int("prescriptionId").notNull(),
  lineNo: int("lineNo").notNull().default(1),
  drugName: varchar("drugName", { length: 300 }).notNull(),
  genericName: varchar("genericName", { length: 300 }),
  strength: varchar("strength", { length: 100 }),
  dosageForm: varchar("dosageForm", { length: 100 }),
  qty: int("qty"),
  duration: varchar("duration", { length: 100 }),
  frequency: varchar("frequency", { length: 100 }),
  instructions: text("instructions"),
  scheduleCode: mysqlEnum("scheduleCode", [
    "OTC",
    "Rx",
    "H",
    "H1",
    "X",
    "NRX",
  ]).default("Rx"),
  requiresH1: int("requiresH1").default(0),
  status: mysqlEnum("status", [
    "pending",
    "approved",
    "rejected",
    "clarification_needed",
  ]).default("pending"),
  pharmacistNote: text("pharmacistNote"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  linkedProductId: int("linkedProductId"),
  linkedBatchNo: varchar("linkedBatchNo", { length: 100 }),
  linkedSaleLineId: int("linkedSaleLineId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const prescriptionAccessLog = mysqlTable("prescription_access_log", {
  id: int("id").autoincrement().primaryKey(),
  prescriptionId: int("prescriptionId").notNull(),
  accessedBy: int("accessedBy").notNull(),
  actorId: int("actorId"),
  actorRole: varchar("actorRole", { length: 50 }),
  accessType: mysqlEnum("accessType", [
    "view",
    "download",
    "print",
    "api_check",
    "audit",
  ]).default("view"),
  ipAddress: varchar("ipAddress", { length: 50 }),
  userAgent: text("userAgent"),
  purpose: text("purpose"),
  channel: varchar("channel", { length: 50 }).default("app"),
  accessedAt: timestamp("accessedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── SM-B: Family Consent (migration 0060) ────────────────────────────────────
export const familyConsent = mysqlTable(
  "family_consent",
  {
    id: int("id").autoincrement().primaryKey(),
    minorCustomerId: int("minor_customer_id").notNull(),
    guardianCustomerId: int("guardian_customer_id"),
    guardianName: varchar("guardian_name", { length: 255 }).notNull(),
    guardianRelationship: varchar("guardian_relationship", {
      length: 64,
    }).notNull(),
    guardianIdProofKind: varchar("guardian_id_proof_kind", { length: 32 }),
    guardianIdProofLast4: varchar("guardian_id_proof_last4", { length: 8 }),
    consentScopeJson: json("consent_scope_json").notNull(),
    consentSignedAt: timestamp("consent_signed_at").notNull(),
    consentRevokedAt: timestamp("consent_revoked_at"),
    consentDocStoragePath: varchar("consent_doc_storage_path", { length: 500 }),
    recordedByUserId: int("recorded_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  t => ({
    idxFamilyConsentMinor: index("idx_family_consent_minor").on(
      t.minorCustomerId
    ),
    idxFamilyConsentGuardian: index("idx_family_consent_guardian").on(
      t.guardianCustomerId
    ),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────
export type FamilyConsentRecord = typeof familyConsent.$inferSelect;
export type NewFamilyConsent = typeof familyConsent.$inferInsert;

export type Prescription = typeof prescriptions.$inferSelect;
export type RxPriorApproval = typeof rxPriorApprovals.$inferSelect;
export type PrescriptionLine = typeof prescriptionLines.$inferSelect;
export type NewPrescriptionLine = typeof prescriptionLines.$inferInsert;
export type PrescriptionAccessLog = typeof prescriptionAccessLog.$inferSelect;
