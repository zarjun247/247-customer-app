import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const sql = readFileSync(join(__dirname, "../drizzle/part11_routing_rider.sql"), "utf8");

const conn = await createConnection(process.env.DATABASE_URL);

// Split on semicolons, filter empty
const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 10);

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    const match = stmt.match(/CREATE TABLE IF NOT EXISTS `(\w+)`/);
    if (match) console.log(`✓ ${match[1]}`);
  } catch (e) {
    console.error("Error:", e.message.slice(0, 120));
  }
}

await conn.end();
console.log("PART 11 migration complete.");
