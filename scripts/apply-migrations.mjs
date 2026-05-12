import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createConnection } from "mysql2/promise";

// Accepts DATABASE_URL; falls back to TEST_DATABASE_URL so test jobs that
// set only TEST_DATABASE_URL work without extra wrapper scripts.
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL (or TEST_DATABASE_URL) is required");
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

const SKIP_ERRORS = new Set([
  "ER_TABLE_EXISTS_ERROR",
  "ER_DUP_FIELDNAME",
  "ER_DUP_KEYNAME",
  "ER_CANT_DROP_FIELD_OR_KEY",
]);

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();
}

function splitStatements(sql) {
  // Strip drizzle-kit statement-breakpoint markers (they appear after semicolons).
  const normalized = sql.replace(/--> statement-breakpoint\s*/g, "");
  // Strip single-line SQL comments.
  const cleaned = normalized.replace(/--[^\n]*(?:\n|$)/g, "\n");
  return cleaned
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0);
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

async function applyMigration(conn, filename, content) {
  const hash = hashContent(content);
  const [existing] = await conn.query(
    "SELECT content_hash FROM _app_migrations WHERE filename = ?",
    [filename]
  );
  if (existing.length > 0) {
    if (existing[0].content_hash !== hash) {
      throw new Error(
        `Migration ${filename} was previously applied with hash ` +
          `${existing[0].content_hash.slice(0, 8)} but file now has hash ` +
          `${hash.slice(0, 8)}. Editing applied migrations is unsafe. ` +
          `Create a new migration file for the change instead.`
      );
    }
    console.log(`skip:   ${filename} (already applied)`);
    return false;
  }

  const statements = splitStatements(content);
  console.log(
    `apply:  ${filename} (${statements.length} statement${statements.length === 1 ? "" : "s"})`
  );
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
    } catch (err) {
      // Idempotency: a previous run (drizzle-kit migrate or the
      // SM-E2-ci inline mysql2 loop) already applied this statement.
      if (SKIP_ERRORS.has(err.code)) {
        console.log(`  skip stmt: ${err.code}`);
        continue;
      }
      // Legacy compatibility: some bespoke migrations (e.g.
      // 0061_vault_encryption_columns.sql) reference columns via
      // AFTER <col> where the referenced column does not exist at
      // that migration's runtime position. The SM-E2-ci inline loop
      // stripped AFTER and retried. We preserve that behavior.
      // TODO(SM-L Phase 4): audit drizzle/0050-0067 for invalid
      // AFTER clauses and produce corrected migrations.
      if (err.code === "ER_BAD_FIELD_ERROR" && /\bAFTER\b/i.test(stmt)) {
        const stripped = stmt.replace(/\s+AFTER\s+`?\w+`?/i, "");
        try {
          await conn.query(stripped);
          console.log("  ok (AFTER stripped)");
          continue;
        } catch (err2) {
          if (SKIP_ERRORS.has(err2.code)) {
            console.log(`  skip stmt (after retry): ${err2.code}`);
            continue;
          }
          throw new Error(
            `Migration ${filename} failed at statement:\n${stmt.slice(0, 200)}\n` +
              `Initial error: ${err.message}\n` +
              `Retry error: ${err2.message}`
          );
        }
      }
      throw new Error(
        `Migration ${filename} failed at statement:\n${stmt.slice(0, 200)}\nError: ${err.message}`
      );
    }
  }
  await conn.query(
    "INSERT INTO _app_migrations (filename, content_hash) VALUES (?, ?)",
    [filename, hash]
  );
  return true;
}

async function main() {
  const conn = await createConnection(DATABASE_URL);
  try {
    await ensureTrackingTable(conn);
    const files = getMigrationFiles();
    console.log(
      `Found ${files.length} migration file${files.length === 1 ? "" : "s"} in ${MIGRATIONS_DIR}`
    );
    let applied = 0;
    let skipped = 0;
    for (const filename of files) {
      const content = fs.readFileSync(
        path.join(MIGRATIONS_DIR, filename),
        "utf-8"
      );
      const wasApplied = await applyMigration(conn, filename, content);
      if (wasApplied) applied++;
      else skipped++;
    }
    console.log(
      `\nDone. Applied: ${applied}, Skipped: ${skipped}, Total: ${files.length}`
    );
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
