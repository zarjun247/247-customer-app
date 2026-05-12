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
  date,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── PART 12: system_events — event bus persistence ──────────────────────────
export const systemEvents = mysqlTable("system_events", {
  id: int("id").autoincrement().primaryKey(),
  eventType: mysqlEnum("eventType", [
    "order_placed",
    "rx_uploaded",
    "rx_approved",
    "rx_rejected",
    "stock_reserved",
    "picking_started",
    "packed",
    "rider_assigned",
    "delivered",
    "delivery_failed",
    "refill_due",
    "payment_received",
    "payment_failed",
    "purchase_committed",
    "stock_adjusted",
    "batch_quarantined",
    "manual_override",
    "sla_breach_risk",
    "sync_stale",
    "ocr_pending",
    "order_cancelled",
    "whatsapp_order",
    "counter_sale",
    "pharmacist_approved",
    "out_for_delivery",
  ]).notNull(),
  entityType: varchar("entityType", { length: 50 }), // "order" | "prescription" | "batch" | "refill_plan" etc
  entityId: int("entityId"),
  storeId: int("storeId"),
  actorId: int("actorId"),
  actorType: mysqlEnum("actorType", [
    "customer",
    "pharmacist",
    "rider",
    "system",
    "admin",
    "whatsapp",
  ])
    .default("system")
    .notNull(),
  payload: text("payload"), // JSON blob for event-specific data
  severity: mysqlEnum("severity", ["info", "warning", "critical"])
    .default("info")
    .notNull(),
  channel: mysqlEnum("channel", [
    "app",
    "whatsapp",
    "counter",
    "system",
    "import",
  ])
    .default("system")
    .notNull(),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
  isProcessed: boolean("isProcessed").default(false).notNull(),
});

// ─── Worker Queue Reliability Layer ──────────────────────────────────────────
export const workerJobs = mysqlTable(
  "worker_jobs",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    queueName: varchar("queueName", { length: 100 }).notNull(),
    jobType: varchar("jobType", { length: 150 }).notNull(),
    payloadJson: json("payloadJson").notNull(),
    payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 200 }).notNull(),
    correlationId: varchar("correlationId", { length: 100 }),
    relatedEntityType: varchar("relatedEntityType", { length: 100 }),
    relatedEntityId: varchar("relatedEntityId", { length: 100 }),
    status: mysqlEnum("status", [
      "queued",
      "reserved",
      "running",
      "completed",
      "failed",
      "retry_scheduled",
      "dead_letter",
      "cancelled",
      "expired",
    ])
      .default("queued")
      .notNull(),
    priority: int("priority").default(0).notNull(),
    retryCount: int("retryCount").default(0).notNull(),
    maxRetries: int("maxRetries").default(3).notNull(),
    nextRetryAt: timestamp("nextRetryAt"),
    workerId: varchar("workerId", { length: 100 }),
    reservedAt: timestamp("reservedAt"),
    completedAt: timestamp("completedAt"),
    failureReason: text("failureReason"),
    deadLetterReason: text("deadLetterReason"),
    deadLetterClass: varchar("deadLetterClass", { length: 80 }),
    resolvedAt: timestamp("resolvedAt"),
    resolvedBy: varchar("resolvedBy", { length: 100 }),
    resolutionNote: text("resolutionNote"),
    heartbeatAt: timestamp("heartbeatAt"),
    replayOfJobId: bigint("replayOfJobId", { mode: "number" }),
    auditTrailJson: json("auditTrailJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idxWorkerJobsQueueStatus: index("idx_worker_jobs_queue_status").on(
      t.queueName,
      t.status
    ),
    idxWorkerJobsNextRetryAt: index("idx_worker_jobs_next_retry_at").on(
      t.nextRetryAt
    ),
    uqWorkerJobsIdempotencyKey: uniqueIndex(
      "uq_worker_jobs_idempotency_key"
    ).on(t.idempotencyKey),
    idxWorkerJobsCorrelationId: index("idx_worker_jobs_correlation_id").on(
      t.correlationId
    ),
    idxWorkerJobsCreatedAt: index("idx_worker_jobs_created_at").on(t.createdAt),
    idxWorkerJobsHeartbeatAt: index("idx_worker_jobs_heartbeat_at").on(
      t.heartbeatAt
    ),
  })
);

// ─── SLO Events ───────────────────────────────────────────────────────────────
export const sloEvents = mysqlTable(
  "slo_events",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    sloName: varchar("sloName", { length: 80 }).notNull(),
    target: decimal("target", { precision: 8, scale: 4 }).notNull(),
    measuredValue: decimal("measuredValue", {
      precision: 10,
      scale: 4,
    }).notNull(),
    withinBudget: boolean("withinBudget").notNull(),
    sampleCount: int("sampleCount").notNull().default(1),
    windowSeconds: int("windowSeconds").notNull().default(60),
    context: json("context"),
    measuredAt: timestamp("measuredAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    idxSloEventsNameMeasured: index("idx_slo_events_name_measured").on(
      t.sloName,
      t.measuredAt
    ),
    idxSloEventsWithinBudget: index("idx_slo_events_within_budget").on(
      t.withinBudget,
      t.measuredAt
    ),
  })
);

// ─── Reservations (MP6: reservation ledger) ───────────────────────────────────
export const reservations = mysqlTable(
  "reservations",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    storeId: int("store_id").notNull(),
    customerId: int("customer_id"),
    cartId: int("cart_id"),
    saleId: varchar("sale_id", { length: 36 }),
    state: varchar("state", { length: 32 }).notNull(),
    ttlSeconds: int("ttl_seconds").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    releasedAt: timestamp("released_at"),
    expiredAt: timestamp("expired_at"),
    commandLogId: varchar("command_log_id", { length: 36 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
  },
  t => ({
    idxReservationsStateExpires: index("idx_reservations_state_expires").on(
      t.state,
      t.expiresAt
    ),
    idxReservationsStoreState: index("idx_reservations_store_state").on(
      t.storeId,
      t.state
    ),
    idxReservationsCustomerState: index("idx_reservations_customer_state").on(
      t.customerId,
      t.state
    ),
    idxReservationsCart: index("idx_reservations_cart").on(t.cartId),
    idxReservationsSale: index("idx_reservations_sale").on(t.saleId),
    idxReservationsIdempotency: index("idx_reservations_idempotency").on(
      t.idempotencyKey
    ),
  })
);

export const reservationLines = mysqlTable(
  "reservation_lines",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    reservationId: varchar("reservation_id", { length: 36 }).notNull(),
    productId: int("product_id").notNull(),
    batchId: int("batch_id").notNull(),
    variantId: int("variant_id"),
    quantity: int("quantity").notNull(),
    expiryDate: date("expiry_date").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  t => ({
    idxReservationLinesProductBatch: index(
      "idx_reservation_lines_product_batch"
    ).on(t.productId, t.batchId),
    idxReservationLinesReservation: index(
      "idx_reservation_lines_reservation"
    ).on(t.reservationId),
    idxReservationLinesBatch: index("idx_reservation_lines_batch").on(
      t.batchId
    ),
  })
);

export const stockLockKeys = mysqlTable(
  "stock_lock_keys",
  {
    lockKey: varchar("lock_key", { length: 128 }).notNull().primaryKey(),
    acquiredBy: varchar("acquired_by", { length: 36 }).notNull(),
    acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  t => ({
    idxStockLockKeysExpires: index("idx_stock_lock_keys_expires").on(
      t.expiresAt
    ),
  })
);

// ─── Ledgers ──────────────────────────────────────────────────────────────────
export const ledgers = mysqlTable("ledgers", {
  id: int("id").autoincrement().primaryKey(),
  ledgerName: varchar("ledgerName", { length: 200 }).notNull(),
  ledgerType: mysqlEnum("ledgerType", [
    "supplier",
    "customer",
    "sales",
    "purchases",
    "gst_output",
    "gst_input",
    "cash",
    "bank",
    "upi_settlement",
    "discounts",
    "purchase_returns",
    "sales_returns",
    "stock_adjustment",
    "expiry_loss",
    "gross_margin",
    "expenses",
  ]).notNull(),
  storeId: int("storeId"),
  supplierId: int("supplierId"),
  customerId: int("customerId"),
  openingBalance: decimal("openingBalance", {
    precision: 14,
    scale: 2,
  }).default("0.00"),
  currentBalance: decimal("currentBalance", {
    precision: 14,
    scale: 2,
  }).default("0.00"),
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

// ─── Report Exports ───────────────────────────────────────────────────────────
export const reportExports = mysqlTable("report_exports", {
  id: int("id").autoincrement().primaryKey(),
  reportType: varchar("reportType", { length: 100 }).notNull(),
  parameters: text("parameters"),
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  status: mysqlEnum("status", ["queued", "generating", "ready", "failed"])
    .default("queued")
    .notNull(),
  requestedBy: int("requestedBy").notNull(),
  storeId: int("storeId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

// ─── System Settings ──────────────────────────────────────────────────────────
export const systemSettings = mysqlTable("system_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 200 }).notNull(),
  settingValue: text("settingValue"),
  settingType: mysqlEnum("settingType", ["string", "number", "boolean", "json"])
    .default("string")
    .notNull(),
  description: text("description"),
  isLocked: boolean("isLocked").default(false).notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Phase 6: Workflow Events (State Machine Audit Trail) ─────────────────────
export const workflowEvents = mysqlTable("workflow_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  entityType: mysqlEnum("entityType", [
    "order",
    "prescription",
    "refill",
    "delivery",
    "po",
    "grn",
  ]).notNull(),
  entityId: int("entityId").notNull(),
  fromState: varchar("fromState", { length: 100 }),
  toState: varchar("toState", { length: 100 }).notNull(),
  triggeredByUserId: int("triggeredByUserId"),
  triggeredBySystem: boolean("triggeredBySystem").default(false).notNull(),
  payload: text("payload"), // JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Priority 9: Helpdesk / Grievance ─────────────────────────────────────────
export const helpdeskTickets = mysqlTable("helpdesk_tickets", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  orderId: int("orderId"),
  prescriptionId: int("prescriptionId"),
  category: mysqlEnum("category", [
    "order",
    "prescription",
    "delivery",
    "billing",
    "product",
    "account",
    "other",
  ])
    .default("other")
    .notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"])
    .default("open")
    .notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"])
    .default("normal")
    .notNull(),
  assignedTo: int("assignedTo"),
  resolvedAt: timestamp("resolvedAt"),
  resolutionNote: text("resolutionNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Printers ─────────────────────────────────────────────────────────────────
export const printers = mysqlTable("printers", {
  id: int("id").autoincrement().primaryKey(),
  printerName: varchar("printerName", { length: 200 }).notNull(),
  printerType: mysqlEnum("printerType", ["bill", "barcode", "a4", "thermal"])
    .default("thermal")
    .notNull(),
  assignedTerminal: varchar("assignedTerminal", { length: 100 }),
  assignedStoreId: int("assignedStoreId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const idempotencyKeys = mysqlTable(
  "idempotency_keys",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    key: varchar("key", { length: 191 }).notNull(),
    scope: varchar("scope", { length: 100 }).notNull(),
    operationType: varchar("operationType", { length: 120 }).notNull(),
    actorId: int("actorId"),
    storeId: int("storeId"),
    entityType: varchar("entityType", { length: 100 }),
    entityId: varchar("entityId", { length: 120 }),
    status: mysqlEnum("status", ["started", "completed", "failed"])
      .notNull()
      .default("started"),
    requestHash: varchar("requestHash", { length: 255 }),
    resultJson: json("resultJson"),
    errorJson: json("errorJson"),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    uniqKeyScope: uniqueIndex("idempotency_keys_key_scope_uidx").on(
      t.key,
      t.scope
    ),
  })
);

// ─── Provider Webhook Events ──────────────────────────────────────────────────
export const providerWebhookEvents = mysqlTable(
  "provider_webhook_events",
  {
    id: int("id").autoincrement().primaryKey(),
    provider: varchar("provider", { length: 50 }).notNull(),
    providerEventId: varchar("providerEventId", { length: 150 }),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    paymentId: int("paymentId"),
    orderId: int("orderId"),
    refundId: varchar("refundId", { length: 150 }),
    rawPayloadHash: varchar("rawPayloadHash", { length: 64 }).notNull(),
    payloadJson: json("payloadJson"),
    signatureVerified: boolean("signatureVerified").default(false).notNull(),
    processingStatus: mysqlEnum("processingStatus", [
      "received",
      "verified",
      "ignored_duplicate",
      "processed",
      "failed",
      "retry_scheduled",
      "dead_letter",
      "rejected_signature",
      "unsupported_event",
    ])
      .default("received")
      .notNull(),
    attemptCount: int("attemptCount").default(0).notNull(),
    maxAttempts: int("maxAttempts").default(3).notNull(),
    nextRetryAt: timestamp("nextRetryAt"),
    lastAttemptAt: timestamp("lastAttemptAt"),
    processedAt: timestamp("processedAt"),
    failureReason: text("failureReason"),
    idempotencyKey: varchar("idempotencyKey", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    uqProviderEventId: uniqueIndex(
      "provider_webhook_events_provider_event_id_uq"
    ).on(t.provider, t.providerEventId),
    uqProviderIdempotencyKey: uniqueIndex(
      "provider_webhook_events_idempotency_key_uq"
    ).on(t.provider, t.idempotencyKey),
    idxProviderWebhookPayloadHash: index(
      "idx_provider_webhook_events_payload_hash"
    ).on(t.rawPayloadHash),
    idxProviderWebhookPayment: index("idx_provider_webhook_events_payment").on(
      t.paymentId
    ),
    idxProviderWebhookOrder: index("idx_provider_webhook_events_order").on(
      t.orderId
    ),
    idxProviderWebhookRefund: index("idx_provider_webhook_events_refund").on(
      t.refundId
    ),
  })
);

export const providerDeadLetters = mysqlTable(
  "provider_dead_letters",
  {
    id: int("id").autoincrement().primaryKey(),
    providerEventId: int("providerEventId").notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    paymentId: int("paymentId"),
    orderId: int("orderId"),
    refundId: varchar("refundId", { length: 150 }),
    rawPayloadHash: varchar("rawPayloadHash", { length: 64 }).notNull(),
    failureReason: text("failureReason"),
    attemptCount: int("attemptCount").default(0).notNull(),
    deadLetterClass: varchar("deadLetterClass", { length: 80 }).notNull(),
    reviewStatus: mysqlEnum("reviewStatus", [
      "pending_review",
      "resolved",
      "replayed",
    ])
      .default("pending_review")
      .notNull(),
    reviewedBy: varchar("reviewedBy", { length: 100 }),
    reviewedAt: timestamp("reviewedAt"),
    reviewNote: text("reviewNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    uqProviderDeadLettersEvent: uniqueIndex(
      "uq_provider_dead_letters_event"
    ).on(t.providerEventId),
    idxProviderDeadLettersStatus: index("idx_provider_dead_letters_status").on(
      t.reviewStatus
    ),
    idxProviderDeadLettersProviderCreated: index(
      "idx_provider_dead_letters_provider_created"
    ).on(t.provider, t.createdAt),
  })
);

export const barcodeAliases = mysqlTable(
  "barcode_aliases",
  {
    id: int("id").autoincrement().primaryKey(),
    barcode: varchar("barcode", { length: 200 }).notNull().unique(),
    productId: int("productId"),
    variantId: int("variantId"),
    batchId: int("batchId"),
    storeId: int("storeId"),
    aliasType: mysqlEnum("aliasType", [
      "manufacturer",
      "internal",
      "batch",
      "shelf",
      "legacy",
    ])
      .notNull()
      .default("internal"),
    isActive: boolean("isActive").notNull().default(true),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idxBarcodeAliasesProductBatch: index(
      "idx_barcode_aliases_product_batch"
    ).on(t.productId, t.batchId),
    idxBarcodeAliasesStoreActive: index("idx_barcode_aliases_store_active").on(
      t.storeId,
      t.isActive
    ),
  })
);

export const labelPrintJobs = mysqlTable("label_print_jobs", {
  id: int("id").autoincrement().primaryKey(),
  barcodeAliasId: int("barcodeAliasId"),
  productId: int("productId"),
  variantId: int("variantId"),
  batchId: int("batchId"),
  storeId: int("storeId"),
  labelType: mysqlEnum("labelType", [
    "batch",
    "shelf",
    "mrp",
    "return",
    "audit",
  ])
    .notNull()
    .default("batch"),
  payloadJson: text("payloadJson").notNull(),
  status: mysqlEnum("status", ["queued", "printed", "failed", "cancelled"])
    .notNull()
    .default("queued"),
  printerName: varchar("printerName", { length: 120 }),
  requestedBy: int("requestedBy"),
  printedAt: timestamp("printedAt"),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const discountCategories = mysqlTable("discount_categories", {
  id: int("id").autoincrement().primaryKey(),
  categoryName: varchar("categoryName", { length: 100 }).notNull(),
  maxDiscount: decimal("maxDiscount", { precision: 5, scale: 2 }).default(
    "0.00"
  ),
  minMargin: decimal("minMargin", { precision: 5, scale: 2 }).default("0.00"),
  roleOverrideRequired: boolean("roleOverrideRequired")
    .default(false)
    .notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const discountCodes = mysqlTable("discount_codes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 80 }).notNull(),
  discountType: mysqlEnum("discountType", ["percentage", "fixed"]).notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  maxDiscountAmount: decimal("maxDiscountAmount", { precision: 10, scale: 2 }),
  minOrderAmount: decimal("minOrderAmount", {
    precision: 10,
    scale: 2,
  }).default("0.00"),
  appliesTo: mysqlEnum("appliesTo", [
    "all",
    "store",
    "building",
    "customer",
    "category",
    "product",
  ])
    .default("all")
    .notNull(),
  appliesToId: varchar("appliesToId", { length: 80 }),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  usageLimit: int("usageLimit"),
  perCustomerLimit: int("perCustomerLimit"),
  usedCount: int("usedCount").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  requiresApprovalBelowMargin: boolean("requiresApprovalBelowMargin")
    .default(true)
    .notNull(),
  createdBy: int("createdBy"),
  approvedBy: int("approvedBy"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── SM-C: Ops tables — backup drill results + incident rehearsal log ─────────
export const backupDrillResults = mysqlTable(
  "backup_drill_results",
  {
    id: int("id").autoincrement().primaryKey(),
    drillKind: varchar("drill_kind", { length: 32 }).notNull(),
    drillStatus: varchar("drill_status", { length: 32 }).notNull(),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at"),
    durationSeconds: int("duration_seconds"),
    rowsVerified: bigint("rows_verified", { mode: "number" }),
    bytesTransferred: bigint("bytes_transferred", { mode: "number" }),
    restoreTargetDb: varchar("restore_target_db", { length: 64 }),
    failureReason: text("failure_reason"),
    triggeredBy: varchar("triggered_by", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  t => ({
    idxBackupDrillStatus: index("idx_backup_drill_status").on(
      t.drillStatus,
      t.startedAt
    ),
    idxBackupDrillKind: index("idx_backup_drill_kind").on(
      t.drillKind,
      t.startedAt
    ),
  })
);

export const incidentRehearsalLog = mysqlTable(
  "incident_rehearsal_log",
  {
    id: int("id").autoincrement().primaryKey(),
    scenarioName: varchar("scenario_name", { length: 128 }).notNull(),
    scenarioKind: varchar("scenario_kind", { length: 32 }).notNull(),
    startedAt: timestamp("started_at").notNull(),
    resolvedAt: timestamp("resolved_at"),
    durationSeconds: int("duration_seconds"),
    participantsJson: json("participants_json").notNull(),
    outcome: varchar("outcome", { length: 32 }),
    lessonsLearned: text("lessons_learned"),
    followUpItems: json("follow_up_items"),
    triggeredByUserId: int("triggered_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  t => ({
    idxIncidentRehearsalScenario: index("idx_incident_rehearsal_scenario").on(
      t.scenarioName,
      t.startedAt
    ),
    idxIncidentRehearsalOutcome: index("idx_incident_rehearsal_outcome").on(
      t.outcome,
      t.startedAt
    ),
  })
);

// ─── SM-E: App Phase Flags (migration 0066) ──────────────────────────────────
export const appPhaseFlags = mysqlTable(
  "app_phase_flags",
  {
    id: int("id").autoincrement().primaryKey(),
    flagKey: varchar("flag_key", { length: 64 }).notNull(),
    requiredPhase: varchar("required_phase", { length: 32 }).notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    uqAppPhaseFlagKey: uniqueIndex("uq_app_phase_flag_key").on(t.flagKey),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────
export type SystemEvent = typeof systemEvents.$inferSelect;
export type InsertSystemEvent = typeof systemEvents.$inferInsert;
export type WorkerJobRecord = typeof workerJobs.$inferSelect;
export type NewWorkerJobRecord = typeof workerJobs.$inferInsert;
export type SloEventRecord = typeof sloEvents.$inferSelect;
export type NewSloEventRecord = typeof sloEvents.$inferInsert;
export type ReservationRecord = typeof reservations.$inferSelect;
export type NewReservationRecord = typeof reservations.$inferInsert;
export type ReservationLineRecord = typeof reservationLines.$inferSelect;
export type NewReservationLineRecord = typeof reservationLines.$inferInsert;
export type StockLockKeyRecord = typeof stockLockKeys.$inferSelect;
export type Ledger = typeof ledgers.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type WorkflowEvent = typeof workflowEvents.$inferSelect;
export type ProviderWebhookEvent = typeof providerWebhookEvents.$inferSelect;
export type InsertProviderWebhookEvent =
  typeof providerWebhookEvents.$inferInsert;
export type ProviderDeadLetter = typeof providerDeadLetters.$inferSelect;
export type InsertProviderDeadLetter = typeof providerDeadLetters.$inferInsert;
export type BackupDrillResult = typeof backupDrillResults.$inferSelect;
export type NewBackupDrillResult = typeof backupDrillResults.$inferInsert;
export type IncidentRehearsalLog = typeof incidentRehearsalLog.$inferSelect;
export type NewIncidentRehearsalLog = typeof incidentRehearsalLog.$inferInsert;
