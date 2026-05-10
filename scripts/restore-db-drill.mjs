#!/usr/bin/env node
import fs from "node:fs";
const args = process.argv.slice(2);
const hasArg = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const idx = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : (args[idx + 1] || fallback);
};
const executeRequested = hasArg("execute");
const dryRun = true;
const backupFile = value("backup-file", process.env.RESTORE_BACKUP_FILE || "");
const urlText = process.env.RESTORE_DATABASE_URL || process.env.TEST_DATABASE_URL || "";
const failures = [];
if (executeRequested) failures.push("Destructive restore execution is not implemented; this script is dry-run documentation only.");
if (!urlText) failures.push("RESTORE_DATABASE_URL or TEST_DATABASE_URL is required.");
if (!backupFile) failures.push("--backup-file or RESTORE_BACKUP_FILE is required.");
else if (!fs.existsSync(backupFile)) failures.push(`Backup file does not exist: ${backupFile}`);
const productionLooking = /prod|production|primary|live/i.test(urlText) || ["production", "prod"].includes(String(process.env.APP_ENV || process.env.NODE_ENV || "").toLowerCase());
if (productionLooking && !hasArg("allow-nonprod-name-override")) failures.push("Restore target looks production-like; restore drill refuses to proceed.");
let parsed;
if (urlText) {
  try { parsed = new URL(urlText); } catch { failures.push("Restore database URL is not parseable."); }
}
if (parsed && !/^mysql:?$/.test(parsed.protocol.replace(":", ""))) failures.push("Only mysql:// restore drills are supported.");
if (failures.length) {
  console.error("Restore drill failed safety checks:");
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
const dbName = parsed.pathname.replace(/^\//, "");
const command = `MYSQL_PWD=<redacted> mysql --host=${parsed.hostname} --port=${parsed.port || 3306} --user=${decodeURIComponent(parsed.username || "<user>")} ${dbName} < ${backupFile}`;
console.log(`Database restore drill ${dryRun ? "dry-run" : "execute"} plan`);
console.log(`Target database: ${dbName}`);
console.log(`Backup file: ${backupFile}`);
console.log(`Command: ${command}`);
console.log("Safety: production-looking targets are refused unless an explicit non-production override is supplied.");
process.exit(0);
