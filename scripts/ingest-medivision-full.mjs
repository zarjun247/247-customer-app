/**
 * Full Medivision bulk ingestion script — uses multi-row INSERT for speed.
 * Loads all 4,159 unique SKUs and 4,253 batch rows from the parsed JSON.
 * Run: node scripts/ingest-medivision-full.mjs
 */
import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const BATCHES_FILE = "/home/ubuntu/medivision_batches.json";
const SKUS_FILE = "/home/ubuntu/medivision_skus.json";

const STORES = [
  { id: 1, name: "24/7 — Salsette 27 Tower A", address: "Shop A-001, Ground Floor, Tower A, Salsette 27, Bhandup West, Mumbai 400078", pincode: "400078", phone: "9028942894", slaMins: 20 },
  { id: 2, name: "24/7 — Salsette 27 Tower B", address: "Shop B-001, Ground Floor, Tower B, Salsette 27, Bhandup West, Mumbai 400078", pincode: "400078", phone: "9028942894", slaMins: 22 },
  { id: 3, name: "24/7 — Godrej Emerald",       address: "Ground Floor, Godrej Emerald, Thane West, Mumbai 400601",                    pincode: "400601", phone: "9028942894", slaMins: 25 },
  { id: 4, name: "24/7 — Hiranandani Estate",   address: "Shop 1, Hiranandani Estate, Thane West, Mumbai 400607",                     pincode: "400607", phone: "9028942894", slaMins: 28 },
];

const STOCK_DIST = [0.40, 0.25, 0.20, 0.15];

function parseFormAndStrength(name, unit) {
  const formPatterns = [
    [/\bTAB\b|\bTABLET\b/i, "Tablet"],
    [/\bCAP\b|\bCAPSULE\b|\bSOFTGEL\b/i, "Capsule"],
    [/\bSYP\b|\bSYRUP\b/i, "Syrup"],
    [/\bSUSP\b|\bSUSPENSION\b/i, "Suspension"],
    [/\bINJ\b|\bINJECTION\b/i, "Injection"],
    [/\bDROPS?\b/i, "Drops"],
    [/\bCREAM\b/i, "Cream"],
    [/\bOINT\b|\bOINTMENT\b/i, "Ointment"],
    [/\bGEL\b/i, "Gel"],
    [/\bLOTION\b/i, "Lotion"],
    [/\bSOLN\b|\bSOLUTION\b/i, "Solution"],
    [/\bSPRAY\b/i, "Spray"],
    [/\bINHALER\b/i, "Inhaler"],
    [/\bSACHET\b/i, "Sachet"],
    [/\bPOWDER\b|\bPDR\b/i, "Powder"],
    [/\bSUPP\b|\bSUPPOSITORY\b/i, "Suppository"],
    [/\bPATCH\b/i, "Patch"],
    [/\bLOZENGE\b/i, "Lozenge"],
    [/\bGRANULE\b/i, "Granules"],
  ];
  let form = null;
  for (const [re, f] of formPatterns) {
    if (re.test(name) || re.test(unit)) { form = f; break; }
  }
  const sm = name.match(/(\d+(?:\.\d+)?(?:mg|mcg|g|ml|iu|%|mEq|units?)(?:\/\d+(?:\.\d+)?(?:mg|mcg|g|ml)?)?)/i);
  return { form, strength: sm ? sm[0] : null };
}

// Simple deterministic barcode from product index
function makeBarcode(idx) {
  return String(8901234000000 + idx).slice(0, 13);
}

async function bulkInsert(conn, table, columns, rows, chunkSize = 500) {
  if (!rows.length) return;
  const placeholders = `(${columns.map(() => "?").join(",")})`;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const sql = `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(",")}) VALUES ${chunk.map(() => placeholders).join(",")}`;
    const flat = chunk.flat();
    await conn.execute(sql, flat);
  }
}

async function main() {
  console.log("Connecting...");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  console.log("Loading parsed data...");
  const batches = JSON.parse(readFileSync(BATCHES_FILE, "utf-8"));
  const skus    = JSON.parse(readFileSync(SKUS_FILE, "utf-8"));
  console.log(`  ${skus.length} unique SKUs, ${batches.length} batch rows`);

  // Clear
  console.log("Clearing existing product data...");
  await conn.execute("SET FOREIGN_KEY_CHECKS=0");
  await conn.execute("TRUNCATE TABLE batches");
  await conn.execute("TRUNCATE TABLE store_skus");
  await conn.execute("TRUNCATE TABLE products");
  await conn.execute("SET FOREIGN_KEY_CHECKS=1");

  // Ensure stores
  for (const s of STORES) {
    await conn.execute(
      "INSERT INTO stores (id,name,address,pincode,phone,slaMins,isActive) VALUES (?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name),address=VALUES(address)",
      [s.id, s.name, s.address, s.pincode, s.phone, s.slaMins]
    );
  }
  console.log(`Ensured ${STORES.length} stores`);

  // Build product rows
  console.log("Building product rows...");
  const productRows = [];
  const productIdMap = new Map(); // name_upper -> index (1-based after insert)

  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i];
    const { form, strength } = parseFormAndStrength(sku.name, sku.unit);
    const barcode = makeBarcode(i + 1);
    productRows.push([
      sku.name,
      sku.company,
      null,           // genericName
      form,
      strength,
      sku.unit,       // packSize
      sku.schedule,
      sku.requires_prescription ? 1 : 0,
      sku.is_chronic ? 1 : 0,
      sku.category,
      sku.company,
      sku.company_code,
      barcode,
      null,           // imageUrl
      "pending",      // imageApprovalStatus
    ]);
  }

  // Bulk insert products
  console.log("Inserting products (bulk)...");
  const productCols = ["name","brand","genericName","form","strength","packSize","schedule",
    "requiresPrescription","isChronicMedication","category","companyName","companyCode",
    "barcode","imageUrl","imageApprovalStatus"];
  await bulkInsert(conn, "products", productCols, productRows, 200);

  // Fetch back inserted IDs in order (name is unique enough for our purposes)
  console.log("Fetching inserted product IDs...");
  const [insertedProducts] = await conn.execute("SELECT id, name FROM products ORDER BY id ASC");
  for (const p of insertedProducts) {
    productIdMap.set(p.name.toUpperCase().trim(), p.id);
  }
  console.log(`  Mapped ${productIdMap.size} product IDs`);

  // Build store_sku rows
  console.log("Building store SKU rows...");
  const skuRows = [];
  const storeSkuIdMap = new Map(); // `storeId_productId` -> index in skuRows (for batch linking)

  for (const sku of skus) {
    const productId = productIdMap.get(sku.name.toUpperCase().trim());
    if (!productId) continue;
    const mrp = Math.round(sku.avg_unit_price * 1.05 * 100) / 100;
    const sp  = Math.round(sku.avg_unit_price * 100) / 100;

    for (let si = 0; si < STORES.length; si++) {
      const store = STORES[si];
      const qty = Math.max(1, Math.round(sku.total_qty * STOCK_DIST[si]));
      skuRows.push([store.id, productId, mrp, sp, 1, qty, 0]);
    }
  }

  console.log(`Inserting ${skuRows.length} store SKUs (bulk)...`);
  await bulkInsert(conn, "store_skus", ["storeId","productId","mrp","sellingPrice","isActive","stockQty","softLockedQty"], skuRows, 500);

  // Fetch store_sku IDs for primary store (store 1) for batch linking
  console.log("Fetching store SKU IDs...");
  const [insertedSkus] = await conn.execute("SELECT id, productId FROM store_skus WHERE storeId=1 ORDER BY id ASC");
  for (const s of insertedSkus) {
    storeSkuIdMap.set(s.productId, s.id);
  }

  // Build batch rows
  console.log("Building batch rows...");
  const today = new Date();
  const batchRows = [];

  for (let i = 0; i < batches.length; i++) {
    const row = batches[i];
    const productId = productIdMap.get(row.name.toUpperCase().trim());
    if (!productId) continue;
    const storeSkuId = storeSkuIdMap.get(productId);
    if (!storeSkuId) continue;

    const batchNo = `MV${String(i + 1).padStart(5, "0")}`;
    const mfgDate = new Date(today);
    mfgDate.setMonth(mfgDate.getMonth() - (3 + (i % 18)));

    const expiryDate = new Date(mfgDate);
    const shelfLife = row.category === "medicine" ? 24 + (i % 12) : 12 + (i % 12);
    expiryDate.setMonth(expiryDate.getMonth() + shelfLife);

    // 5% of batches near expiry for realistic testing
    if (i % 20 === 0) {
      expiryDate.setTime(today.getTime() + (30 + (i % 60)) * 24 * 60 * 60 * 1000);
    }

    const mrp = Math.round(row.unit_price * 1.05 * 100) / 100;

    // Determine expiry status
    const daysToExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
    const batchStatus = daysToExpiry < 0 ? "expired" : daysToExpiry < 60 ? "quarantined" : "active";

    batchRows.push([
      1,                                        // storeId (primary store)
      productId,
      batchNo,
      expiryDate.toISOString().slice(0, 19).replace("T", " "),
      row.qty,
      batchStatus,
    ]);
  }

  console.log(`Inserting ${batchRows.length} batches (bulk)...`);
  await bulkInsert(conn, "batches", ["storeId","productId","batchNumber","expiryDate","quantity","status"], batchRows, 500);

  // Summary
  const [[{ cnt: pCnt }]] = await conn.execute("SELECT COUNT(*) as cnt FROM products");
  const [[{ cnt: sCnt }]] = await conn.execute("SELECT COUNT(*) as cnt FROM store_skus");
  const [[{ cnt: bCnt }]] = await conn.execute("SELECT COUNT(*) as cnt FROM batches");
  const [catRows] = await conn.execute("SELECT category, COUNT(*) as cnt FROM products GROUP BY category ORDER BY cnt DESC");
  const [schedRows] = await conn.execute("SELECT schedule, COUNT(*) as cnt FROM products GROUP BY schedule ORDER BY cnt DESC");

  console.log("\n=== INGESTION COMPLETE ===");
  console.log(`Products:   ${pCnt}`);
  console.log(`Store SKUs: ${sCnt}`);
  console.log(`Batches:    ${bCnt}`);
  console.log("\nCategory breakdown:");
  catRows.forEach(r => console.log(`  ${r.category}: ${r.cnt}`));
  console.log("\nSchedule breakdown:");
  schedRows.forEach(r => console.log(`  ${r.schedule}: ${r.cnt}`));

  await conn.end();
  console.log("\nDone.");
}

main().catch(e => { console.error("Ingestion failed:", e.message); process.exit(1); });
