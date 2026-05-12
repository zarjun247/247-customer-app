/**
 * One-time bridge script for databases that were set up by drizzle-kit migrate
 * or the SM-E2-ci inline mysql2 loop. Pre-populates _app_migrations for every
 * SQL file whose primary table already exists in the database, so apply-migrations.mjs
 * can take over without re-running those migrations.
 *
 * For fresh databases this script is a no-op — apply-migrations.mjs handles
 * everything from scratch.
 *
 * Run once per environment during migration to the new runner:
 *   pnpm run db:bootstrap
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createConnection } from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL (or TEST_DATABASE_URL) is required");
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();
}

/**
 * Extract the primary table name from an SQL file so we can check
 * INFORMATION_SCHEMA to determine if the migration was already applied.
 */
function extractPrimaryTable(sql) {
  const cleaned = sql
    .replace(/--> statement-breakpoint\s*/g, "")
    .replace(/--[^\n]*/g, "");

  const patterns = [
    /CREATE TABLE (?:IF NOT EXISTS )?\s*[`"']?(\w+)[`"']?/i,
    /ALTER TABLE\s+[`"']?(\w+)[`"']?/i,
    /INSERT INTO\s+[`"']?(\w+)[`"']?/i,
    /CREATE (?:UNIQUE )?INDEX\s+\w+\s+ON\s+[`"']?(\w+)[`"']?/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function ensureTrackingTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS _app_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      content_hash VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_by VARCHAR(64) NOT NULL DEFAULT 'apply-migrations.mjs'
    ) ENGINE=InnoDB
  `);
}

async function tableExists(conn, dbName, tableName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, tableName]
  );
  return Number(rows[0].cnt) > 0;
}

async function isAlreadyTracked(conn, filename) {
  const [rows] = await conn.query(
    "SELECT 1 FROM _app_migrations WHERE filename = ?",
    [filename]
  );
  return rows.length > 0;
}

async function main() {
  const conn = await createConnection(DATABASE_URL);
  try {
    const url = new URL(DATABASE_URL);
    const dbName = url.pathname.replace(/^\//, "");

    await ensureTrackingTable(conn);

    const files = getMigrationFiles();
    console.log(
      `Bootstrap: checking ${files.length} migration file${files.length === 1 ? "" : "s"} in ${MIGRATIONS_DIR}`
    );

    let bootstrapped = 0;
    let alreadyTracked = 0;
    let noTableFound = 0;
    let tableNotPresent = 0;

    for (const filename of files) {
      if (await isAlreadyTracked(conn, filename)) {
        alreadyTracked++;
        continue;
      }

      const content = fs.readFileSync(
        path.join(MIGRATIONS_DIR, filename),
        "utf-8"
      );
      const primaryTable = extractPrimaryTable(content);

      if (!primaryTable) {
        console.log(
          `no-table: ${filename} (cannot detect primary table — will be applied fresh)`
        );
        noTableFound++;
        continue;
      }

      const exists = await tableExists(conn, dbName, primaryTable);
      if (exists) {
        const hash = hashContent(content);
        await conn.query(
          `INSERT IGNORE INTO _app_migrations (filename, content_hash, applied_by)
           VALUES (?, ?, 'bootstrap-migrations-table.mjs')`,
          [filename, hash]
        );
        console.log(
          `bootstrap: ${filename} → table ${primaryTable} exists, marked applied`
        );
        bootstrapped++;
      } else {
        console.log(
          `pending:   ${filename} → table ${primaryTable} not found, will apply`
        );
        tableNotPresent++;
      }
    }

    console.log(
      `\nBootstrap complete. Bootstrapped: ${bootstrapped}, Already tracked: ${alreadyTracked}, ` +
        `Pending (apply next): ${tableNotPresent + noTableFound}`
    );
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
