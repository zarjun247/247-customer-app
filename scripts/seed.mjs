import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

// ─── Stores ───────────────────────────────────────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO stores (id, name, type, address, pincode, phone, isActive, slaMins) VALUES
  (1, 'Prestige Lakeside Node', 'in_building', 'Prestige Lakeside Habitat, Varthur, Bangalore', '560087', '+91-9900000001', 1, 15),
  (2, 'Sobha Dream Acres Node', 'in_building', 'Sobha Dream Acres, Panathur, Bangalore', '560103', '+91-9900000002', 1, 20),
  (3, 'Whitefield Cluster Hub', 'cluster_hub', 'Whitefield Main Road, Bangalore', '560066', '+91-9900000003', 1, 30)
`);

// ─── Buildings ────────────────────────────────────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO buildings (id, name, address, pincode, city, primaryStoreId, fallbackStoreId) VALUES
  (1, 'Prestige Lakeside — Tower A', 'Prestige Lakeside Habitat, Varthur Main Road', '560087', 'Bangalore', 1, 3),
  (2, 'Prestige Lakeside — Tower B', 'Prestige Lakeside Habitat, Varthur Main Road', '560087', 'Bangalore', 1, 3),
  (3, 'Sobha Dream Acres — Block 1', 'Sobha Dream Acres, Panathur Road', '560103', 'Bangalore', 2, 3),
  (4, 'Sobha Dream Acres — Block 2', 'Sobha Dream Acres, Panathur Road', '560103', 'Bangalore', 2, 3),
  (5, 'Brigade Cosmopolis', 'Brigade Cosmopolis, Whitefield', '560066', 'Bangalore', 3, 3)
`);

// ─── Products ─────────────────────────────────────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO products (id, name, brand, genericName, form, strength, packSize, schedule, requiresPrescription, isChronicMedication, barcode) VALUES
  (1, 'Crocin 500mg Tablets', 'GSK', 'Paracetamol', 'Tablet', '500mg', 'Strip of 15', 'OTC', 0, 0, '8901571000012'),
  (2, 'Dolo 650 Tablets', 'Micro Labs', 'Paracetamol', 'Tablet', '650mg', 'Strip of 15', 'OTC', 0, 0, '8906025500015'),
  (3, 'Azithral 500mg', 'Alembic', 'Azithromycin', 'Tablet', '500mg', 'Strip of 5', 'H', 1, 0, '8906025500022'),
  (4, 'Metformin 500mg', 'Sun Pharma', 'Metformin HCl', 'Tablet', '500mg', 'Strip of 10', 'H', 1, 1, '8906025500039'),
  (5, 'Amlodipine 5mg', 'Cipla', 'Amlodipine Besylate', 'Tablet', '5mg', 'Strip of 10', 'H', 1, 1, '8906025500046'),
  (6, 'Pantoprazole 40mg', 'Zydus', 'Pantoprazole Sodium', 'Tablet', '40mg', 'Strip of 15', 'H', 1, 0, '8906025500053'),
  (7, 'ORS Electral Powder', 'Franco-Indian', 'Oral Rehydration Salts', 'Powder', 'Standard', 'Pack of 5 sachets', 'OTC', 0, 0, '8906025500060'),
  (8, 'Betadine 500ml', 'Win-Medicare', 'Povidone Iodine', 'Solution', '10%', '500ml Bottle', 'OTC', 0, 0, '8906025500077'),
  (9, 'Atorvastatin 10mg', 'Ranbaxy', 'Atorvastatin Calcium', 'Tablet', '10mg', 'Strip of 10', 'H', 1, 1, '8906025500084'),
  (10, 'Montelukast 10mg', 'Dr. Reddys', 'Montelukast Sodium', 'Tablet', '10mg', 'Strip of 10', 'H', 1, 1, '8906025500091'),
  (11, 'Cetirizine 10mg', 'Cipla', 'Cetirizine HCl', 'Tablet', '10mg', 'Strip of 10', 'OTC', 0, 0, '8906025500108'),
  (12, 'Vitamin D3 60000 IU', 'Mankind', 'Cholecalciferol', 'Capsule', '60000 IU', 'Strip of 4', 'OTC', 0, 1, '8906025500115'),
  (13, 'Glucon-D Orange 500g', 'Heinz', 'Glucose Powder', 'Powder', 'Standard', '500g Tin', 'OTC', 0, 0, '8906025500122'),
  (14, 'Digene Gel 200ml', 'Abbott', 'Aluminium Hydroxide + Magnesium Hydroxide', 'Gel', 'Standard', '200ml Bottle', 'OTC', 0, 0, '8906025500129'),
  (15, 'Telmisartan 40mg', 'Glenmark', 'Telmisartan', 'Tablet', '40mg', 'Strip of 10', 'H', 1, 1, '8906025500136')
`);

// ─── Store SKUs (Node 1 — Prestige Lakeside) ──────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO store_skus (storeId, productId, mrp, sellingPrice, isActive, stockQty, softLockedQty) VALUES
  (1, 1, 32.00, 30.00, 1, 120, 0),
  (1, 2, 30.00, 28.00, 1, 85, 0),
  (1, 3, 145.00, 138.00, 1, 40, 0),
  (1, 4, 42.00, 38.00, 1, 200, 0),
  (1, 5, 55.00, 50.00, 1, 150, 0),
  (1, 6, 78.00, 72.00, 1, 90, 0),
  (1, 7, 25.00, 22.00, 1, 60, 0),
  (1, 8, 185.00, 175.00, 1, 25, 0),
  (1, 9, 65.00, 60.00, 1, 110, 0),
  (1, 10, 95.00, 88.00, 1, 75, 0),
  (1, 11, 28.00, 25.00, 1, 180, 0),
  (1, 12, 125.00, 115.00, 1, 50, 0),
  (1, 13, 85.00, 80.00, 1, 30, 0),
  (1, 14, 95.00, 88.00, 1, 45, 0),
  (1, 15, 72.00, 65.00, 1, 130, 0)
`);

// ─── Store SKUs (Node 2 — Sobha Dream Acres) ─────────────────────────────────
await conn.execute(`
  INSERT IGNORE INTO store_skus (storeId, productId, mrp, sellingPrice, isActive, stockQty, softLockedQty) VALUES
  (2, 1, 32.00, 30.00, 1, 90, 0),
  (2, 2, 30.00, 28.00, 1, 70, 0),
  (2, 4, 42.00, 38.00, 1, 160, 0),
  (2, 5, 55.00, 50.00, 1, 120, 0),
  (2, 9, 65.00, 60.00, 1, 80, 0),
  (2, 11, 28.00, 25.00, 1, 140, 0),
  (2, 12, 125.00, 115.00, 1, 40, 0),
  (2, 15, 72.00, 65.00, 1, 100, 0)
`);

// ─── Batches ──────────────────────────────────────────────────────────────────
const futureDate = new Date();
futureDate.setFullYear(futureDate.getFullYear() + 1);
const nearExpiry = new Date();
nearExpiry.setDate(nearExpiry.getDate() + 55); // 55 days — triggers 60-day critical queue

await conn.execute(`
  INSERT IGNORE INTO batches (storeId, productId, batchNumber, expiryDate, quantity, status) VALUES
  (1, 1, 'CRO-2024-001', ?, 120, 'active'),
  (1, 2, 'DOL-2024-001', ?, 85, 'active'),
  (1, 4, 'MET-2024-001', ?, 200, 'active'),
  (1, 5, 'AML-2024-001', ?, 150, 'active'),
  (1, 6, 'PAN-2024-001', ?, 90, 'active'),
  (1, 9, 'ATO-2024-001', ?, 110, 'active'),
  (1, 15, 'TEL-2024-001', ?, 130, 'active'),
  (1, 3, 'AZI-NEAR-001', ?, 40, 'active')
`, [
  futureDate, futureDate, futureDate, futureDate,
  futureDate, futureDate, futureDate, nearExpiry
]);

console.log("✅ Seed complete: stores, buildings, products, SKUs, and batches inserted.");
await conn.end();
