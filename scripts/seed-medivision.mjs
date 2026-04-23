/**
 * 24/7 Medivision Seed Script
 * Seeds real product data from TFS LUX PHARMACIES LLP Closing Stock (15-06-26)
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config({ quiet: true });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

const conn = await mysql.createConnection(DB_URL);

// ─── Truncate existing data ───────────────────────────────────────────────────
await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
for (const t of [
  "refill_reminders","whatsapp_sessions","order_items","orders",
  "cart_items","prescriptions","batches","store_skus","products",
  "stores","buildings"
]) {
  await conn.execute(`TRUNCATE TABLE \`${t}\``);
}
await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
console.log("✓ Tables cleared");

// ─── Buildings ────────────────────────────────────────────────────────────────
// Schema: id, name, address, pincode, city, primaryStoreId, fallbackStoreId, createdAt
await conn.execute(`
  INSERT INTO buildings (name, address, pincode, city, createdAt)
  VALUES
    ('Lodha Palava Phase 1', 'Palava City, Dombivli East', '421204', 'Thane', NOW()),
    ('Hiranandani Gardens', 'Powai, Mumbai', '400076', 'Mumbai', NOW()),
    ('Godrej Emerald', 'Thane West', '400607', 'Thane', NOW()),
    ('Runwal Forests', 'Kanjurmarg West, Mumbai', '400078', 'Mumbai', NOW())
`);
console.log("✓ Buildings inserted");

// ─── Stores (pharmacy nodes) ──────────────────────────────────────────────────
// Schema: id, name, type, address, pincode, phone, isActive, slaMins, createdAt
await conn.execute(`
  INSERT INTO stores (name, type, address, pincode, phone, isActive, slaMins, createdAt)
  VALUES
    ('24/7 Node — Lodha Palava', 'in_building', 'Ground Floor, Tower A, Lodha Palava Phase 1', '421204', '+912225001001', 1, 30, NOW()),
    ('24/7 Node — Hiranandani', 'in_building', 'Podium Level, Hiranandani Business Park', '400076', '+912225001002', 1, 25, NOW()),
    ('24/7 Node — Godrej Emerald', 'in_building', 'Amenity Block, Godrej Emerald', '400607', '+912225001003', 1, 35, NOW()),
    ('24/7 Node — Runwal Forests', 'in_building', 'Clubhouse Level, Runwal Forests', '400078', '+912225001004', 1, 30, NOW())
`);
console.log("✓ Stores inserted");

// Update buildings with primaryStoreId
await conn.execute(`UPDATE buildings SET primaryStoreId = 1 WHERE id = 1`);
await conn.execute(`UPDATE buildings SET primaryStoreId = 2 WHERE id = 2`);
await conn.execute(`UPDATE buildings SET primaryStoreId = 3 WHERE id = 3`);
await conn.execute(`UPDATE buildings SET primaryStoreId = 4 WHERE id = 4`);
console.log("✓ Buildings linked to stores");

// ─── Real Medivision Products ─────────────────────────────────────────────────
// Source: TFS LUX PHARMACIES LLP — Closing Stock as on 15-06-26
// Schema: id, name, brand, genericName, form, strength, packSize, schedule, requiresPrescription, isChronicMedication, hsnCode, barcode, imageUrl, createdAt, updatedAt
// schedule: 'H' = Rx only, 'H1' = narcotic, 'OTC' = over the counter
const products = [
  // ── Cardiovascular / Antihypertensives (Chronic) ──────────────────────────
  ["Amlodac D Tab", "Amlodac D", "Amlodipine + Atenolol", "Tablet", "5/50mg", "10 Tab", "H", 1, 1, 128.00],
  ["Amlovas-5 Tab", "Amlovas", "Amlodipine", "Tablet", "5mg", "15 Tab", "H", 1, 1, 30.48],
  ["Amlovas-M 2.5/25 Tab", "Amlovas-M", "Amlodipine + Metoprolol", "Tablet", "2.5/25mg", "10 Tab", "H", 1, 1, 91.61],
  ["Stamlo 5mg Tab", "Stamlo", "Amlodipine", "Tablet", "5mg", "15 Tab", "H", 1, 1, 450.00],
  ["Stamlo Beta Tab", "Stamlo Beta", "Amlodipine + Atenolol", "Tablet", "5/50mg", "15 Tab", "H", 1, 1, 540.00],
  ["Cardace 2.5 Tab", "Cardace", "Ramipril", "Tablet", "2.5mg", "15 Tab", "H", 1, 1, 63.60],
  ["Cardivas 3.125mg Tab", "Cardivas", "Carvedilol", "Tablet", "3.125mg", "15 Tab", "H", 1, 1, 61.07],
  ["Cardivas 6.25mg Tab", "Cardivas", "Carvedilol", "Tablet", "6.25mg", "15 Tab", "H", 1, 1, 97.88],
  ["Bisonext 5mg Tab", "Bisonext", "Bisoprolol", "Tablet", "5mg", "15 Tab", "H", 1, 1, 130.91],
  ["Metolar 25mg Tab", "Metolar", "Metoprolol Succinate", "Tablet", "25mg", "15 Tab", "H", 1, 1, 540.00],
  ["Metolar XR 25mg Tab", "Metolar XR", "Metoprolol Succinate XR", "Tablet", "25mg", "15 Tab", "H", 1, 1, 420.00],
  ["Eritel 40 Tab", "Eritel", "Telmisartan", "Tablet", "40mg", "10 Tab", "H", 1, 1, 384.00],
  ["Eritel H 40 Tab", "Eritel H", "Telmisartan + Hydrochlorothiazide", "Tablet", "40/12.5mg", "10 Tab", "H", 1, 1, 296.00],
  ["Tri Telsar 40 Tab", "Tri Telsar", "Telmisartan + Amlodipine + Chlorthalidone", "Tablet", "40mg", "10 Tab", "H", 1, 1, 1145.80],
  ["Ecosprin 75mg Tab", "Ecosprin", "Aspirin", "Tablet", "75mg", "14 Tab", "OTC", 0, 1, 280.00],
  ["Ecosprin AV 75/10 Cap", "Ecosprin AV", "Aspirin + Atorvastatin", "Capsule", "75/10mg", "10 Cap", "H", 1, 1, 450.00],
  ["Brilinta 90mg Tab", "Brilinta", "Ticagrelor", "Tablet", "90mg", "14 Tab", "H", 1, 1, 928.42],
  ["Minipress XL 2.5mg Tab", "Minipress XL", "Prazosin", "Tablet", "2.5mg", "30 Tab", "H", 1, 1, 450.00],
  ["Enalapril 5mg Tab", "Enalapril", "Enalapril Maleate", "Tablet", "5mg", "10 Tab", "H", 1, 1, 96.00],
  ["Arnicor 50 Tab", "Arnicor", "Trimetazidine", "Tablet", "50mg", "10 Tab", "H", 1, 1, 1460.14],

  // ── Lipid-Lowering / Statins (Chronic) ────────────────────────────────────
  ["Atorva-40 Tab", "Atorva", "Atorvastatin", "Tablet", "40mg", "10 Tab", "H", 1, 1, 153.93],
  ["Atorva-E Tab", "Atorva-E", "Atorvastatin + Ezetimibe", "Tablet", "10/10mg", "10 Tab", "H", 1, 1, 282.67],
  ["Rosuvas 10mg Tab", "Rosuvas", "Rosuvastatin", "Tablet", "10mg", "10 Tab", "H", 1, 1, 560.00],
  ["Rosuvas EZ 10mg Tab", "Rosuvas EZ", "Rosuvastatin + Ezetimibe", "Tablet", "10/10mg", "10 Tab", "H", 1, 1, 750.00],

  // ── Antidiabetics (Chronic) ───────────────────────────────────────────────
  ["Glycomet 500mg Tab", "Glycomet", "Metformin Hydrochloride", "Tablet", "500mg", "20 Tab", "H", 1, 1, 540.00],
  ["Glycomet GP 1 Tab", "Glycomet GP 1", "Metformin + Glipizide", "Tablet", "500/1mg", "15 Tab", "H", 1, 1, 420.00],
  ["Glycomet GP 2 Tab", "Glycomet GP 2", "Metformin + Glipizide", "Tablet", "500/2mg", "15 Tab", "H", 1, 1, 450.00],
  ["Glycomet Trio 1 Tab", "Glycomet Trio", "Metformin + Glipizide + Pioglitazone", "Tablet", "500/1/15mg", "15 Tab", "H", 1, 1, 480.00],
  ["Glucobay 25mg Tab", "Glucobay", "Acarbose", "Tablet", "25mg", "10 Tab", "H", 1, 1, 210.00],
  ["Human Mixtard 30/70", "Mixtard", "Insulin Human (Biphasic)", "Injection", "30/70 IU/ml", "3ml Vial", "H", 1, 1, 1200.00],
  ["Human Actrapid 100IU", "Actrapid", "Insulin Human (Regular)", "Injection", "100 IU/ml", "10ml Vial", "H", 1, 1, 980.00],

  // ── Gastrointestinal / Antacids ───────────────────────────────────────────
  ["Nexpro 40mg Tab", "Nexpro", "Esomeprazole", "Tablet", "40mg", "15 Tab", "OTC", 0, 0, 1050.00],
  ["Nexpro RD 40mg Tab", "Nexpro RD", "Esomeprazole + Domperidone", "Tablet", "40/10mg", "15 Tab", "OTC", 0, 0, 840.00],
  ["Mucaine Gel", "Mucaine", "Aluminium + Magnesium + Oxethazaine", "Gel", "170ml", "170ml Bottle", "OTC", 0, 0, 560.00],
  ["Duphalac Syrup", "Duphalac", "Lactulose", "Syrup", "3.35g/5ml", "200ml Bottle", "OTC", 0, 0, 567.00],
  ["Norflox TZ Tab", "Norflox TZ", "Norfloxacin + Tinidazole", "Tablet", "400/600mg", "10 Tab", "H", 1, 0, 280.00],

  // ── Analgesics / Antipyretics (OTC) ──────────────────────────────────────
  ["Dolo 650 Tab", "Dolo 650", "Paracetamol", "Tablet", "650mg", "10 Tab", "OTC", 0, 0, 345.00],
  ["Calpol 500+ Tab", "Calpol 500+", "Paracetamol", "Tablet", "500mg", "15 Tab", "OTC", 0, 0, 10.04],
  ["Calpol 250mg Syrup", "Calpol", "Paracetamol", "Syrup", "250mg/5ml", "60ml Bottle", "OTC", 0, 0, 146.90],
  ["Aceduoz MR Tab", "Aceduoz MR", "Aceclofenac + Paracetamol + Chlorzoxazone", "Tablet", "100/325/250mg", "10 Tab", "H", 1, 0, 207.87],

  // ── Antibiotics (Rx) ─────────────────────────────────────────────────────
  ["Augmentin Duo 625mg Tab", "Augmentin Duo", "Amoxicillin + Clavulanate", "Tablet", "625mg", "10 Tab", "H", 1, 0, 1791.73],
  ["Augmentin 375mg Tab", "Augmentin", "Amoxicillin + Clavulanate", "Tablet", "375mg", "10 Tab", "H", 1, 0, 193.91],
  ["Ceftum 500mg Tab", "Ceftum", "Cefuroxime Axetil", "Tablet", "500mg", "10 Tab", "H", 1, 0, 387.26],
  ["Cepodem 200 Tab", "Cepodem", "Cefpodoxime Proxetil", "Tablet", "200mg", "10 Tab", "H", 1, 0, 148.67],
  ["Cefakind-CV 250 Tab", "Cefakind-CV", "Cefuroxime + Clavulanate", "Tablet", "250mg", "10 Tab", "H", 1, 0, 823.56],

  // ── Respiratory / Allergy ─────────────────────────────────────────────────
  ["Montair LC Tab", "Montair LC", "Montelukast + Levocetirizine", "Tablet", "10/5mg", "10 Tab", "OTC", 0, 0, 750.00],
  ["Montair 10mg Tab", "Montair", "Montelukast", "Tablet", "10mg", "10 Tab", "OTC", 0, 0, 480.00],
  ["Budecort 0.5mg Respules", "Budecort", "Budesonide", "Respules", "0.5mg/2ml", "5x2ml", "H", 1, 1, 787.00],
  ["Viscodyne LS Syrup", "Viscodyne LS", "Ambroxol + Guaifenesin + Terbutaline", "Syrup", "100ml", "100ml Bottle", "OTC", 0, 0, 221.60],

  // ── Vitamins / Supplements (OTC) ─────────────────────────────────────────
  ["Supradyn Tab", "Supradyn", "Multivitamin + Minerals", "Tablet", "—", "15 Tab", "OTC", 0, 0, 900.00],
  ["Shelcal 500mg Tab", "Shelcal", "Calcium Carbonate + Vitamin D3", "Tablet", "500mg", "15 Tab", "OTC", 0, 0, 360.00],
  ["Calcimax Forte Plus Tab", "Calcimax Forte Plus", "Calcium + Vitamin D3 + Magnesium", "Tablet", "—", "30 Tab", "OTC", 0, 0, 198.25],
  ["Caldovera Tab", "Caldovera", "Calcium + Vitamin D3", "Tablet", "—", "10 Tab", "OTC", 0, 0, 242.72],
  ["Ultra D3 Syrup", "Ultra D3", "Cholecalciferol", "Syrup", "60000 IU/5ml", "100ml Bottle", "OTC", 0, 0, 120.39],
  ["Electral Powder", "Electral", "ORS (WHO Formula)", "Powder", "21.8g", "21.8g Sachet", "OTC", 0, 0, 15.00],

  // ── Antiseptics / Topical ─────────────────────────────────────────────────
  ["Betadine Gargle 2%", "Betadine", "Povidone Iodine", "Gargle", "2%", "100ml Bottle", "OTC", 0, 0, 225.62],
  ["Betadine Oint 10%", "Betadine", "Povidone Iodine", "Ointment", "10%", "20g Tube", "OTC", 0, 0, 91.95],
  ["Candid Cream", "Candid", "Clotrimazole", "Cream", "1%", "30g Tube", "OTC", 0, 0, 134.50],
  ["Candid B Cream", "Candid B", "Clotrimazole + Beclomethasone", "Cream", "1%/0.025%", "20g Tube", "H", 1, 0, 251.24],
  ["Hydrocortisone Cream 1%", "Hydrocortisone", "Hydrocortisone", "Cream", "1%", "20g Tube", "H", 1, 0, 120.00],
  ["Tretin 0.025%", "Tretin", "Tretinoin", "Cream", "0.025%", "30g Tube", "H", 1, 0, 157.49],
  ["Atogla Lotion", "Atogla", "Atogla", "Lotion", "—", "200ml Bottle", "OTC", 0, 0, 433.97],

  // ── Antiemetics / CNS ─────────────────────────────────────────────────────
  ["Emeset 4mg Tab", "Emeset", "Ondansetron", "Tablet", "4mg", "4 Tab", "H", 1, 0, 120.00],
  ["Stemetil 5mg Tab", "Stemetil", "Prochlorperazine", "Tablet", "5mg", "10 Tab", "H", 1, 0, 180.00],
  ["Alprax 0.25mg Tab", "Alprax", "Alprazolam", "Tablet", "0.25mg", "15 Tab", "H1", 1, 1, 30.21],

  // ── Immunosuppressants / Specialty (Rx) ──────────────────────────────────
  ["Azoran 50mg Tab", "Azoran", "Azathioprine", "Tablet", "50mg", "20 Tab", "H", 1, 1, 338.68],
  ["Tofatas 5mg Tab", "Tofatas", "Tofacitinib", "Tablet", "5mg", "14 Tab", "H", 1, 1, 518.49],

  // ── Wound Care / Surgical ─────────────────────────────────────────────────
  ["Tynocrep Bandage 10cm", "Tynocrep", "Crepe Bandage", "Bandage", "10cm x 4m", "1 Roll", "OTC", 0, 0, 87.64],
  ["Tynocrep Bandage 15cm", "Tynocrep", "Crepe Bandage", "Bandage", "15cm x 4m", "1 Roll", "OTC", 0, 0, 114.63],

  // ── OTC / General ─────────────────────────────────────────────────────────
  ["Vicks Vaporub 50g", "Vicks Vaporub", "Camphor + Menthol + Eucalyptus Oil", "Ointment", "—", "50g Jar", "OTC", 0, 0, 142.14],
  ["Vicks Inhaler", "Vicks Inhaler", "Camphor + Menthol + Eucalyptus Oil", "Inhaler", "—", "1 Unit", "OTC", 0, 0, 45.72],
  ["Amrutanjan Roll-On", "Amrutanjan", "Menthol + Camphor", "Topical", "—", "10ml Roll-On", "OTC", 0, 0, 50.16],
];

// Insert products
const productIds = [];
for (const [name, brand, genericName, form, strength, packSize, schedule, requiresPrescription, isChronicMedication, mrp] of products) {
  const [res] = await conn.execute(
    `INSERT INTO products (name, brand, genericName, form, strength, packSize, schedule, requiresPrescription, isChronicMedication, imageUrl, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
    [name, brand, genericName, form, strength, packSize, schedule, requiresPrescription, isChronicMedication]
  );
  productIds.push({ id: res.insertId, mrp, name });
}
console.log(`✓ ${productIds.length} products inserted`);

// ─── Store SKUs (assign all products to all 4 nodes with realistic stock) ─────
const batchExpiry = "2026-12-31";

for (const storeId of [1, 2, 3, 4]) {
  for (const { id: productId, mrp } of productIds) {
    const stockQty = Math.floor(Math.random() * 25) + 5;
    const sellingPrice = Math.round(mrp * 0.95 * 100) / 100;

    const [skuRes] = await conn.execute(
      `INSERT INTO store_skus (storeId, productId, mrp, sellingPrice, isActive, stockQty, softLockedQty, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?, 0, NOW(), NOW())`,
      [storeId, productId, mrp, sellingPrice, stockQty]
    );
    const storeSkuId = skuRes.insertId;

    // Create a batch for each SKU
    await conn.execute(
      `INSERT INTO batches (storeId, productId, batchNumber, expiryDate, quantity, status, createdAt)
       VALUES (?, ?, ?, ?, ?, 'active', NOW())`,
      [storeId, productId, `BATCH-${storeId}-${productId}-001`, batchExpiry, stockQty]
    );
  }
}
console.log("✓ Store SKUs and batches created for all 4 nodes");

await conn.end();
console.log("\n✅ Medivision seed complete — real product data loaded.");
console.log(`   ${productIds.length} products × 4 nodes = ${productIds.length * 4} store SKUs`);
