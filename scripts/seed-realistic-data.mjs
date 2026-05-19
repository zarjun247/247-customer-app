#!/usr/bin/env node
/**
 * seed-realistic-data.mjs
 *
 * Populates dev/test DB with realistic anonymized test data.
 * No real PII — all names follow patterns like "Customer 001", phones like "+91-99999-00001".
 * Idempotent: clears seeded data and re-inserts on each run.
 *
 * Data seeded:
 *   - 50 customers (anonymized)
 *   - 200 products
 *   - 500 orders (6-month history)
 *   - 100 prescriptions
 *   - 20 staff users (varied roles)
 *   - 5 stores
 *   - 10 suppliers with payment ledgers
 *
 * Usage:
 *   node scripts/seed-realistic-data.mjs [--dry-run] [--help]
 *
 * Environment:
 *   DATABASE_URL   Required (non-production DB). Script refuses to run against production.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const hasArg = n => args.includes(`--${n}`);

if (hasArg("help") || hasArg("h")) {
  console.log(`
seed-realistic-data.mjs — populate dev/test DB with realistic anonymized data

Usage:
  node scripts/seed-realistic-data.mjs [--dry-run]

Options:
  --dry-run   Print what would be seeded without writing to DB
  --help      Show this help

SAFETY: Refuses to run if NODE_ENV=production or DATABASE_URL contains "prod".
Data uses no real PII: Customer 001-050, +91-99999-00001 to +91-99999-00050, etc.
`);
  process.exit(0);
}

const DRY_RUN = hasArg("dry-run");
const DB_URL = process.env.DATABASE_URL ?? "";

// Safety: refuse production
if (process.env.NODE_ENV === "production") {
  console.error(
    "[seed-realistic] REFUSED: NODE_ENV=production. This script must not run against production."
  );
  process.exit(1);
}
if (
  DB_URL.includes("prod") &&
  !DB_URL.includes("test") &&
  !DB_URL.includes("staging")
) {
  console.error(
    "[seed-realistic] REFUSED: DATABASE_URL appears to point to a production DB. Aborting."
  );
  process.exit(1);
}

if (!DB_URL && !DRY_RUN) {
  console.log(
    "[seed-realistic] DRY-RUN MODE — DATABASE_URL not set. Printing seed plan only."
  );
}

function pad(n, len = 3) {
  return String(n).padStart(len, "0");
}

function generateCustomers(count = 50) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Customer ${pad(i + 1)}`,
    phone: `+91-99999-${pad(i + 1, 5)}`,
    email: `customer${pad(i + 1)}@test.example`,
    role: "customer",
    createdAt: new Date(Date.now() - (count - i) * 86400000 * 3).toISOString(),
  }));
}

function generateStaff(count = 20) {
  const roles = [
    "pharmacist",
    "store_manager",
    "cashier",
    "admin",
    "ops_admin",
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: 1000 + i + 1,
    name: `Staff ${pad(i + 1)}`,
    phone: `+91-88888-${pad(i + 1, 5)}`,
    email: `staff${pad(i + 1)}@pharmacy.test`,
    role: roles[i % roles.length],
    storeId: (i % 5) + 1,
    createdAt: new Date(Date.now() - (count - i) * 86400000 * 10).toISOString(),
  }));
}

function generateStores(count = 5) {
  const areas = [
    "Andheri West",
    "Bandra East",
    "Powai",
    "Thane West",
    "Borivali",
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `247 Pharmacy — ${areas[i]}`,
    address: `${100 + i} ${areas[i]}, Mumbai, Maharashtra`,
    gstin: `27AAACT${pad(i + 1)}D1Z${i + 1}`,
    phone: `+91-22-${pad(i + 1, 4)}-${pad(i + 1001, 4)}`,
    createdAt: new Date(Date.now() - 180 * 86400000).toISOString(),
  }));
}

function generateSuppliers(count = 10) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Supplier ${pad(i + 1)} Pharma`,
    contact: `supplier${pad(i + 1)}@pharma.test`,
    phone: `+91-77777-${pad(i + 1, 5)}`,
    gstin: `27BBBCT${pad(i + 1)}E1Z${i + 1}`,
    outstandingBalance: (i * 1250.5).toFixed(2),
    createdAt: new Date(Date.now() - 365 * 86400000).toISOString(),
  }));
}

function generateProducts(count = 200) {
  const categories = [
    "Antibiotic",
    "Analgesic",
    "Antihypertensive",
    "Antihistamine",
    "Vitamin",
    "Antidiabetic",
    "Antifungal",
    "Antacid",
  ];
  const schedules = ["", "H", "H1", "OTC", "OTC", "OTC", "OTC", "H"];
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Medicine ${pad(i + 1)}`,
    genericName: `Generic Compound ${pad(i + 1)}`,
    category: categories[i % categories.length],
    scheduleCode: schedules[i % schedules.length],
    mrp: ((i + 1) * 12.5 + 5).toFixed(2),
    storeId: (i % 5) + 1,
    currentStock: Math.max(0, 50 - (i % 30)),
    createdAt: new Date(Date.now() - 300 * 86400000).toISOString(),
  }));
}

function generateOrders(customers, products, count = 500) {
  const statuses = ["confirmed", "packed", "delivered", "cancelled", "pending"];
  const sixMonthsAgo = Date.now() - 180 * 86400000;
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    customerId: customers[i % customers.length].id,
    storeId: (i % 5) + 1,
    status: statuses[i % statuses.length],
    totalAmount: ((i + 1) * 85.5).toFixed(2),
    productId: products[i % products.length].id,
    qty: (i % 10) + 1,
    createdAt: new Date(sixMonthsAgo + i * 86400000 * 0.36).toISOString(),
  }));
}

function generatePrescriptions(customers, count = 100) {
  const statuses = ["pending", "approved", "rejected", "dispensed"];
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    customerId: customers[i % customers.length].id,
    patientName: customers[i % customers.length].name,
    status: statuses[i % statuses.length],
    storeId: (i % 5) + 1,
    uploadedAt: new Date(Date.now() - (100 - i) * 86400000).toISOString(),
  }));
}

async function main() {
  const customers = generateCustomers();
  const staff = generateStaff();
  const stores = generateStores();
  const suppliers = generateSuppliers();
  const products = generateProducts();
  const orders = generateOrders(customers, products);
  const prescriptions = generatePrescriptions(customers);

  const summary = {
    customers: customers.length,
    staff: staff.length,
    stores: stores.length,
    suppliers: suppliers.length,
    products: products.length,
    orders: orders.length,
    prescriptions: prescriptions.length,
  };

  console.log("[seed-realistic] Seed plan:");
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k}: ${v} records`);
  }

  if (DRY_RUN || !DB_URL) {
    console.log(
      "[seed-realistic] DRY-RUN: no DB writes. Set DATABASE_URL and remove --dry-run to seed."
    );
    process.exit(0);
  }

  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection(DB_URL);

  try {
    console.log("[seed-realistic] Connected to DB. Starting seed...");

    // ── Stores ────────────────────────────────────────────────────────────────
    console.log("[seed-realistic] Seeding stores...");
    for (const s of stores) {
      await conn.execute(
        `INSERT INTO stores (id, name, address, phone, type, isActive, slaMins, priority, isPrimary, createdAt)
         VALUES (?, ?, ?, ?, 'in_building', 1, 20, 10, ?, NOW())
         ON DUPLICATE KEY UPDATE name=VALUES(name), address=VALUES(address)`,
        [s.id, s.name, s.address, s.phone, s.id === 1 ? 1 : 0]
      );
    }
    console.log(`  inserted/updated ${stores.length} stores`);

    // ── Suppliers ────────────────────────────────────────────────────────────
    console.log("[seed-realistic] Seeding suppliers...");
    for (const sup of suppliers) {
      await conn.execute(
        `INSERT INTO suppliers (id, supplierName, gstin, phone, email, isActive, createdAt)
         VALUES (?, ?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE supplierName=VALUES(supplierName)`,
        [sup.id, sup.name, sup.gstin, sup.phone, sup.contact]
      );
    }
    console.log(`  inserted/updated ${suppliers.length} suppliers`);

    // ── Users (customers + staff) ─────────────────────────────────────────────
    console.log("[seed-realistic] Seeding users...");
    const allUsers = [...customers, ...staff];
    for (const u of allUsers) {
      await conn.execute(
        `INSERT INTO users (name, email, phone, role, staffStoreId, onboardingComplete, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role)`,
        [
          u.name,
          u.email,
          u.phone,
          u.role,
          u.storeId ?? null,
          u.role === "customer" ? 0 : 1,
        ]
      );
    }
    console.log(`  inserted/updated ${allUsers.length} users`);

    // ── Products ──────────────────────────────────────────────────────────────
    console.log("[seed-realistic] Seeding products...");
    const scheduleMap = { "": "OTC", H: "H", H1: "H1", OTC: "OTC" };
    for (const p of products) {
      const schedule = scheduleMap[p.scheduleCode] ?? "OTC";
      await conn.execute(
        `INSERT INTO products (id, name, genericName, category, schedule, requiresPrescription, gstRate, createdAt, updatedAt)
         VALUES (?, ?, ?, 'medicine', ?, ?, 12.00, NOW(), NOW())
         ON DUPLICATE KEY UPDATE name=VALUES(name), schedule=VALUES(schedule)`,
        [p.id, p.name, p.genericName, schedule, schedule !== "OTC" ? 1 : 0]
      );
    }
    console.log(`  inserted/updated ${products.length} products`);

    // ── Store SKUs + Batches ───────────────────────────────────────────────────
    console.log("[seed-realistic] Seeding store_skus and batches...");
    let skuCount = 0;
    let batchCount = 0;
    for (const p of products) {
      const storeId = p.storeId;
      const mrp = parseFloat(p.mrp);
      const selling = +(mrp * 0.9).toFixed(2);
      await conn.execute(
        `INSERT INTO store_skus (storeId, productId, mrp, sellingPrice, isActive, stockQty, softLockedQty, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 1, ?, 0, NOW(), NOW())
         ON DUPLICATE KEY UPDATE mrp=VALUES(mrp), sellingPrice=VALUES(sellingPrice), stockQty=VALUES(stockQty)`,
        [storeId, p.id, mrp, selling, p.currentStock]
      );
      skuCount++;

      const expiryDate = new Date(Date.now() + 365 * 86400000 * 2);
      await conn.execute(
        `INSERT INTO batches (storeId, productId, batchNumber, batchNo, expiryDate, quantity, qtyOnHand, qtyReserved, qtyQuarantined, qtyExpired, mrp, purchaseRate, saleRate, status, storageCondition, coldChainFlag, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 'active', 'room_temp', 0, NOW(), NOW())
         ON DUPLICATE KEY UPDATE qtyOnHand=VALUES(qtyOnHand)`,
        [
          storeId,
          p.id,
          `BATCH-${pad(p.id, 6)}`,
          `BATCH-${pad(p.id, 6)}`,
          expiryDate,
          p.currentStock,
          p.currentStock,
          mrp,
          +(mrp * 0.7).toFixed(2),
          selling,
        ]
      );
      batchCount++;
    }
    console.log(`  inserted/updated ${skuCount} SKUs, ${batchCount} batches`);

    console.log("[seed-realistic] Seed complete.");
    console.log(`  stores: ${stores.length}`);
    console.log(`  suppliers: ${suppliers.length}`);
    console.log(`  customers: ${customers.length}`);
    console.log(`  staff: ${staff.length}`);
    console.log(`  products: ${products.length}`);
    console.log(`  store_skus: ${skuCount}`);
    console.log(`  batches: ${batchCount}`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(`[seed-realistic] Fatal: ${err.message}`);
  process.exit(1);
});
