import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  smallint,
  date,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  dateOfBirth: date("date_of_birth"),
  phone: varchar("phone", { length: 500 }), // widened from 20: AES-GCM envelope needs ~67 chars
  phoneHash: varchar("phone_hash", { length: 64 }).unique(), // HMAC-SHA256 for deterministic lookup
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", [
    "user",
    "customer",
    "admin",
    "super_admin",
    "ops_admin",
    "pharmacist",
    "store_manager",
    "purchase_manager",
    "accountant",
    "cashier",
    "salesman",
    "rider",
    "inventory_operator",
    "delivery_operator",
    "auditor",
  ])
    .default("user")
    .notNull(),
  // Building/flat identity for routing
  buildingId: int("buildingId"),
  flatNumber: varchar("flatNumber", { length: 20 }),
  assignedStoreId: int("assignedStoreId"),
  onboardingComplete: boolean("onboardingComplete").default(false).notNull(),
  // Free-form address (when user types address instead of selecting a building)
  userAddress: text("userAddress"),
  userLat: decimal("userLat", { precision: 10, scale: 8 }),
  userLng: decimal("userLng", { precision: 11, scale: 8 }),
  // Staff assignment
  staffStoreId: int("staffStoreId"), // which store this staff member operates at
  // SM-B migration 0061: key version for field-level PII encryption
  encryptionKeyVersion: smallint("encryption_key_version").notNull().default(1),
  // Migration 0077: token version for session revocation.
  // Increment on logout, password reset, or suspension to invalidate all prior JWTs.
  tokenVersion: int("tokenVersion").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

// ─── Buildings ────────────────────────────────────────────────────────────────
export const buildings = mysqlTable("buildings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  address: text("address"),
  addressLine1: varchar("addressLine1", { length: 300 }),
  landmark: varchar("landmark", { length: 200 }),
  pincode: varchar("pincode", { length: 10 }),
  city: varchar("city", { length: 100 }),
  lat: decimal("lat", { precision: 10, scale: 8 }),
  lng: decimal("lng", { precision: 11, scale: 8 }),
  primaryStoreId: int("primaryStoreId"), // assigned serving pharmacy
  fallbackStoreId: int("fallbackStoreId"), // pincode-level fallback
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Stores (Pharmacy Nodes) ──────────────────────────────────────────────────
export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  type: mysqlEnum("type", ["in_building", "cluster_hub"])
    .default("in_building")
    .notNull(),
  address: text("address"),
  pincode: varchar("pincode", { length: 10 }),
  phone: varchar("phone", { length: 20 }),
  isActive: boolean("isActive").default(true).notNull(),
  slaMins: int("slaMins").default(20).notNull(),
  lat: decimal("lat", { precision: 10, scale: 8 }),
  lng: decimal("lng", { precision: 11, scale: 8 }),
  serviceRadius: int("serviceRadius").default(3000).notNull(),
  openingHours: text("openingHours"),
  priority: int("priority").default(10).notNull(),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Phase 5: Staff Assignments ───────────────────────────────────────────────
export const staffAssignments = mysqlTable("staff_assignments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  storeId: int("storeId").notNull(),
  role: mysqlEnum("role", [
    "pharmacist",
    "store_manager",
    "inventory_operator",
    "delivery_operator",
    "auditor",
  ]).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  assignedByUserId: int("assignedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── OTP Codes ────────────────────────────────────────────────────────────────
export const otpCodes = mysqlTable("otp_codes", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 20 }).notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  isUsed: boolean("isUsed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Staff Master ─────────────────────────────────────────────────────────────
export const staffMaster = mysqlTable("staff_master", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 300 }).notNull(),
  role: mysqlEnum("role", [
    "pharmacist",
    "salesman",
    "cashier",
    "store_manager",
    "purchase_manager",
    "delivery_rider",
    "admin",
    "other",
  ]).notNull(),
  salesmanCode: varchar("salesmanCode", { length: 50 }),
  pharmacistRegistrationNo: varchar("pharmacistRegistrationNo", {
    length: 100,
  }),
  storeId: int("storeId"),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 200 }),
  loginEnabled: boolean("loginEnabled").default(false).notNull(),
  linkedUserId: int("linkedUserId"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── store_capabilities: licence/service/cold-chain/controlled-drug per store ─
export const storeCapabilities = mysqlTable("store_capabilities", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull().unique(),
  licenceNumber: varchar("licenceNumber", { length: 100 }),
  gstin: varchar("gstin", { length: 20 }),
  licenceExpiryDate: timestamp("licenceExpiryDate"),
  licenceActive: boolean("licenceActive").default(true).notNull(),
  serviceActive: boolean("serviceActive").default(true).notNull(),
  serviceInactiveReason: varchar("serviceInactiveReason", { length: 300 }),
  pharmacistCoverage: boolean("pharmacistCoverage").default(true).notNull(),
  pharmacistName: varchar("pharmacistName", { length: 200 }),
  pharmacistRegNumber: varchar("pharmacistRegNumber", { length: 100 }),
  coldChainCapable: boolean("coldChainCapable").default(false).notNull(),
  controlledDrugCapable: boolean("controlledDrugCapable")
    .default(false)
    .notNull(),
  maxRiderCapacity: int("maxRiderCapacity").default(5).notNull(),
  currentRiderCount: int("currentRiderCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── States ──────────────────────────────────────────────────────────────────
export const states = mysqlTable("states", {
  id: int("id").autoincrement().primaryKey(),
  stateName: varchar("stateName", { length: 100 }).notNull(),
  stateCode: varchar("stateCode", { length: 10 }).notNull(),
  gstStateCode: varchar("gstStateCode", { length: 4 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Type exports ─────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Building = typeof buildings.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type StaffAssignment = typeof staffAssignments.$inferSelect;
export type OtpCode = typeof otpCodes.$inferSelect;
export type StaffMember = typeof staffMaster.$inferSelect;
export type StoreCapability = typeof storeCapabilities.$inferSelect;
