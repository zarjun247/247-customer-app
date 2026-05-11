import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  index,
} from "drizzle-orm/mysql-core";

// ─── Products (Global Catalog) ────────────────────────────────────────────────
export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 300 }).notNull(),
    brand: varchar("brand", { length: 200 }),
    genericName: varchar("genericName", { length: 300 }),
    form: varchar("form", { length: 100 }),
    strength: varchar("strength", { length: 100 }),
    packSize: varchar("packSize", { length: 100 }),
    schedule: mysqlEnum("schedule", ["OTC", "H", "H1", "X"])
      .default("OTC")
      .notNull(),
    requiresPrescription: boolean("requiresPrescription")
      .default(false)
      .notNull(),
    isChronicMedication: boolean("isChronicMedication")
      .default(false)
      .notNull(),
    category: mysqlEnum("category", [
      "medicine",
      "devices",
      "baby",
      "nutrition",
      "fmcg",
      "wellness",
    ])
      .default("medicine")
      .notNull(),
    companyName: varchar("companyName", { length: 200 }),
    companyCode: varchar("companyCode", { length: 20 }),
    hsnCode: varchar("hsnCode", { length: 20 }),
    barcode: varchar("barcode", { length: 100 }),
    imageUrl: text("imageUrl"),
    imageApprovalStatus: mysqlEnum("imageApprovalStatus", [
      "pending",
      "approved",
      "rejected",
    ])
      .default("pending")
      .notNull(),
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
    searchableTokens: text("searchableTokens"), // space-separated normalized tokens for FTS
    canonicalName: varchar("canonicalName", { length: 300 }), // normalized deduped name
    masterProductId: int("masterProductId"), // FK to canonical product (for dedup)
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idxProductsCanonicalName: index("idx_products_canonical_name").on(
      t.canonicalName
    ),
    idxProductsCompanyName: index("idx_products_company_name").on(
      t.companyName
    ),
    idxProductsHsnCode: index("idx_products_hsn_code").on(t.hsnCode),
    idxProductsSchedule: index("idx_products_schedule").on(t.schedule),
    idxProductsBarcode: index("idx_products_barcode").on(t.barcode),
  })
);

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
export const storeSkus = mysqlTable(
  "store_skus",
  {
    id: int("id").autoincrement().primaryKey(),
    // Sponsored shelf / monetization hooks (OTC/wellness/nutrition/devices/personal care only)
    isFeatured: boolean("isFeatured").default(false).notNull(),
    sponsorPriority: int("sponsorPriority").default(0).notNull(), // higher = shown first
    sponsorCategory: varchar("sponsorCategory", { length: 50 }), // 'featured_brand' | 'sponsored_shelf' | 'brand_spotlight'
    sponsorLabel: varchar("sponsorLabel", { length: 100 }), // display label e.g. "Sponsored"
    sponsorValidUntil: timestamp("sponsorValidUntil"), // null = permanent
    storeId: int("storeId").notNull(),
    productId: int("productId").notNull(),
    variantId: int("variantId"),
    mrp: decimal("mrp", { precision: 10, scale: 2 }).notNull(),
    sellingPrice: decimal("sellingPrice", {
      precision: 10,
      scale: 2,
    }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    stockQty: int("stockQty").default(0).notNull(),
    softLockedQty: int("softLockedQty").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  t => ({
    idxStoreSkusStoreProduct: index("idx_store_skus_store_product").on(
      t.storeId,
      t.productId
    ),
    idxStoreSkusStoreActiveStock: index("idx_store_skus_store_active_stock").on(
      t.storeId,
      t.isActive,
      t.stockQty
    ),
    idxStoreSkusProductVariant: index("idx_store_skus_product_variant").on(
      t.productId,
      t.variantId
    ),
  })
);

// ─── Product Aliases ──────────────────────────────────────────────────────────
export const productAliases = mysqlTable("product_aliases", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  alias: varchar("alias", { length: 300 }).notNull(),
  aliasType: mysqlEnum("aliasType", [
    "supplier_code",
    "legacy_code",
    "medivision_code",
    "samarth_code",
    "barcode",
    "other",
  ])
    .default("other")
    .notNull(),
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
  lockType: mysqlEnum("lockType", [
    "min_margin",
    "max_discount",
    "price_lock",
    "sale_block",
  ]).notNull(),
  lockValue: decimal("lockValue", { precision: 10, scale: 2 }),
  roleOverrideRequired: boolean("roleOverrideRequired").default(true).notNull(),
  reason: text("reason"),
  createdBy: int("createdBy").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Product Barcodes ─────────────────────────────────────────────────────────
export const productBarcodes = mysqlTable(
  "product_barcodes",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    barcode: varchar("barcode", { length: 200 }).notNull(),
    barcodeType: mysqlEnum("barcodeType", [
      "ean13",
      "ean8",
      "code128",
      "qr",
      "datamatrix",
      "other",
    ])
      .default("ean13")
      .notNull(),
    isPrimary: boolean("isPrimary").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  t => ({
    idxProductBarcodesBarcode: index("idx_product_barcodes_barcode").on(
      t.barcode
    ),
    idxProductBarcodesProduct: index("idx_product_barcodes_product").on(
      t.productId
    ),
  })
);

// ─── Product Margin Rules ─────────────────────────────────────────────────────
export const productMarginRules = mysqlTable("product_margin_rules", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull(),
  storeId: int("storeId"),
  minMarginPct: decimal("minMarginPct", { precision: 5, scale: 2 }).default(
    "0.00"
  ),
  maxDiscountPct: decimal("maxDiscountPct", { precision: 5, scale: 2 }).default(
    "0.00"
  ),
  roleOverrideRequired: boolean("roleOverrideRequired")
    .default(false)
    .notNull(),
  effectiveFrom: timestamp("effectiveFrom").defaultNow().notNull(),
  effectiveTo: timestamp("effectiveTo"),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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

// ─── Drug / Product Category Master ─────────────────────────────────────────
export const drugCategories = mysqlTable("drug_categories", {
  id: int("id").autoincrement().primaryKey(),
  categoryName: varchar("categoryName", { length: 200 }).notNull(),
  parentCategoryId: int("parentCategoryId"),
  marginPolicy: decimal("marginPolicy", { precision: 5, scale: 2 }).default(
    "0.00"
  ),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = typeof productVariants.$inferInsert;
export type StoreSku = typeof storeSkus.$inferSelect;
export type Manufacturer = typeof manufacturers.$inferSelect;
export type ProductBarcode = typeof productBarcodes.$inferSelect;
export type ProductMarginRule = typeof productMarginRules.$inferSelect;
