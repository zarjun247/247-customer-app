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

export const sales = mysqlTable(
  "sales",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    billNo: varchar("bill_no", { length: 50 }).notNull(),
    saleType: mysqlEnum("sale_type", [
      "counter",
      "medicine",
      "app",
      "whatsapp",
      "phone_assisted",
      "prescription",
      "otc",
      "chronic_refill",
    ])
      .notNull()
      .default("counter"),
    storeId: varchar("store_id", { length: 36 }).notNull(),
    customerId: varchar("customer_id", { length: 36 }),
    customerMobile: varchar("customer_mobile", { length: 20 }),
    customerName: varchar("customer_name", { length: 200 }),
    salesmanCode: varchar("salesman_code", { length: 50 }),
    pharmacistCode: varchar("pharmacist_code", { length: 50 }),
    pharmacistName: varchar("pharmacist_name", { length: 200 }),
    pharmacistRegNo: varchar("pharmacist_reg_no", { length: 100 }),
    prescriptionId: varchar("prescription_id", { length: 36 }),
    subtotal: decimal("subtotal", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    discountAmount: decimal("discount_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    gstAmount: decimal("gst_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
    gstSummary: text("gst_summary"),
    paymentMode: mysqlEnum("payment_mode", [
      "cash",
      "upi",
      "card",
      "credit",
      "mixed",
    ])
      .notNull()
      .default("cash"),
    paymentRef: varchar("payment_ref", { length: 200 }),
    status: mysqlEnum("status", ["draft", "confirmed", "returned", "cancelled"])
      .notNull()
      .default("draft"),
    billPrinted: int("bill_printed").notNull().default(0),
    whatsappSent: int("whatsapp_sent").notNull().default(0),
    emailSent: int("email_sent").notNull().default(0),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    confirmedAt: bigint("confirmed_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  t => ({
    uqSalesBillNo: uniqueIndex("uq_sales_bill_no").on(t.billNo),
    idxSalesStoreStatusCreated: index("idx_sales_store_status_created").on(
      t.storeId,
      t.status,
      t.createdAt
    ),
    idxSalesCustomerStatusCreated: index(
      "idx_sales_customer_status_created"
    ).on(t.customerId, t.status, t.createdAt),
    idxSalesSaleTypeCreated: index("idx_sales_sale_type_created").on(
      t.saleType,
      t.createdAt
    ),
    idxSalesPaymentRef: index("idx_sales_payment_ref").on(t.paymentRef),
  })
);

export const saleLines = mysqlTable(
  "sale_lines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    saleId: varchar("sale_id", { length: 36 }).notNull(),
    productId: varchar("product_id", { length: 36 }).notNull(),
    batchLedgerId: varchar("batch_ledger_id", { length: 36 }),
    batchNo: varchar("batch_no", { length: 100 }),
    expiryDate: date("expiry_date"),
    mrp: decimal("mrp", { precision: 10, scale: 2 }).notNull().default("0"),
    saleRate: decimal("sale_rate", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    qty: int("qty").notNull().default(1),
    discountPct: decimal("discount_pct", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    discountAmount: decimal("discount_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    gstRate: decimal("gst_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    gstAmount: decimal("gst_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    hsnCode: varchar("hsn_code", { length: 20 }),
    lineTotal: decimal("line_total", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    requiresPrescription: int("requires_prescription").notNull().default(0),
    scheduleCode: varchar("schedule_code", { length: 10 }),
    rxCleared: int("rx_cleared").notNull().default(0),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  t => ({
    idxSaleLinesSale: index("idx_sale_lines_sale").on(t.saleId),
    idxSaleLinesProductBatch: index("idx_sale_lines_product_batch").on(
      t.productId,
      t.batchNo
    ),
    idxSaleLinesHsn: index("idx_sale_lines_hsn").on(t.hsnCode),
  })
);

export const counterPayments = mysqlTable(
  "counter_payments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    saleId: varchar("sale_id", { length: 36 }).notNull(),
    paymentMode: mysqlEnum("payment_mode", [
      "cash",
      "upi",
      "card",
      "credit",
      "mixed",
    ])
      .notNull()
      .default("cash"),
    amount: decimal("amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    paymentRef: varchar("payment_ref", { length: 200 }),
    gatewayRef: varchar("gateway_ref", { length: 200 }),
    status: mysqlEnum("status", ["pending", "confirmed", "failed", "refunded"])
      .notNull()
      .default("confirmed"),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  t => ({
    idxCounterPaymentsSaleCreated: index(
      "idx_counter_payments_sale_created"
    ).on(t.saleId, t.createdAt),
    idxCounterPaymentsStatusCreated: index(
      "idx_counter_payments_status_created"
    ).on(t.status, t.createdAt),
    idxCounterPaymentsPaymentRef: index("idx_counter_payments_payment_ref").on(
      t.paymentRef
    ),
    idxCounterPaymentsGatewayRef: index("idx_counter_payments_gateway_ref").on(
      t.gatewayRef
    ),
  })
);

export const refunds = mysqlTable(
  "refunds",
  {
    id: int("id").autoincrement().primaryKey(),
    paymentId: int("paymentId").notNull(),
    orderId: int("orderId"),
    saleId: int("saleId"),
    provider: varchar("provider", { length: 50 }).notNull(),
    providerRefundId: varchar("providerRefundId", { length: 100 }),
    amountPaise: int("amountPaise").notNull(),
    status: mysqlEnum("status", ["pending", "success", "failed", "cancelled"])
      .default("pending")
      .notNull(),
    reason: text("reason"),
    creditNoteId: int("creditNoteId"),
    initiatedBy: int("initiatedBy"),
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    uqProviderRefundId: uniqueIndex("refunds_provider_refund_id_uq").on(
      t.provider,
      t.providerRefundId
    ),
    idxRefundsOrderStatus: index("idx_refunds_order_status").on(
      t.orderId,
      t.status
    ),
    idxRefundsPaymentStatus: index("idx_refunds_payment_status").on(
      t.paymentId,
      t.status
    ),
    idxRefundsSaleStatus: index("idx_refunds_sale_status").on(
      t.saleId,
      t.status
    ),
    idxRefundsStatusCreated: index("idx_refunds_status_created").on(
      t.status,
      t.createdAt
    ),
  })
);

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
  status: mysqlEnum("status", ["pending", "paid", "failed", "refunded"])
    .default("pending")
    .notNull(),
  method: varchar("method", { length: 50 }), // upi, card, netbanking, etc.
  paidAt: timestamp("paidAt"),
  failureReason: text("failureReason"),
  refundId: varchar("refundId", { length: 100 }),
  refundedAt: timestamp("refundedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const saleReturns = mysqlTable(
  "sale_returns",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    returnNo: varchar("return_no", { length: 50 }).notNull(),
    saleId: varchar("sale_id", { length: 36 }).notNull(),
    storeId: varchar("store_id", { length: 36 }).notNull(),
    reason: text("reason").notNull(),
    refundMode: mysqlEnum("refund_mode", ["cash", "upi", "card", "credit_note"])
      .notNull()
      .default("cash"),
    refundRef: varchar("refund_ref", { length: 200 }),
    totalRefund: decimal("total_refund", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    gstReversal: decimal("gst_reversal", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .notNull()
      .default("pending"),
    approvedBy: varchar("approved_by", { length: 36 }),
    approvedAt: bigint("approved_at", { mode: "number" }),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  t => ({
    uqSaleReturnsReturnNo: uniqueIndex("uq_sale_returns_return_no").on(
      t.returnNo
    ),
  })
);

export const saleReturnLines = mysqlTable("sale_return_lines", {
  id: varchar("id", { length: 36 }).primaryKey(),
  returnId: varchar("return_id", { length: 36 }).notNull(),
  saleLineId: varchar("sale_line_id", { length: 36 }).notNull(),
  productId: varchar("product_id", { length: 36 }).notNull(),
  batchLedgerId: varchar("batch_ledger_id", { length: 36 }),
  returnQty: int("return_qty").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  gstReversal: decimal("gst_reversal", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  stockDisposition: mysqlEnum("stock_disposition", [
    "resaleable",
    "quarantine",
    "disposal",
  ])
    .notNull()
    .default("resaleable"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const creditNotes = mysqlTable(
  "credit_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    creditNoteNo: varchar("credit_note_no", { length: 64 }).notNull(),
    originalInvoiceNo: varchar("original_invoice_no", {
      length: 100,
    }).notNull(),
    billNo: varchar("bill_no", { length: 100 }),
    saleId: varchar("sale_id", { length: 36 }),
    orderId: int("order_id"),
    saleReturnId: varchar("sale_return_id", { length: 36 }),
    refundId: varchar("refund_id", { length: 100 }),
    storeId: varchar("store_id", { length: 36 }).notNull(),
    customerId: varchar("customer_id", { length: 36 }),
    amountPaise: int("amount_paise").notNull(),
    taxableAmountPaise: int("taxable_amount_paise").notNull().default(0),
    gstAmountPaise: int("gst_amount_paise").notNull().default(0),
    reason: text("reason").notNull(),
    status: mysqlEnum("status", ["draft", "issued", "cancelled", "failed"])
      .notNull()
      .default("draft"),
    issuedBy: varchar("issued_by", { length: 36 }),
    issuedAt: bigint("issued_at", { mode: "number" }),
    lineSplitsJson: text("line_splits_json"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  table => ({
    creditNoteNoUnique: uniqueIndex("credit_notes_credit_note_no_unique").on(
      table.creditNoteNo
    ),
    idxCreditNotesBillNo: index("idx_credit_notes_bill_no").on(table.billNo),
    idxCreditNotesCustomerCreated: index(
      "idx_credit_notes_customer_created"
    ).on(table.customerId, table.createdAt),
    idxCreditNotesStoreIssued: index("idx_credit_notes_store_issued").on(
      table.storeId,
      table.issuedAt
    ),
  })
);

export const invoiceSnapshots = mysqlTable(
  "invoice_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    saleId: varchar("sale_id", { length: 36 }),
    orderId: int("order_id"),
    billNo: varchar("bill_no", { length: 100 }).notNull(),
    storeId: varchar("store_id", { length: 36 }).notNull(),
    customerId: varchar("customer_id", { length: 36 }),
    snapshotJson: json("snapshot_json").notNull(),
    snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(),
    pdfFileKey: varchar("pdf_file_key", { length: 500 }),
    pdfFileUrl: text("pdf_file_url"),
    status: mysqlEnum("status", [
      "generated",
      "pdf_generated",
      "failed",
      "cancelled",
    ])
      .notNull()
      .default("generated"),
    failureReason: text("failure_reason"),
    generatedBy: varchar("generated_by", { length: 36 }),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idxSaleId: uniqueIndex("idx_invoice_snapshots_sale_id_status_hash").on(
      t.saleId,
      t.status,
      t.snapshotHash
    ),
    idxInvoiceSnapshotsBillNo: index("idx_invoice_snapshots_bill_no").on(
      t.billNo
    ),
    idxInvoiceSnapshotsStoreGenerated: index(
      "idx_invoice_snapshots_store_generated"
    ).on(t.storeId, t.generatedAt),
    idxInvoiceSnapshotsCustomerGenerated: index(
      "idx_invoice_snapshots_customer_generated"
    ).on(t.customerId, t.generatedAt),
    idxInvoiceSnapshotsOrder: index("idx_invoice_snapshots_order").on(
      t.orderId
    ),
  })
);

export const invoiceSequences = mysqlTable(
  "invoice_sequences",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: varchar("store_id", { length: 36 }).notNull(),
    financialYear: varchar("financial_year", { length: 10 }).notNull(),
    documentType: mysqlEnum("document_type", [
      "sale_invoice",
      "credit_note",
      "debit_note",
      "return_note",
    ]).notNull(),
    prefix: varchar("prefix", { length: 80 }).notNull(),
    lastNumber: int("last_number").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    uqStoreFyDoc: uniqueIndex("uq_invoice_seq_store_fy_doc").on(
      t.storeId,
      t.financialYear,
      t.documentType
    ),
  })
);

// ─── Shift Closings ───────────────────────────────────────────────────────────
export const shiftClosings = mysqlTable("shift_closings", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  shiftDate: timestamp("shiftDate").notNull(),
  openingCash: decimal("openingCash", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  cashSales: decimal("cashSales", { precision: 12, scale: 2 }).default("0.00"),
  upiCardSales: decimal("upiCardSales", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  creditSales: decimal("creditSales", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  refunds: decimal("refunds", { precision: 12, scale: 2 }).default("0.00"),
  expenses: decimal("expenses", { precision: 12, scale: 2 }).default("0.00"),
  cashDeposited: decimal("cashDeposited", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  expectedCash: decimal("expectedCash", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  actualCash: decimal("actualCash", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  variance: decimal("variance", { precision: 12, scale: 2 }).default("0.00"),
  cashierId: int("cashierId").notNull(),
  pharmacistOnDutyId: int("pharmacistOnDutyId"),
  pendingOrders: int("pendingOrders").default(0),
  cancelledBills: int("cancelledBills").default(0),
  status: mysqlEnum("status", ["open", "submitted", "approved", "locked"])
    .default("open")
    .notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Sale = typeof sales.$inferSelect;
export type SaleLine = typeof saleLines.$inferSelect;
export type CounterPayment = typeof counterPayments.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = typeof refunds.$inferInsert;
export type PaymentRecord = typeof paymentRecords.$inferSelect;
export type SaleReturn = typeof saleReturns.$inferSelect;
export type SaleReturnLine = typeof saleReturnLines.$inferSelect;
export type CreditNote = typeof creditNotes.$inferSelect;
export type NewCreditNote = typeof creditNotes.$inferInsert;
export type ShiftClosing = typeof shiftClosings.$inferSelect;
