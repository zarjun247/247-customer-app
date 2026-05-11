import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  date,
  index,
} from "drizzle-orm/mysql-core";

// ─── Batches (FEFO tracking) ──────────────────────────────────────────────────
export const batches = mysqlTable(
  "batches",
  {
    id: int("id").autoincrement().primaryKey(),
    storeId: int("storeId").notNull(),
    productId: int("productId").notNull(),
    variantId: int("variantId"),
    // Legacy field kept for backward compat; use batchNo going forward
    batchNumber: varchar("batchNumber", { length: 100 }).notNull(),
    // Alias generated column (virtual) — use batchNo in all new code
    batchNo: varchar("batchNo", { length: 100 }),
    mfgDate: timestamp("mfgDate"),
    expiryDate: timestamp("expiryDate").notNull(),
    mrp: decimal("mrp", { precision: 10, scale: 2 }),
    purchaseRate: decimal("purchaseRate", { precision: 10, scale: 2 }),
    saleRate: decimal("saleRate", { precision: 10, scale: 2 }),
    schemeDiscount: decimal("schemeDiscount", {
      precision: 5,
      scale: 2,
    }).default("0"),
    cashDiscount: decimal("cashDiscount", { precision: 5, scale: 2 }).default(
      "0"
    ),
    landingCost: decimal("landingCost", { precision: 10, scale: 2 }),
    margin: decimal("margin", { precision: 5, scale: 2 }),
    // Legacy qty field; use qtyOnHand in all new code
    quantity: int("quantity").default(0).notNull(),
    qtyOnHand: int("qtyOnHand").default(0),
    qtyReserved: int("qtyReserved").default(0),
    qtyQuarantined: int("qtyQuarantined").default(0),
    qtyExpired: int("qtyExpired").default(0),
    internalBarcode: varchar("internalBarcode", { length: 100 }),
    manufacturerBarcode: varchar("manufacturerBarcode", { length: 100 }),
    purchaseInvoiceId: int("purchaseInvoiceId"),
    storageCondition: mysqlEnum("storageCondition", [
      "room_temp",
      "refrigerated",
      "frozen",
      "controlled",
    ]).default("room_temp"),
    coldChainFlag: boolean("coldChainFlag").default(false),
    expiryBucket: mysqlEnum("expiryBucket", [
      "normal",
      "warning",
      "critical",
      "quarantine_candidate",
      "expired",
    ]).default("normal"),
    status: mysqlEnum("status", [
      "active",
      "quarantined",
      "depleted",
      "expired",
      "recalled",
      "damaged",
      "returned_to_supplier",
    ])
      .default("active")
      .notNull(),
    // Legacy cost field
    unitCost: decimal("unitCost", { precision: 10, scale: 2 }),
    supplierId: int("supplierId"),
    grnId: int("grnId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow(),
  },
  t => ({
    idxBatchesStoreProductExpiry: index("idx_batches_store_product_expiry").on(
      t.storeId,
      t.productId,
      t.expiryDate
    ),
    idxBatchesStoreProductBatch: index("idx_batches_store_product_batch").on(
      t.storeId,
      t.productId,
      t.batchNumber
    ),
    idxBatchesInternalBarcode: index("idx_batches_internal_barcode").on(
      t.internalBarcode
    ),
    idxBatchesManufacturerBarcode: index("idx_batches_manufacturer_barcode").on(
      t.manufacturerBarcode
    ),
    idxBatchesStatusExpiry: index("idx_batches_status_expiry").on(
      t.status,
      t.expiryDate
    ),
  })
);

// ─── Upgraded Batch Ledger ────────────────────────────────────────────────────
// NOTE: The original `batches` table is kept for backward compat.
// This new table `batch_ledger` is the canonical PART 4 batch store.
export const batchLedger = mysqlTable(
  "batch_ledger",
  {
    id: int("id").autoincrement().primaryKey(),
    // Product linkage
    productId: int("productId").notNull(), // FK → products.id
    variantId: int("variantId"), // FK → product_variants.id
    storeId: int("storeId").notNull(), // FK → stores.id
    supplierId: int("supplierId"), // FK → suppliers.id
    // Batch identity
    batchNo: varchar("batchNo", { length: 100 }).notNull(),
    mfgDate: date("mfgDate"),
    expiryDate: date("expiryDate").notNull(),
    // Pricing
    mrp: decimal("mrp", { precision: 10, scale: 2 }).notNull(),
    purchaseRate: decimal("purchaseRate", {
      precision: 10,
      scale: 2,
    }).notNull(),
    saleRate: decimal("saleRate", { precision: 10, scale: 2 }).notNull(),
    schemeDiscount: decimal("schemeDiscount", {
      precision: 5,
      scale: 2,
    }).default("0.00"),
    cashDiscount: decimal("cashDiscount", { precision: 5, scale: 2 }).default(
      "0.00"
    ),
    landingCost: decimal("landingCost", { precision: 10, scale: 2 }),
    margin: decimal("margin", { precision: 5, scale: 2 }),
    // Quantities
    qtyOnHand: int("qtyOnHand").default(0).notNull(),
    qtyReserved: int("qtyReserved").default(0).notNull(),
    qtyQuarantined: int("qtyQuarantined").default(0).notNull(),
    qtyExpired: int("qtyExpired").default(0).notNull(),
    // Barcodes
    internalBarcode: varchar("internalBarcode", { length: 100 }),
    manufacturerBarcode: varchar("manufacturerBarcode", { length: 100 }),
    // References
    purchaseInvoiceId: int("purchaseInvoiceId"), // FK → purchase_invoices.id (future)
    grnId: int("grnId"), // FK → grn_records.id
    // Storage
    storageCondition: mysqlEnum("storageCondition", [
      "ambient",
      "cold_chain",
      "controlled",
      "frozen",
    ])
      .default("ambient")
      .notNull(),
    coldChainFlag: boolean("coldChainFlag").default(false).notNull(),
    // Expiry status (computed/cached)
    expiryBucket: mysqlEnum("expiryBucket", [
      "normal",
      "warning",
      "critical",
      "quarantine_candidate",
      "expired",
    ])
      .default("normal")
      .notNull(),
    // Batch status
    status: mysqlEnum("status", [
      "active",
      "quarantined",
      "depleted",
      "expired",
      "recalled",
      "damaged",
      "returned_to_supplier",
    ])
      .default("active")
      .notNull(),
    // Audit
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idxBatchLedgerStoreProductBatch: index(
      "idx_batch_ledger_store_product_batch"
    ).on(t.storeId, t.productId, t.batchNo),
    idxBatchLedgerStoreProductExpiry: index(
      "idx_batch_ledger_store_product_expiry"
    ).on(t.storeId, t.productId, t.expiryDate),
    idxBatchLedgerInternalBarcode: index(
      "idx_batch_ledger_internal_barcode"
    ).on(t.internalBarcode),
    idxBatchLedgerManufacturerBarcode: index(
      "idx_batch_ledger_manufacturer_barcode"
    ).on(t.manufacturerBarcode),
    idxBatchLedgerStatusExpiry: index("idx_batch_ledger_status_expiry").on(
      t.status,
      t.expiryDate
    ),
    idxBatchLedgerSupplierInvoice: index(
      "idx_batch_ledger_supplier_invoice"
    ).on(t.supplierId, t.purchaseInvoiceId),
  })
);

// ─── Stock Movements ──────────────────────────────────────────────────────────
export const stockMovements = mysqlTable(
  "stock_movements",
  {
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
  },
  t => ({
    idxStockMovementsStoreBatchDate: index(
      "idx_stock_movements_store_batch_date"
    ).on(t.storeId, t.batchId, t.createdAt),
    idxStockMovementsBatchDate: index("idx_stock_movements_batch_date").on(
      t.batchId,
      t.createdAt
    ),
    idxStockMovementsTypeDate: index("idx_stock_movements_type_date").on(
      t.movementType,
      t.createdAt
    ),
  })
);

// ─── Stock Adjustments ────────────────────────────────────────────────────────
export const stockAdjustments = mysqlTable("stock_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  storeId: int("storeId").notNull(),
  adjustmentType: mysqlEnum("adjustmentType", [
    "increase",
    "decrease",
  ]).notNull(),
  qty: int("qty").notNull(),
  reason: text("reason").notNull(),
  supportingNote: text("supportingNote"),
  status: mysqlEnum("status", ["pending_approval", "approved", "rejected"])
    .default("pending_approval")
    .notNull(),
  requestedBy: int("requestedBy").notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Stock Reservations ───────────────────────────────────────────────────────
export const stockReservations = mysqlTable(
  "stock_reservations",
  {
    id: int("id").autoincrement().primaryKey(),
    batchId: int("batchId"),
    orderId: int("orderId"),
    cartId: int("cartId"),
    productId: int("productId").notNull(),
    variantId: int("variantId"),
    skuId: int("skuId"),
    storeId: int("storeId").notNull(),
    qty: int("qty").notNull(),
    qtyReserved: int("qtyReserved").notNull(),
    status: mysqlEnum("status", [
      "active",
      "released",
      "expired",
      "consumed",
      "cancelled",
    ])
      .default("active")
      .notNull(),
    releaseReason: varchar("releaseReason", { length: 200 }),
    reservedAt: timestamp("reservedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    expiresAt: timestamp("expiresAt"),
    fulfilledAt: timestamp("fulfilledAt"),
    cancelledAt: timestamp("cancelledAt"),
  },
  t => ({
    idxStockReservationsStoreStatusExpires: index(
      "idx_stock_reservations_store_status_expires"
    ).on(t.storeId, t.status, t.expiresAt),
    idxStockReservationsSkuStatusExpires: index(
      "idx_stock_reservations_sku_status_expires"
    ).on(t.skuId, t.status, t.expiresAt),
    idxStockReservationsProductStatus: index(
      "idx_stock_reservations_product_status"
    ).on(t.productId, t.status),
    idxStockReservationsOrderStatus: index(
      "idx_stock_reservations_order_status"
    ).on(t.orderId, t.status),
    idxStockReservationsCartStatus: index(
      "idx_stock_reservations_cart_status"
    ).on(t.cartId, t.status),
  })
);

// ─── Stock Transfers ──────────────────────────────────────────────────────────
export const stockTransfers = mysqlTable("stock_transfers", {
  id: int("id").autoincrement().primaryKey(),
  fromStoreId: int("fromStoreId").notNull(),
  toStoreId: int("toStoreId").notNull(),
  batchId: int("batchId").notNull(),
  productId: int("productId").notNull(),
  qtyTransferred: int("qtyTransferred").notNull(),
  transferType: mysqlEnum("transferType", [
    "inter_store",
    "batch_to_batch",
    "return_to_supplier",
  ])
    .default("inter_store")
    .notNull(),
  status: mysqlEnum("status", [
    "pending",
    "in_transit",
    "received",
    "cancelled",
  ])
    .default("pending")
    .notNull(),
  initiatedBy: int("initiatedBy").notNull(),
  receivedBy: int("receivedBy"),
  initiatedAt: timestamp("initiatedAt").defaultNow().notNull(),
  receivedAt: timestamp("receivedAt"),
  note: text("note"),
});

// ─── Stock Audits ─────────────────────────────────────────────────────────────
export const stockAudits = mysqlTable("stock_audits", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  auditType: mysqlEnum("auditType", [
    "full",
    "spot_check",
    "expiry_sweep",
    "scheduled",
  ])
    .default("full")
    .notNull(),
  status: mysqlEnum("status", [
    "draft",
    "in_progress",
    "completed",
    "cancelled",
  ])
    .default("draft")
    .notNull(),
  startedBy: int("startedBy").notNull(),
  completedBy: int("completedBy"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  totalVariances: int("totalVariances").default(0),
  note: text("note"),
});

export const stockAuditLines = mysqlTable("stock_audit_lines", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull(),
  batchId: int("batchId").notNull(),
  productId: int("productId").notNull(),
  systemQty: int("systemQty").notNull(),
  countedQty: int("countedQty"),
  variance: int("variance"), // countedQty - systemQty
  status: mysqlEnum("status", ["pending", "counted", "approved", "adjusted"])
    .default("pending")
    .notNull(),
  countedBy: int("countedBy"),
  countedAt: timestamp("countedAt"),
});

// ─── Batch Quarantine Logs ────────────────────────────────────────────────────
export const batchQuarantineLogs = mysqlTable("batch_quarantine_logs", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  productId: int("productId").notNull(),
  storeId: int("storeId").notNull(),
  reason: mysqlEnum("reason", [
    "near_expiry",
    "quality_issue",
    "recall",
    "damage",
    "cold_chain_breach",
    "manual",
  ]).notNull(),
  qtyQuarantined: int("qtyQuarantined").notNull(),
  initiatedBy: int("initiatedBy").notNull(),
  approvedBy: int("approvedBy"),
  status: mysqlEnum("status", [
    "pending_review",
    "approved",
    "released",
    "disposed",
  ])
    .default("pending_review")
    .notNull(),
  note: text("note"),
  initiatedAt: timestamp("initiatedAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

// ─── Expiry Actions ───────────────────────────────────────────────────────────
export const expiryActions = mysqlTable("expiry_actions", {
  id: int("id").autoincrement().primaryKey(),
  batchId: int("batchId").notNull(),
  productId: int("productId").notNull(),
  storeId: int("storeId").notNull(),
  expiryDate: date("expiryDate").notNull(),
  daysToExpiry: int("daysToExpiry").notNull(),
  expiryBucket: mysqlEnum("expiryBucket", [
    "normal",
    "warning",
    "critical",
    "quarantine_candidate",
    "expired",
  ]).notNull(),
  actionTaken: mysqlEnum("actionTaken", [
    "flagged",
    "price_reduced",
    "quarantined",
    "returned_to_supplier",
    "disposed",
    "sold_before_expiry",
    "no_action",
  ])
    .default("flagged")
    .notNull(),
  actionBy: int("actionBy"),
  actionAt: timestamp("actionAt").defaultNow().notNull(),
  note: text("note"),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Batch = typeof batches.$inferSelect;
export type BatchLedger = typeof batchLedger.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type StockReservation = typeof stockReservations.$inferSelect;
export type StockTransfer = typeof stockTransfers.$inferSelect;
export type StockAudit = typeof stockAudits.$inferSelect;
export type StockAuditLine = typeof stockAuditLines.$inferSelect;
export type BatchQuarantineLog = typeof batchQuarantineLogs.$inferSelect;
export type ExpiryAction = typeof expiryActions.$inferSelect;
