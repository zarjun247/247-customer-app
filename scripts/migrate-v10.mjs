import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

const stmts = [
  "ALTER TABLE `products` ADD `imageHeroUrl` text",
  "ALTER TABLE `products` ADD `imageSideUrl` text",
  "ALTER TABLE `products` ADD `imageRearUrl` text",
  "ALTER TABLE `products` ADD `imageLabelUrl` text",
  "ALTER TABLE `products` ADD `imageNutritionUrl` text",
  "ALTER TABLE `products` ADD `gstRate` decimal(5,2) DEFAULT '12.00'",
  "ALTER TABLE `products` ADD `searchableTokens` text",
  "ALTER TABLE `products` ADD `canonicalName` varchar(300)",
  "ALTER TABLE `products` ADD `masterProductId` int",
  "ALTER TABLE `refill_reminders` ADD `snoozedUntil` timestamp",
  "ALTER TABLE `store_skus` ADD `isFeatured` boolean DEFAULT false NOT NULL",
  "ALTER TABLE `store_skus` ADD `sponsorPriority` int DEFAULT 0 NOT NULL",
  "ALTER TABLE `store_skus` ADD `sponsorCategory` varchar(50)",
  "ALTER TABLE `store_skus` ADD `sponsorLabel` varchar(100)",
  "ALTER TABLE `store_skus` ADD `sponsorValidUntil` timestamp",
];

const conn = await createConnection(url);
let ok = 0, skip = 0;
for (const stmt of stmts) {
  try {
    await conn.execute(stmt);
    console.log("OK:", stmt.slice(0, 70));
    ok++;
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("SKIP (already exists):", stmt.slice(0, 70));
      skip++;
    } else {
      console.error("FAIL:", stmt, e.message);
    }
  }
}
await conn.end();
console.log(`\nDone: ${ok} applied, ${skip} skipped.`);
