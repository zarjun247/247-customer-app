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

// ─── Phase 8: Metrics Events ──────────────────────────────────────────────────
export const metricsEvents = mysqlTable("metrics_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  userId: int("userId"),
  storeId: int("storeId"),
  orderId: int("orderId"),
  value: decimal("value", { precision: 12, scale: 2 }),
  metadata: text("metadata"), // JSON
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
  status: mysqlEnum("status", ["running", "completed", "failed"])
    .default("running")
    .notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

// ─── OCR / AI Ingestion Tables ────────────────────────────────────────────────
export const ingestionJobs = mysqlTable("ingestion_jobs", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  jobType: mysqlEnum("jobType", [
    "purchase_bill",
    "prescription",
    "stock_audit",
  ])
    .default("purchase_bill")
    .notNull(),
  status: mysqlEnum("status", [
    "queued",
    "processing",
    "ocr_complete",
    "under_review",
    "committed",
    "failed",
  ])
    .default("queued")
    .notNull(),
  sourceType: mysqlEnum("sourceType", [
    "upload",
    "email",
    "whatsapp",
    "watched_folder",
    "csv_import",
    "legacy",
  ]).default("upload"),
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  filename: varchar("filename", { length: 255 }),
  mimeType: varchar("mimeType", { length: 100 }),
  supplierHint: varchar("supplierHint", { length: 300 }),
  ocrRawText: text("ocrRawText"),
  ocrConfidence: decimal("ocrConfidence", { precision: 5, scale: 2 }),
  totalLines: int("totalLines").default(0),
  matchedLines: int("matchedLines").default(0),
  reviewLines: int("reviewLines").default(0),
  unknownLines: int("unknownLines").default(0),
  errorMessage: text("errorMessage"),
  createdBy: int("createdBy").notNull(),
  processedAt: timestamp("processedAt"),
  committedAt: timestamp("committedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const ingestionFiles = mysqlTable("ingestion_files", {
  id: int("id").autoincrement().primaryKey(),
  ingestionJobId: int("ingestionJobId").notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  fileSizeBytes: int("fileSizeBytes"),
  pageCount: int("pageCount"),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ocrExtractedHeaders = mysqlTable("ocr_extracted_headers", {
  id: int("id").autoincrement().primaryKey(),
  ingestionJobId: int("ingestionJobId").notNull(),
  supplierName: varchar("supplierName", { length: 300 }),
  supplierGstin: varchar("supplierGstin", { length: 20 }),
  invoiceNo: varchar("invoiceNo", { length: 100 }),
  invoiceDate: varchar("invoiceDate", { length: 50 }),
  invoiceDateParsed: date("invoiceDateParsed"),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  totalTax: decimal("totalTax", { precision: 12, scale: 2 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  matchedSupplierId: int("matchedSupplierId"),
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected"])
    .default("pending")
    .notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ocrExtractedLines = mysqlTable("ocr_extracted_lines", {
  id: int("id").autoincrement().primaryKey(),
  ingestionJobId: int("ingestionJobId").notNull(),
  lineNo: int("lineNo").notNull(),
  rawText: text("rawText"),
  rawLineText: text("rawLineText"),
  itemName: varchar("itemName", { length: 300 }),
  extractedProductName: varchar("extractedProductName", { length: 300 }),
  normalizedName: varchar("normalizedName", { length: 300 }),
  manufacturer: varchar("manufacturer", { length: 200 }),
  strength: varchar("strength", { length: 100 }),
  dosageForm: varchar("dosageForm", { length: 100 }),
  packSize: varchar("packSize", { length: 100 }),
  batchNo: varchar("batchNo", { length: 100 }),
  extractedBatchNo: varchar("extractedBatchNo", { length: 100 }),
  expiryDate: varchar("expiryDate", { length: 50 }),
  extractedExpiry: varchar("extractedExpiry", { length: 50 }),
  mrp: decimal("mrp", { precision: 10, scale: 2 }),
  extractedMRP: decimal("extractedMRP", { precision: 10, scale: 2 }),
  purchaseRate: decimal("purchaseRate", { precision: 10, scale: 2 }),
  extractedCost: decimal("extractedCost", { precision: 10, scale: 2 }),
  qty: int("qty"),
  extractedQty: int("extractedQty"),
  freeQty: int("freeQty").default(0),
  discount: decimal("discount", { precision: 5, scale: 2 }),
  gstRate: decimal("gstRate", { precision: 5, scale: 2 }),
  hsnCode: varchar("hsnCode", { length: 20 }),
  totalValue: decimal("totalValue", { precision: 12, scale: 2 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  matchedProductId: int("matchedProductId"),
  mappedProductId: int("mappedProductId"),
  mappedSupplierSkuId: int("mappedSupplierSkuId"),
  matchConfidence: decimal("matchConfidence", { precision: 5, scale: 2 }),
  matchStatus: mysqlEnum("matchStatus", [
    "auto_matched",
    "review_required",
    "unknown_sku",
    "rejected",
  ])
    .default("review_required")
    .notNull(),
  exceptionReason: mysqlEnum("exceptionReason", [
    "low_confidence",
    "ambiguous_product",
    "missing_batch",
    "missing_expiry",
    "missing_qty",
    "missing_mrp",
    "missing_cost",
    "missing_hsn_or_gst",
    "missing_schedule_for_regulated",
    "supplier_sku_unmapped",
  ]),
  approvalStatus: mysqlEnum("approvalStatus", [
    "pending",
    "approved",
    "held",
    "rejected",
  ])
    .default("pending")
    .notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  approvalDecision: mysqlEnum("approvalDecision", [
    "approve",
    "hold",
    "reject",
  ]),
  correctionNotes: text("correctionNotes"),
  rejectionReason: text("rejectionReason"),
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
  status: mysqlEnum("status", ["pending_review", "approved", "rejected"])
    .default("pending_review")
    .notNull(),
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
  totalValue: decimal("totalValue", { precision: 12, scale: 2 }),
  notes: text("notes"),
  status: mysqlEnum("status", [
    "draft",
    "under_review",
    "approved",
    "committed",
    "rejected",
  ])
    .default("draft")
    .notNull(),
  approvalDecision: mysqlEnum("approvalDecision", [
    "approve",
    "hold",
    "reject",
  ]),
  correctionNotes: text("correctionNotes"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: text("rejectionReason"),
  committedInvoiceId: int("committedInvoiceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseDraftLines = mysqlTable("purchase_draft_lines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseDraftId: int("purchaseDraftId").notNull(),
  ocrLineId: int("ocrLineId"),
  productId: int("productId"),
  rawLineText: text("rawLineText"),
  extractedProductName: varchar("extractedProductName", { length: 300 }),
  extractedBatchNo: varchar("extractedBatchNo", { length: 100 }),
  extractedExpiry: varchar("extractedExpiry", { length: 50 }),
  extractedQty: int("extractedQty"),
  extractedMRP: decimal("extractedMRP", { precision: 10, scale: 2 }),
  extractedCost: decimal("extractedCost", { precision: 10, scale: 2 }),
  mappedProductId: int("mappedProductId"),
  mappedSupplierSkuId: int("mappedSupplierSkuId"),
  batchNo: varchar("batchNo", { length: 100 }),
  expiryDate: varchar("expiryDate", { length: 50 }),
  mrp: decimal("mrp", { precision: 10, scale: 2 }),
  purchaseRate: decimal("purchaseRate", { precision: 10, scale: 2 }),
  saleRate: decimal("saleRate", { precision: 10, scale: 2 }),
  landingCost: decimal("landingCost", { precision: 10, scale: 2 }),
  margin: decimal("margin", { precision: 5, scale: 2 }),
  qty: int("qty"),
  freeQty: int("freeQty").default(0),
  discount: decimal("discount", { precision: 5, scale: 2 }),
  gstRate: decimal("gstRate", { precision: 5, scale: 2 }),
  hsnCode: varchar("hsnCode", { length: 20 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  exceptionReason: mysqlEnum("exceptionReason", [
    "low_confidence",
    "ambiguous_product",
    "missing_batch",
    "missing_expiry",
    "missing_qty",
    "missing_mrp",
    "missing_cost",
    "missing_hsn_or_gst",
    "missing_schedule_for_regulated",
    "supplier_sku_unmapped",
  ]),
  approvalStatus: mysqlEnum("approvalStatus", [
    "pending",
    "approved",
    "held",
    "rejected",
  ])
    .default("pending")
    .notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  approvalDecision: mysqlEnum("approvalDecision", [
    "approve",
    "hold",
    "reject",
  ]),
  correctionNotes: text("correctionNotes"),
  status: mysqlEnum("status", ["pending", "approved", "held", "rejected"])
    .default("pending")
    .notNull(),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ocrMatchCandidates = mysqlTable("ocr_match_candidates", {
  id: int("id").autoincrement().primaryKey(),
  ocrLineId: int("ocrLineId").notNull(),
  productId: int("productId").notNull(),
  matchScore: decimal("matchScore", { precision: 5, scale: 2 }).notNull(),
  matchMethod: mysqlEnum("matchMethod", [
    "exact_name",
    "fuzzy_name",
    "barcode",
    "hsn_gst",
    "supplier_alias",
    "previous_mapping",
    "manufacturer_strength",
  ]).notNull(),
  matchDetails: text("matchDetails"),
  isSelected: boolean("isSelected").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ocrReviewTasks = mysqlTable("ocr_review_tasks", {
  id: int("id").autoincrement().primaryKey(),
  ingestionJobId: int("ingestionJobId").notNull(),
  ocrLineId: int("ocrLineId"),
  taskType: mysqlEnum("taskType", [
    "header_review",
    "line_review",
    "sku_creation",
    "h1_review",
    "low_confidence",
  ]).notNull(),
  priority: mysqlEnum("priority", ["high", "medium", "low"]).default("medium"),
  status: mysqlEnum("status", [
    "pending",
    "in_progress",
    "resolved",
    "skipped",
  ]).default("pending"),
  assignedTo: int("assignedTo"),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const aiDecisions = mysqlTable("ai_decisions", {
  id: int("id").autoincrement().primaryKey(),
  ingestionJobId: int("ingestionJobId").notNull(),
  ocrLineId: int("ocrLineId"),
  decisionType: mysqlEnum("decisionType", [
    "auto_match",
    "review_flag",
    "sku_create",
    "reject",
    "schedule_gate",
  ]).notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  reasoning: text("reasoning"),
  modelVersion: varchar("modelVersion", { length: 50 }),
  inputSnapshot: text("inputSnapshot"),
  outputSnapshot: text("outputSnapshot"),
  overriddenBy: int("overriddenBy"),
  overriddenAt: timestamp("overriddenAt"),
  overrideReason: text("overrideReason"),
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
  mimeType: varchar("mimeType", { length: 100 })
    .default("application/pdf")
    .notNull(),
  status: mysqlEnum("status", [
    "pending_ocr",
    "ocr_complete",
    "under_review",
    "approved",
    "rejected",
  ])
    .default("pending_ocr")
    .notNull(),
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
  status: mysqlEnum("status", ["queued", "processing", "complete", "failed"])
    .default("queued")
    .notNull(),
  provider: varchar("provider", { length: 50 }).default("llm").notNull(),
  rawResponse: text("rawResponse"),
  parsedJson: text("parsedJson"), // JSON array of extracted line items
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
  status: mysqlEnum("status", ["pending", "approved", "rejected", "merged"])
    .default("pending")
    .notNull(),
  reviewedBy: int("reviewedBy"),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── MP8: AI Eval Ledger (append-only, tamper-evident, chained hashes) ────────
export const aiEvalLedger = mysqlTable(
  "ai_eval_ledger",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    sequenceNumber: bigint("sequence_number", { mode: "number" }).notNull(),
    prevHash: varchar("prev_hash", { length: 64 }).notNull(),
    rowHash: varchar("row_hash", { length: 64 }).notNull(),
    suggestionKind: varchar("suggestion_kind", { length: 64 }).notNull(),
    scopeType: varchar("scope_type", { length: 32 }).notNull(),
    scopeId: varchar("scope_id", { length: 64 }),
    inputHash: varchar("input_hash", { length: 64 }).notNull(),
    inputSnapshot: json("input_snapshot").notNull(),
    outputPayload: json("output_payload").notNull(),
    modelVersion: varchar("model_version", { length: 64 }).notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    generatedByUserId: varchar("generated_by_user_id", { length: 36 }),
    traceId: varchar("trace_id", { length: 64 }),
  },
  t => ({
    uqAiEvalSequence: uniqueIndex("uq_ai_eval_sequence").on(t.sequenceNumber),
    uqAiEvalRowHash: uniqueIndex("uq_ai_eval_row_hash").on(t.rowHash),
    idxAiEvalKindGenerated: index("idx_ai_eval_kind_generated").on(
      t.suggestionKind,
      t.generatedAt
    ),
    idxAiEvalScope: index("idx_ai_eval_scope").on(
      t.scopeType,
      t.scopeId,
      t.generatedAt
    ),
    idxAiEvalSeq: index("idx_ai_eval_seq").on(t.sequenceNumber),
  })
);

export const aiEvalOutcomes = mysqlTable(
  "ai_eval_outcomes",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    evalLedgerId: bigint("eval_ledger_id", { mode: "number" }).notNull(),
    outcomeKind: varchar("outcome_kind", { length: 64 }).notNull(),
    outcomePayload: json("outcome_payload"),
    recordedAt: timestamp("recorded_at").defaultNow().notNull(),
    recordedByUserId: varchar("recorded_by_user_id", { length: 36 }),
  },
  t => ({
    idxAiEvalOutcomesEval: index("idx_ai_eval_outcomes_eval").on(
      t.evalLedgerId
    ),
    idxAiEvalOutcomesKind: index("idx_ai_eval_outcomes_kind").on(
      t.outcomeKind,
      t.recordedAt
    ),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────
export type MetricsEvent = typeof metricsEvents.$inferSelect;
export type MedivisionSyncLog = typeof medivisionSyncLog.$inferSelect;
export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type OcrExtractedLine = typeof ocrExtractedLines.$inferSelect;
export type AiEvalLedgerRecord = typeof aiEvalLedger.$inferSelect;
export type NewAiEvalLedgerRecord = typeof aiEvalLedger.$inferInsert;
export type AiEvalOutcomeRecord = typeof aiEvalOutcomes.$inferSelect;
export type NewAiEvalOutcomeRecord = typeof aiEvalOutcomes.$inferInsert;
