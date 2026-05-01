import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const sql = readFileSync(new URL("../drizzle/part12_system_events.sql", import.meta.url), "utf8");

const conn = await createConnection(process.env.DATABASE_URL);
const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log("OK:", stmt.slice(0, 60));
  } catch (e) {
    if (e.code === "ER_TABLE_EXISTS_ERROR" || e.code === "ER_DUP_KEYNAME") {
      console.log("SKIP (already exists):", stmt.slice(0, 60));
    } else {
      console.error("FAIL:", e.message, "\n", stmt.slice(0, 80));
    }
  }
}
await conn.end();
console.log("PART 12 migration done.");
