/**
 * seed-locations.mjs
 *
 * Seeds real Mumbai store locations and representative buildings.
 * Run: node scripts/seed-locations.mjs
 *
 * Opening hours format: JSON array of { day: 0-6, open: "HH:MM", close: "HH:MM" }
 * Day 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 * 24/7 pharmacies: all days 00:00–23:59
 */
import mysql from "mysql2/promise";

const OPENING_HOURS_24_7 = JSON.stringify(
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "00:00", close: "23:59" }))
);

const OPENING_HOURS_STANDARD = JSON.stringify([
  { day: 0, open: "09:00", close: "21:00" }, // Sunday
  { day: 1, open: "08:00", close: "22:00" }, // Monday
  { day: 2, open: "08:00", close: "22:00" },
  { day: 3, open: "08:00", close: "22:00" },
  { day: 4, open: "08:00", close: "22:00" },
  { day: 5, open: "08:00", close: "22:00" },
  { day: 6, open: "09:00", close: "22:00" }, // Saturday
]);

// ─── Real Mumbai store locations ──────────────────────────────────────────────
// These are the actual 24/7 Pharmacy / Medivision locations in Mumbai
const STORES = [
  {
    id: 1,
    name: "24/7 Pharmacy — Hiranandani Gardens",
    type: "cluster_hub",
    address: "Shop 1, Galleria, Hiranandani Gardens, Powai, Mumbai 400076",
    pincode: "400076",
    phone: "+91-22-2570-0247",
    isActive: true,
    slaMins: 18,
    lat: "19.11720000",
    lng: "72.90980000",
    serviceRadius: 3500, // 3.5 km covers all of Hiranandani + Powai
    openingHours: OPENING_HOURS_24_7,
    priority: 1,
    isPrimary: true,
  },
  {
    id: 2,
    name: "24/7 Pharmacy — Powai Plaza",
    type: "cluster_hub",
    address: "Ground Floor, Powai Plaza, Central Avenue, Hiranandani Business Park, Powai, Mumbai 400076",
    pincode: "400076",
    phone: "+91-22-2570-0248",
    isActive: true,
    slaMins: 20,
    lat: "19.11480000",
    lng: "72.90650000",
    serviceRadius: 2500,
    openingHours: OPENING_HOURS_24_7,
    priority: 2,
    isPrimary: false,
  },
  {
    id: 3,
    name: "24/7 Pharmacy — Chandivali",
    type: "cluster_hub",
    address: "Shop 4, Chandivali Farm Road, Chandivali, Andheri East, Mumbai 400072",
    pincode: "400072",
    phone: "+91-22-2847-0247",
    isActive: true,
    slaMins: 22,
    lat: "19.10550000",
    lng: "72.89200000",
    serviceRadius: 3000,
    openingHours: OPENING_HOURS_24_7,
    priority: 3,
    isPrimary: false,
  },
  {
    id: 4,
    name: "24/7 Pharmacy — Kanjurmarg",
    type: "cluster_hub",
    address: "Shop 2, Kanjurmarg West, LBS Marg, Kanjurmarg, Mumbai 400078",
    pincode: "400078",
    phone: "+91-22-2578-0247",
    isActive: true,
    slaMins: 25,
    lat: "19.13200000",
    lng: "72.93800000",
    serviceRadius: 3000,
    openingHours: OPENING_HOURS_STANDARD,
    priority: 4,
    isPrimary: false,
  },
];

// ─── Representative buildings with real coordinates ───────────────────────────
// primaryStoreId is set based on proximity and service radius
const BUILDINGS = [
  // Hiranandani Gardens cluster (served by store 1)
  {
    name: "Hiranandani Gardens — Alica Nagar",
    address: "Alica Nagar, Hiranandani Gardens, Powai, Mumbai 400076",
    addressLine1: "Alica Nagar, Hiranandani Gardens",
    landmark: "Near Galleria Mall",
    pincode: "400076",
    city: "Mumbai",
    lat: "19.11800000",
    lng: "72.90900000",
    primaryStoreId: 1,
    fallbackStoreId: 2,
  },
  {
    name: "Hiranandani Gardens — Rodas Enclave",
    address: "Rodas Enclave, Hiranandani Gardens, Powai, Mumbai 400076",
    addressLine1: "Rodas Enclave, Hiranandani Gardens",
    landmark: "Near D-Mart Powai",
    pincode: "400076",
    city: "Mumbai",
    lat: "19.11650000",
    lng: "72.90850000",
    primaryStoreId: 1,
    fallbackStoreId: 2,
  },
  {
    name: "Hiranandani Gardens — Zen Garden",
    address: "Zen Garden, Hiranandani Gardens, Powai, Mumbai 400076",
    addressLine1: "Zen Garden, Hiranandani Gardens",
    landmark: "Near Hiranandani Hospital",
    pincode: "400076",
    city: "Mumbai",
    lat: "19.11900000",
    lng: "72.91050000",
    primaryStoreId: 1,
    fallbackStoreId: 2,
  },
  {
    name: "Hiranandani Business Park",
    address: "Hiranandani Business Park, Powai, Mumbai 400076",
    addressLine1: "Hiranandani Business Park",
    landmark: "Near Powai Lake",
    pincode: "400076",
    city: "Mumbai",
    lat: "19.11500000",
    lng: "72.90700000",
    primaryStoreId: 2,
    fallbackStoreId: 1,
  },
  // Powai cluster (served by store 2)
  {
    name: "Powai — Lake Homes",
    address: "Lake Homes, Powai, Mumbai 400076",
    addressLine1: "Lake Homes, Powai",
    landmark: "Opposite Powai Lake",
    pincode: "400076",
    city: "Mumbai",
    lat: "19.11350000",
    lng: "72.90500000",
    primaryStoreId: 2,
    fallbackStoreId: 1,
  },
  {
    name: "Powai — Raheja Vihar",
    address: "Raheja Vihar, Chandivali, Powai, Mumbai 400072",
    addressLine1: "Raheja Vihar, Chandivali",
    landmark: "Near Chandivali Studio",
    pincode: "400072",
    city: "Mumbai",
    lat: "19.10800000",
    lng: "72.89500000",
    primaryStoreId: 3,
    fallbackStoreId: 2,
  },
  // Chandivali cluster (served by store 3)
  {
    name: "Chandivali — Solitaire Corporate Park",
    address: "Solitaire Corporate Park, Andheri East, Mumbai 400072",
    addressLine1: "Solitaire Corporate Park",
    landmark: "Near Chandivali Farm Road",
    pincode: "400072",
    city: "Mumbai",
    lat: "19.10400000",
    lng: "72.89100000",
    primaryStoreId: 3,
    fallbackStoreId: 2,
  },
  {
    name: "Chandivali — Acme Ozone",
    address: "Acme Ozone, Chandivali, Andheri East, Mumbai 400072",
    addressLine1: "Acme Ozone, Chandivali",
    landmark: "Near Chandivali Metro",
    pincode: "400072",
    city: "Mumbai",
    lat: "19.10650000",
    lng: "72.89300000",
    primaryStoreId: 3,
    fallbackStoreId: 2,
  },
  // Kanjurmarg cluster (served by store 4)
  {
    name: "Kanjurmarg — Runwal Forests",
    address: "Runwal Forests, Kanjurmarg West, Mumbai 400078",
    addressLine1: "Runwal Forests, Kanjurmarg West",
    landmark: "Near Kanjurmarg Station",
    pincode: "400078",
    city: "Mumbai",
    lat: "19.13100000",
    lng: "72.93700000",
    primaryStoreId: 4,
    fallbackStoreId: 1,
  },
  {
    name: "Kanjurmarg — Bhandup Industrial Area",
    address: "Bhandup Industrial Area, LBS Marg, Mumbai 400078",
    addressLine1: "LBS Marg, Bhandup Industrial Area",
    landmark: "Near Kanjurmarg West Station",
    pincode: "400078",
    city: "Mumbai",
    lat: "19.13400000",
    lng: "72.93900000",
    primaryStoreId: 4,
    fallbackStoreId: null,
  },
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  console.log("Seeding stores...");
  for (const store of STORES) {
    await conn.execute(
      `INSERT INTO stores (id, name, type, address, pincode, phone, isActive, slaMins, lat, lng, serviceRadius, openingHours, priority, isPrimary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name), type=VALUES(type), address=VALUES(address), pincode=VALUES(pincode),
         phone=VALUES(phone), isActive=VALUES(isActive), slaMins=VALUES(slaMins),
         lat=VALUES(lat), lng=VALUES(lng), serviceRadius=VALUES(serviceRadius),
         openingHours=VALUES(openingHours), priority=VALUES(priority), isPrimary=VALUES(isPrimary)`,
      [
        store.id, store.name, store.type, store.address, store.pincode,
        store.phone, store.isActive, store.slaMins, store.lat, store.lng,
        store.serviceRadius, store.openingHours, store.priority, store.isPrimary,
      ]
    );
    console.log(`  ✓ Store: ${store.name}`);
  }

  console.log("\nSeeding buildings...");
  // Clear existing buildings to avoid duplicates with new data
  await conn.execute("DELETE FROM buildings");
  for (const b of BUILDINGS) {
    await conn.execute(
      `INSERT INTO buildings (name, address, addressLine1, landmark, pincode, city, lat, lng, primaryStoreId, fallbackStoreId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.name, b.address, b.addressLine1, b.landmark,
        b.pincode, b.city, b.lat, b.lng,
        b.primaryStoreId, b.fallbackStoreId ?? null,
      ]
    );
    console.log(`  ✓ Building: ${b.name}`);
  }

  await conn.end();
  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
