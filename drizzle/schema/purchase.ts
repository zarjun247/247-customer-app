import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliers = mysqlTable(
  "suppliers",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierName: varchar("supplierName", { length: 300 }).notNull(),
    gstin: varchar("gstin", { length: 20 }),
    address: text("address"),
    state: varchar("state", { length: 100 }),
    stateId: int("stateId"),
    contactPerson: varchar("contactPerson", { length: 200 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 320 }),
    paymentTerms: varchar("paymentTerms", { length: 100 }),
    defaultDiscount: decimal("defaultDiscount", {
      precision: 5,
      scale: 2,
    }).default("0.00"),
    cashDiscount: decimal("cashDiscount", { precision: 5, scale: 2 }).default(
      "0.00"
    ),
    creditDays: int("creditDays").default(0),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idxSuppliersActiveName: index("idx_suppliers_active_name").on(
      t.isActive,
      t.supplierName
    ),
    idxSuppliersGstin: index("idx_suppliers_gstin").on(t.gstin),
  })
);

// ─── Phase 5: Purchase Orders ─────────────────────────────────────────────────
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendorId").notNull(),
  storeId: int("storeId").notNull(),
  status: mysqlEnum("status", [
    "draft",
    "sent",
    "partially_received",
    "received",
    "cancelled",
  ])
    .default("draft")
    .notNull(),
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
  poId: int("poId"), // nullable for direct GRN without PO
  storeId: int("storeId").notNull(),
  receivedByUserId: int("receivedByUserId").notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  notes: text("notes"),
  status: mysqlEnum("status", ["pending", "verified", "discrepancy"])
    .default("pending")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Purchase Invoices ────────────────────────────────────────────────────────
export const purchaseInvoices = mysqlTable(
  "purchase_invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierId: int("supplierId").notNull(),
    storeId: int("storeId").notNull(),
    invoiceNo: varchar("invoiceNo", { length: 100 }).notNull(),
    invoiceDate: timestamp("invoiceDate").notNull(),
    supplierGstin: varchar("supplierGstin", { length: 20 }),
    sourceType: mysqlEnum("sourceType", ["manual", "ocr", "import", "whatsapp"])
      .default("manual")
      .notNull(),
    rawFileRef: varchar("rawFileRef", { length: 500 }),
    totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).default(
      "0.00"
    ),
    totalGst: decimal("totalGst", { precision: 12, scale: 2 }).default("0.00"),
    totalDiscount: decimal("totalDiscount", {
      precision: 12,
      scale: 2,
    }).default("0.00"),
    netAmount: decimal("netAmount", { precision: 12, scale: 2 }).default(
      "0.00"
    ),
    gstSummary: json("gstSummary"),
    status: mysqlEnum("status", [
      "draft",
      "committed",
      "partially_returned",
      "returned",
      "cancelled",
    ])
      .default("draft")
      .notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").notNull(),
    approvedBy: int("approvedBy"),
    approvedAt: timestamp("approvedAt"),
    debitNoteNo: varchar("debitNoteNo", { length: 100 }),
    committedAt: timestamp("committedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idxPurchaseInvoicesSupplierStatusDue: index(
      "idx_purchase_invoices_supplier_status_due"
    ).on(t.supplierId, t.status, t.invoiceDate),
    idxPurchaseInvoicesStoreInvoiceDate: index(
      "idx_purchase_invoices_store_invoice_date"
    ).on(t.storeId, t.invoiceDate),
    idxPurchaseInvoicesInvoiceNo: index("idx_purchase_invoices_invoice_no").on(
      t.invoiceNo
    ),
  })
);

// ─── Purchase Lines ───────────────────────────────────────────────────────────
export const purchaseLines = mysqlTable("purchase_lines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseInvoiceId: int("purchaseInvoiceId").notNull(),
  productId: int("productId").notNull(),
  batchNo: varchar("batchNo", { length: 100 }).notNull(),
  mfgDate: timestamp("mfgDate"),
  expiryDate: timestamp("expiryDate").notNull(),
  mrp: decimal("mrp", { precision: 10, scale: 2 }).notNull(),
  purchaseRate: decimal("purchaseRate", { precision: 10, scale: 2 }).notNull(),
  saleRate: decimal("saleRate", { precision: 10, scale: 2 }),
  qty: int("qty").notNull(),
  freeQty: int("freeQty").default(0),
  schemeDiscount: decimal("schemeDiscount", { precision: 5, scale: 2 }).default(
    "0.00"
  ),
  cashDiscount: decimal("cashDiscount", { precision: 5, scale: 2 }).default(
    "0.00"
  ),
  hsnCode: varchar("hsnCode", { length: 20 }),
  gstRate: decimal("gstRate", { precision: 5, scale: 2 }).default("12.00"),
  landingCost: decimal("landingCost", { precision: 10, scale: 2 }),
  margin: decimal("margin", { precision: 5, scale: 2 }),
  rawLineText: text("rawLineText"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  reviewerId: int("reviewerId"),
  batchId: int("batchId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
});

// ─── Purchase Returns ─────────────────────────────────────────────────────────
export const purchaseReturns = mysqlTable("purchase_returns", {
  id: int("id").autoincrement().primaryKey(),
  purchaseInvoiceId: int("purchaseInvoiceId").notNull(),
  supplierId: int("supplierId").notNull(),
  storeId: int("storeId").notNull(),
  returnDate: timestamp("returnDate").defaultNow().notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  reason: text("reason"),
  debitNoteNo: varchar("debitNoteNo", { length: 100 }),
  gstReversal: json("gstReversal"),
  status: mysqlEnum("status", ["draft", "committed"])
    .default("draft")
    .notNull(),
  createdBy: int("createdBy").notNull(),
  approvedBy: int("approvedBy"),
  committedAt: timestamp("committedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
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
export const supplierPayments = mysqlTable(
  "supplier_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierId: int("supplierId").notNull(),
    storeId: int("storeId").notNull(),
    purchaseInvoiceId: int("purchaseInvoiceId"), // optional invoice-wise allocation
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    paymentMode: mysqlEnum("paymentMode", [
      "cash",
      "cheque",
      "upi",
      "neft",
      "rtgs",
      "credit",
      "advance",
      "debit_note",
      "return_credit",
      "adjustment",
    ])
      .default("upi")
      .notNull(),
    referenceNo: varchar("referenceNo", { length: 100 }),
    voucherNo: varchar("voucherNo", { length: 100 }),
    bankRef: varchar("bankRef", { length: 200 }),
    paymentDate: timestamp("paymentDate").defaultNow().notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
  },
  t => ({
    idxSupplierPaymentsSupplierDate: index(
      "idx_supplier_payments_supplier_date"
    ).on(t.supplierId, t.paymentDate),
    idxSupplierPaymentsPurchaseInvoice: index(
      "idx_supplier_payments_purchase_invoice"
    ).on(t.purchaseInvoiceId),
    idxSupplierPaymentsVoucherNo: index("idx_supplier_payments_voucher_no").on(
      t.voucherNo
    ),
  })
);

export const supplierPaymentAllocations = mysqlTable(
  "supplier_payment_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    supplierPaymentId: int("supplierPaymentId").notNull(),
    purchaseInvoiceId: int("purchaseInvoiceId"),
    purchaseReturnId: int("purchaseReturnId"),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    allocationType: mysqlEnum("allocationType", [
      "invoice_payment",
      "advance_applied",
      "debit_note",
      "return_credit",
      "adjustment",
    ]).notNull(),
    allocatedAt: timestamp("allocatedAt").defaultNow().notNull(),
    allocatedBy: int("allocatedBy"),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    uqPaymentInvoiceType: uniqueIndex(
      "uq_supplier_alloc_payment_invoice_type"
    ).on(t.supplierPaymentId, t.purchaseInvoiceId, t.allocationType),
    idxSupplierAllocPurchaseInvoice: index(
      "idx_supplier_alloc_purchase_invoice"
    ).on(t.purchaseInvoiceId),
    idxSupplierAllocPayment: index("idx_supplier_alloc_payment").on(
      t.supplierPaymentId
    ),
  })
);

// ─── Refill Reminders ─────────────────────────────────────────────────────────
export const refillReminders = mysqlTable("refill_reminders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  lastOrderedAt: timestamp("lastOrderedAt").notNull(),
  avgIntervalDays: int("avgIntervalDays").default(30).notNull(),
  nextReminderAt: timestamp("nextReminderAt").notNull(),
  isDismissed: boolean("isDismissed").default(false).notNull(),
  snoozedUntil: timestamp("snoozedUntil"), // null = not snoozed
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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

// ─── H1 Register ──────────────────────────────────────────────────────────────
export const h1Register = mysqlTable(
  "h1_register",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId"),
    prescriptionId: int("prescriptionId"),
    storeId: int("storeId"),
    storeRef: varchar("storeRef", { length: 36 }),
    patientName: varchar("patientName", { length: 300 }).notNull(),
    patientPhone: varchar("patientPhone", { length: 20 }),
    prescribingDoctor: varchar("prescribingDoctor", { length: 300 }),
    doctorName: varchar("doctorName", { length: 300 }),
    doctorRegNo: varchar("doctorRegNo", { length: 100 }),
    drugName: varchar("drugName", { length: 300 }).notNull(),
    productId: varchar("productId", { length: 36 }),
    batchNo: varchar("batchNo", { length: 100 }),
    batchLedgerId: varchar("batchLedgerId", { length: 36 }),
    batchId: varchar("batchId", { length: 36 }),
    qty: int("qty").notNull(),
    prescriptionRef: varchar("prescriptionRef", { length: 100 }),
    saleRef: varchar("saleRef", { length: 36 }),
    saleLineRef: varchar("saleLineRef", { length: 36 }),
    saleBillNo: varchar("saleBillNo", { length: 100 }),
    statutoryContextStatus: varchar("statutoryContextStatus", { length: 60 })
      .default("complete")
      .notNull(),
    pharmacistId: int("pharmacistId").notNull(),
    billNo: varchar("billNo", { length: 100 }),
    saleId: int("saleId"),
    prescriptionLineId: int("prescriptionLineId"),
    dispensedAt: timestamp("dispensedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    uqH1SaleLine: uniqueIndex("uq_h1_register_sale_line_ref").on(
      t.saleRef,
      t.saleLineRef
    ),
    idxH1StoreCreated: index("idx_h1_register_store_created").on(
      t.storeId,
      t.createdAt
    ),
    idxH1PrescriptionRef: index("idx_h1_register_prescription_ref").on(
      t.prescriptionRef
    ),
    idxH1BillNo: index("idx_h1_register_bill_no").on(t.billNo),
    idxH1BatchNo: index("idx_h1_register_batch_no").on(t.batchNo),
    idxH1PatientPhone: index("idx_h1_register_patient_phone").on(
      t.patientPhone
    ),
  })
);

// ─── Accounting tables ────────────────────────────────────────────────────────
export const accountingJournalBatches = mysqlTable(
  "accounting_journal_batches",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceType: varchar("sourceType", { length: 64 }).notNull(),
    sourceRef: varchar("sourceRef", { length: 128 }).notNull(),
    storeId: int("storeId"),
    status: mysqlEnum("status", ["draft", "posted", "reversed", "failed"])
      .default("draft")
      .notNull(),
    totalDebit: decimal("totalDebit", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    totalCredit: decimal("totalCredit", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    postedBy: int("postedBy"),
    postedAt: timestamp("postedAt"),
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    uqJournalBatchSource: uniqueIndex("uq_journal_batch_source").on(
      t.sourceType,
      t.sourceRef
    ),
  })
);

export const accountingJournalEntries = mysqlTable(
  "accounting_journal_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    journalBatchId: int("journalBatchId"),
    storeId: int("storeId"),
    sourceType: varchar("sourceType", { length: 64 }).notNull(),
    sourceId: int("sourceId").notNull(),
    entryDate: timestamp("entryDate").defaultNow().notNull(),
    accountCode: varchar("accountCode", { length: 64 }).notNull(),
    accountName: varchar("accountName", { length: 200 }).notNull(),
    debit: decimal("debit", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    credit: decimal("credit", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    currency: varchar("currency", { length: 12 }).default("INR").notNull(),
    narration: text("narration"),
    metadataJson: json("metadataJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    uqSourceAccountDirection: uniqueIndex(
      "uq_journal_source_account_direction"
    ).on(t.sourceType, t.sourceId, t.accountCode, t.debit, t.credit),
  })
);

export const tallyExportRuns = mysqlTable(
  "tally_export_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId"),
    exportType: varchar("exportType", { length: 64 }).notNull(),
    periodStart: timestamp("periodStart"),
    periodEnd: timestamp("periodEnd"),
    // Legacy aliases retained for callers/migrations created before export proof hardening.
    dateFrom: timestamp("dateFrom"),
    dateTo: timestamp("dateTo"),
    filtersJson: json("filtersJson"),
    rowCount: int("rowCount").default(0).notNull(),
    checksum: varchar("checksum", { length: 128 }).notNull(),
    duplicateKey: varchar("duplicateKey", { length: 192 }).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "generated",
      "exported",
      "failed",
      "cancelled",
    ])
      .default("generated")
      .notNull(),
    generatedBy: int("generatedBy"),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
    exportedAt: timestamp("exportedAt"),
    failureReason: text("failureReason"),
    fileKey: text("fileKey"),
    fileUrl: text("fileUrl"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    uqTallyExportProofWindow: uniqueIndex("uq_tally_export_proof_window").on(
      t.duplicateKey
    ),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Supplier = typeof suppliers.$inferSelect;
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect;
export type PurchaseLine = typeof purchaseLines.$inferSelect;
export type FinancialYear = typeof financialYears.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PoItem = typeof poItems.$inferSelect;
export type GrnRecord = typeof grnRecords.$inferSelect;
export type RefillReminder = typeof refillReminders.$inferSelect;
export type AccountingJournalBatch =
  typeof accountingJournalBatches.$inferSelect;
export type AccountingJournalEntry =
  typeof accountingJournalEntries.$inferSelect;
