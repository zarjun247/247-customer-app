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
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    // Actor
    actorId: int("actorId"),
    actorType: varchar("actorType", { length: 50 }).default("user"), // user | system | whatsapp | scheduled
    actorRole: varchar("actorRole", { length: 50 }),
    // Legacy compat
    userId: int("userId"),
    // Action
    action: varchar("action", { length: 200 }).notNull(),
    entityType: varchar("entityType", { length: 100 }),
    entityId: int("entityId"),
    // Before/after state
    beforeJson: text("beforeJson"),
    afterJson: text("afterJson"),
    payload: text("payload"),
    reason: varchar("reason", { length: 500 }),
    // Request context
    ipAddress: varchar("ipAddress", { length: 45 }),
    userAgent: text("userAgent"),
    sessionId: varchar("sessionId", { length: 200 }),
    deviceId: varchar("deviceId", { length: 200 }),
    channel: varchar("channel", { length: 50 }).default("app"), // app | whatsapp | admin | api
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    idxAuditLogsActorCreated: index("idx_audit_logs_actor_created").on(
      t.actorId,
      t.createdAt
    ),
    idxAuditLogsEntityCreated: index("idx_audit_logs_entity_created").on(
      t.entityType,
      t.entityId,
      t.createdAt
    ),
    idxAuditLogsActionCreated: index("idx_audit_logs_action_created").on(
      t.action,
      t.createdAt
    ),
  })
);

// ─── Commercial Event Ledger (append-only lifecycle foundation) ───────────────
export const commercialEvents = mysqlTable(
  "commercial_events",
  {
    eventId: varchar("eventId", { length: 36 }).primaryKey(),
    aggregateType: varchar("aggregateType", { length: 64 }).notNull(),
    aggregateId: varchar("aggregateId", { length: 100 }).notNull(),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    eventVersion: int("eventVersion").notNull().default(1),
    actorType: varchar("actorType", { length: 50 }).notNull().default("system"),
    actorId: varchar("actorId", { length: 100 }),
    storeId: varchar("storeId", { length: 100 }),
    orderId: varchar("orderId", { length: 100 }),
    saleId: varchar("saleId", { length: 100 }),
    invoiceId: varchar("invoiceId", { length: 100 }),
    reservationId: varchar("reservationId", { length: 100 }),
    paymentId: varchar("paymentId", { length: 100 }),
    refundId: varchar("refundId", { length: 100 }),
    eventPayload: text("eventPayload").notNull(),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 200 }),
    correlationId: varchar("correlationId", { length: 100 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    idxCommercialEventsAggregate: index("idx_commercial_events_aggregate").on(
      t.aggregateType,
      t.aggregateId
    ),
    idxCommercialEventsOccurredAt: index(
      "idx_commercial_events_occurred_at"
    ).on(t.occurredAt),
    uqCommercialEventsIdempotencyKey: uniqueIndex(
      "uq_commercial_events_idempotency_key"
    ).on(t.idempotencyKey),
    idxCommercialEventsCorrelationId: index(
      "idx_commercial_events_correlation_id"
    ).on(t.correlationId),
    idxCommercialEventsOrderId: index("idx_commercial_events_order_id").on(
      t.orderId
    ),
    idxCommercialEventsPaymentId: index("idx_commercial_events_payment_id").on(
      t.paymentId
    ),
    idxCommercialEventsInvoiceId: index("idx_commercial_events_invoice_id").on(
      t.invoiceId
    ),
  })
);

// ─── Privacy / Consent / Staff Session Security Foundation ───────────────────
export const privacyConsents = mysqlTable("privacy_consents", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId"),
  customerId: int("customerId"),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  consentType: mysqlEnum("consentType", [
    "prescription_storage",
    "refill_reminder",
    "dosage_reminder",
    "whatsapp_transactional",
    "whatsapp_marketing",
    "sms_transactional",
    "sms_marketing",
    "family_profile_access",
    "invoice_claim_bundle",
  ]).notNull(),
  status: mysqlEnum("status", ["granted", "revoked", "pending"])
    .default("pending")
    .notNull(),
  source: mysqlEnum("source", ["app", "staff", "whatsapp", "import", "system"])
    .default("app")
    .notNull(),
  grantedAt: timestamp("grantedAt"),
  revokedAt: timestamp("revokedAt"),
  changedBy: int("changedBy"),
  auditRef: varchar("auditRef", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const staffAcknowledgements = mysqlTable("staff_acknowledgements", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  staffId: int("staffId").notNull(),
  acknowledgementType: mysqlEnum("acknowledgementType", [
    "patient_data_confidentiality",
    "prescription_handling",
    "H1_register_handling",
    "payment_data_handling",
    "no_shared_accounts",
  ]).notNull(),
  version: varchar("version", { length: 40 }).notNull(),
  acceptedAt: timestamp("acceptedAt").notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: varchar("userAgent", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const staffDeviceSessions = mysqlTable(
  "staff_device_sessions",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    staffId: int("staffId").notNull(),
    sessionId: varchar("sessionId", { length: 200 }).notNull(),
    deviceId: varchar("deviceId", { length: 200 }),
    terminalId: varchar("terminalId", { length: 100 }),
    ipAddress: varchar("ipAddress", { length: 45 }),
    userAgent: varchar("userAgent", { length: 500 }),
    status: mysqlEnum("status", ["active", "revoked", "expired"])
      .default("active")
      .notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
    revokedBy: int("revokedBy"),
    revokeReason: varchar("revokeReason", { length: 500 }),
    privilegedLastSeenAt: timestamp("privilegedLastSeenAt"),
    requiresReauth: boolean("requiresReauth").default(false).notNull(),
    suspicious: boolean("suspicious").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    staffSessionUnique: uniqueIndex(
      "staff_device_sessions_staff_session_uq"
    ).on(t.staffId, t.sessionId),
    staffSessionLookupIdx: index(
      "staff_device_sessions_staff_session_status_idx"
    ).on(t.staffId, t.sessionId, t.status),
  })
);

// ─── MP7: Audit Hash Chain (migration 0054) ───────────────────────────────────
export const auditLogChain = mysqlTable(
  "audit_log_chain",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    auditLogId: bigint("audit_log_id", { mode: "number" }),
    sequenceNumber: bigint("sequence_number", { mode: "number" }).notNull(),
    prevHash: varchar("prev_hash", { length: 64 }).notNull(),
    rowHash: varchar("row_hash", { length: 64 }).notNull(),
    hashedPayload: json("hashed_payload").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  t => ({
    uqAuditChainSequence: uniqueIndex("uq_audit_chain_sequence").on(
      t.sequenceNumber
    ),
    uqAuditChainRowHash: uniqueIndex("uq_audit_chain_row_hash").on(t.rowHash),
    idxAuditChainSeq: index("idx_audit_chain_seq").on(t.sequenceNumber),
    idxAuditChainAudit: index("idx_audit_chain_audit").on(t.auditLogId),
  })
);

// ─── MP7: PII Encryption Keys (migration 0055) ────────────────────────────────
export const piiEncryptionKeys = mysqlTable(
  "pii_encryption_keys",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    keyVersion: int("key_version").notNull(),
    scope: varchar("scope", { length: 64 }).notNull(),
    wrappedDataKey: text("wrapped_data_key").notNull(), // base64-encoded wrapped binary
    algorithm: varchar("algorithm", { length: 32 })
      .notNull()
      .default("aes-256-gcm"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    rotatedFromId: varchar("rotated_from_id", { length: 36 }),
    retiredAt: timestamp("retired_at"),
  },
  t => ({
    uqPiiKeysScopeVersion: uniqueIndex("uq_pii_keys_scope_version").on(
      t.scope,
      t.keyVersion
    ),
    idxPiiKeysScope: index("idx_pii_keys_scope").on(t.scope, t.keyVersion),
    idxPiiKeysRetired: index("idx_pii_keys_retired").on(t.retiredAt),
  })
);

// ─── MP7: Capability Grants (migration 0056) ──────────────────────────────────
export const capabilityDefinitions = mysqlTable("capability_definitions", {
  capabilityName: varchar("capability_name", { length: 128 })
    .notNull()
    .primaryKey(),
  description: text("description").notNull(),
  riskLevel: varchar("risk_level", { length: 16 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const capabilityGrants = mysqlTable(
  "capability_grants",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    capabilityName: varchar("capability_name", { length: 128 }).notNull(),
    grantedByUserId: varchar("granted_by_user_id", { length: 36 }),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    revokedByUserId: varchar("revoked_by_user_id", { length: 36 }),
    reason: text("reason"),
  },
  t => ({
    uqCapabilityGrantsUserCap: uniqueIndex("uq_capability_grants_user_cap").on(
      t.userId,
      t.capabilityName,
      t.grantedAt
    ),
    idxCapabilityGrantsUser: index("idx_capability_grants_user").on(
      t.userId,
      t.capabilityName
    ),
    idxCapabilityGrantsRevoked: index("idx_capability_grants_revoked").on(
      t.revokedAt
    ),
  })
);

// ─── Command Log (MP5: executeCommand audit trail) ────────────────────────────
export const commandLog = mysqlTable(
  "command_log",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    commandName: varchar("command_name", { length: 128 }).notNull(),
    commandVersion: int("command_version").notNull().default(1),
    actorUserId: varchar("actor_user_id", { length: 36 }),
    actorRole: varchar("actor_role", { length: 64 }),
    storeId: varchar("store_id", { length: 36 }),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    inputPayload: json("input_payload").notNull(),
    outputPayload: json("output_payload"),
    state: varchar("state", { length: 32 }).notNull(),
    errorClass: varchar("error_class", { length: 128 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    durationMs: int("duration_ms"),
    traceId: varchar("trace_id", { length: 64 }),
  },
  t => ({
    uqCommandLogIdempotency: uniqueIndex("uq_command_log_idempotency").on(
      t.idempotencyKey,
      t.commandName
    ),
    idxCommandLogStateStarted: index("idx_command_log_state_started").on(
      t.state,
      t.startedAt
    ),
    idxCommandLogActorStarted: index("idx_command_log_actor_started").on(
      t.actorUserId,
      t.startedAt
    ),
    idxCommandLogStoreStarted: index("idx_command_log_store_started").on(
      t.storeId,
      t.startedAt
    ),
    idxCommandLogCommandStarted: index("idx_command_log_command_started").on(
      t.commandName,
      t.startedAt
    ),
  })
);

// ─── Command Outbox (MP5: transactional outbox for side effects) ──────────────
export const commandOutbox = mysqlTable(
  "command_outbox",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    commandLogId: varchar("command_log_id", { length: 36 }).notNull(),
    sideEffectKind: varchar("side_effect_kind", { length: 64 }).notNull(),
    sideEffectPayload: json("side_effect_payload").notNull(),
    state: varchar("state", { length: 32 }).notNull().default("pending"),
    attempts: int("attempts").notNull().default(0),
    maxAttempts: int("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at").defaultNow().notNull(),
    lastErrorMessage: text("last_error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    dispatchedAt: timestamp("dispatched_at"),
    failedAt: timestamp("failed_at"),
  },
  t => ({
    idxCommandOutboxStateNext: index("idx_command_outbox_state_next").on(
      t.state,
      t.nextAttemptAt
    ),
    idxCommandOutboxKindState: index("idx_command_outbox_kind_state").on(
      t.sideEffectKind,
      t.state
    ),
  })
);

// ─── SM-B: Consent Notice Versions (migration 0058) ──────────────────────────
export const consentNoticeVersions = mysqlTable(
  "consent_notice_versions",
  {
    id: int("id").autoincrement().primaryKey(),
    noticeKind: varchar("notice_kind", { length: 64 }).notNull(),
    version: varchar("version", { length: 32 }).notNull(),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveUntil: timestamp("effective_until"),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    contentText: text("content_text").notNull(),
    language: varchar("language", { length: 8 }).notNull().default("en"),
    publishedByUserId: int("published_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  t => ({
    uqConsentNoticeKindVersionLang: uniqueIndex(
      "uq_consent_notice_kind_version_lang"
    ).on(t.noticeKind, t.version, t.language),
    idxConsentNoticeActive: index("idx_consent_notice_active").on(
      t.noticeKind,
      t.effectiveUntil,
      t.effectiveFrom
    ),
  })
);

// ─── SM-B: DSR Requests (migration 0059) ─────────────────────────────────────
export const dsrRequests = mysqlTable(
  "dsr_requests",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    customerId: int("customer_id").notNull(),
    requestKind: varchar("request_kind", { length: 32 }).notNull(),
    requestStatus: varchar("request_status", { length: 32 }).notNull(),
    requestPayload: json("request_payload"),
    responsePayload: json("response_payload"),
    confirmationToken: varchar("confirmation_token", { length: 64 }),
    confirmationExpiresAt: timestamp("confirmation_expires_at"),
    confirmedAt: timestamp("confirmed_at"),
    processedByUserId: int("processed_by_user_id"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  t => ({
    idxDsrCustomer: index("idx_dsr_customer").on(t.customerId, t.createdAt),
    idxDsrStatus: index("idx_dsr_status").on(t.requestStatus, t.createdAt),
    idxDsrKind: index("idx_dsr_kind").on(t.requestKind, t.requestStatus),
  })
);

// ─── SM-E: DSR SLA Monitor Log (migration 0065) ──────────────────────────────
export const dsrSlaMonitorLog = mysqlTable(
  "dsr_sla_monitor_log",
  {
    id: int("id").autoincrement().primaryKey(),
    dsrRequestId: varchar("dsr_request_id", { length: 36 }).notNull(),
    alertKind: varchar("alert_kind", { length: 32 }).notNull(),
    daysToSla: int("days_to_sla").notNull(),
    notifiedRecipientsJson: json("notified_recipients_json").notNull(),
    detectedAt: timestamp("detected_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  t => ({
    idxDsrSlaRequest: index("idx_dsr_sla_request").on(
      t.dsrRequestId,
      t.detectedAt
    ),
    idxDsrSlaKind: index("idx_dsr_sla_kind").on(t.alertKind, t.detectedAt),
  })
);

// ─── SM-LM Phase 11: DSR Nominees (migration 0074) ───────────────────────────
export const dsrNominees = mysqlTable(
  "dsr_nominees",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    userId: int("user_id").notNull(),
    nomineeName: varchar("nominee_name", { length: 200 }).notNull(),
    nomineeEmail: varchar("nominee_email", { length: 320 }).notNull(),
    nomineePhone: varchar("nominee_phone", { length: 20 }),
    relationship: varchar("relationship", { length: 100 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  t => ({
    idxDsrNomineesUser: index("idx_dsr_nominees_user").on(t.userId, t.isActive),
    idxDsrNomineesEmail: index("idx_dsr_nominees_email").on(t.nomineeEmail),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────
export type DsrSlaMonitorLog = typeof dsrSlaMonitorLog.$inferSelect;
export type NewDsrSlaMonitorLog = typeof dsrSlaMonitorLog.$inferInsert;
export type ConsentNoticeVersion = typeof consentNoticeVersions.$inferSelect;
export type NewConsentNoticeVersion = typeof consentNoticeVersions.$inferInsert;
export type DsrRequest = typeof dsrRequests.$inferSelect;
export type NewDsrRequest = typeof dsrRequests.$inferInsert;

export type PrivacyConsent = typeof privacyConsents.$inferSelect;
export type NewPrivacyConsent = typeof privacyConsents.$inferInsert;
export type StaffAcknowledgement = typeof staffAcknowledgements.$inferSelect;
export type NewStaffAcknowledgement = typeof staffAcknowledgements.$inferInsert;
export type StaffDeviceSession = typeof staffDeviceSessions.$inferSelect;
export type NewStaffDeviceSession = typeof staffDeviceSessions.$inferInsert;
export type CommercialEvent = typeof commercialEvents.$inferSelect;
export type NewCommercialEvent = typeof commercialEvents.$inferInsert;
export type AuditLogChainRecord = typeof auditLogChain.$inferSelect;
export type NewAuditLogChainRecord = typeof auditLogChain.$inferInsert;
export type PiiEncryptionKeyRecord = typeof piiEncryptionKeys.$inferSelect;
export type NewPiiEncryptionKeyRecord = typeof piiEncryptionKeys.$inferInsert;
export type CapabilityDefinitionRecord =
  typeof capabilityDefinitions.$inferSelect;
export type CapabilityGrantRecord = typeof capabilityGrants.$inferSelect;
export type NewCapabilityGrantRecord = typeof capabilityGrants.$inferInsert;
export type CommandLogRecord = typeof commandLog.$inferSelect;
export type NewCommandLogRecord = typeof commandLog.$inferInsert;
export type CommandOutboxRecord = typeof commandOutbox.$inferSelect;
export type NewCommandOutboxRecord = typeof commandOutbox.$inferInsert;
export type DsrNominee = typeof dsrNominees.$inferSelect;
export type NewDsrNominee = typeof dsrNominees.$inferInsert;
