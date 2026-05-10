#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const hasArg = (name) => args.includes(`--${name}`);
const value = (name, fallback = "") => {
  const idx = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : args[idx + 1] || fallback;
};

const backupFile = value("backup-file", process.env.RESTORE_BACKUP_FILE || "");
const checksumFile = value("checksum-file", process.env.RESTORE_CHECKSUM_FILE || "");
const urlText = process.env.RESTORE_DATABASE_URL || process.env.TEST_DATABASE_URL || "";
const failures = [];

if (hasArg("execute") || hasArg("apply")) failures.push("restore verification is read-only and refuses execute/apply flags.");
if (!backupFile) failures.push("--backup-file or RESTORE_BACKUP_FILE is required.");
else if (!fs.existsSync(backupFile)) failures.push(`Backup file does not exist: ${backupFile}`);
if (!urlText) failures.push("RESTORE_DATABASE_URL or TEST_DATABASE_URL is required for target classification.");

let parsed;
if (urlText) {
  try {
    parsed = new URL(urlText);
  } catch {
    failures.push("Restore verification database URL is not parseable.");
  }
}

const targetText = `${urlText} ${process.env.APP_ENV || ""} ${process.env.NODE_ENV || ""}`;
if (/prod|production|primary|live/i.test(targetText)) failures.push("Restore verification refuses production-looking targets; use an isolated non-production restore database.");
if (parsed && parsed.protocol.replace(":", "") !== "mysql") failures.push("Only mysql:// restore verification targets are supported.");

let sha256 = "";
if (backupFile && fs.existsSync(backupFile)) {
  sha256 = crypto.createHash("sha256").update(fs.readFileSync(backupFile)).digest("hex");
  if (checksumFile) {
    if (!fs.existsSync(checksumFile)) failures.push(`Checksum file does not exist: ${checksumFile}`);
    else {
      const expected = fs.readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
      if (expected && expected !== sha256) failures.push("Backup checksum mismatch.");
    }
  }
}

if (failures.length) {
  console.error("Restore verification failed safety checks:");
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

const dbName = parsed?.pathname.replace(/^\//, "") || "<database>";
const user = decodeURIComponent(parsed?.username || "<user>");
console.log("Restore verification dry-run plan");
console.log(`Target database: ${dbName}`);
console.log(`Backup file: ${backupFile}`);
console.log(`SHA256: ${sha256}`);
console.log("Read-only verification commands:");
console.log(`MYSQL_PWD=<redacted> mysql --host=${parsed.hostname} --port=${parsed.port || 3306} --user=${user} --execute=\"select count(*) as migration_rows from __drizzle_migrations;\" ${dbName}`);
console.log(`MYSQL_PWD=<redacted> mysql --host=${parsed.hostname} --port=${parsed.port || 3306} --user=${user} --execute=\"select count(*) as store_rows from stores; select count(*) as negative_stock_rows from store_skus where stock_qty < 0;\" ${dbName}`);
console.log("Acceptance requires operator-captured query output, app smoke check, stock/commercial reconciliation, and owner signoff.");
