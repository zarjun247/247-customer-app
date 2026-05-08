#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const hasArg = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const idx = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : (args[idx + 1] || fallback);
};
const dryRun = hasArg("dry-run") || !hasArg("execute");
const metadata = hasArg("metadata");
const urlText = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL || "";
const outputDir = process.env.BACKUP_OUTPUT_DIR || value("output-dir", "");
const production = ["production", "prod"].includes(String(process.env.APP_ENV || process.env.NODE_ENV || "").toLowerCase()) || /prod|primary|live/i.test(urlText);
const failures = [];
if (!urlText) failures.push("BACKUP_DATABASE_URL or DATABASE_URL is required.");
if (production && !outputDir) failures.push("Production-looking backup refuses to run unless BACKUP_OUTPUT_DIR or --output-dir is set.");
let parsed;
if (urlText) {
  try { parsed = new URL(urlText); } catch { failures.push("Database URL is not parseable."); }
}
if (parsed && !/^mysql:?$/.test(parsed.protocol.replace(":", ""))) failures.push("Only mysql:// backup command generation is supported.");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dbName = parsed?.pathname?.replace(/^\//, "") || "database";
const file = value("file", outputDir ? path.join(outputDir, `${dbName}-${stamp}.sql`) : `${dbName}-${stamp}.sql`);
const safeCommand = parsed ? `MYSQL_PWD=<redacted> mysqldump --single-transaction --routines --triggers --host=${parsed.hostname} --port=${parsed.port || 3306} --user=${decodeURIComponent(parsed.username || "<user>")} ${dbName} > ${file}` : "mysqldump command unavailable";
if (failures.length) {
  console.error("Backup proof failed safety checks:");
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
if (metadata) console.log(JSON.stringify({ dryRun, databaseHost: parsed.hostname, databaseName: dbName, outputFile: file, tool: "mysqldump", passwordPrinted: false }, null, 2));
else {
  console.log(`Database backup ${dryRun ? "dry-run" : "execute"} plan`);
  console.log(`Output file: ${file}`);
  console.log(`Command: ${safeCommand}`);
  console.log("Required local tool: mysqldump. Password is passed through MYSQL_PWD and never printed.");
}
if (dryRun) process.exit(0);
if (!outputDir || !fs.existsSync(outputDir)) {
  console.error("FAIL Output directory must exist for execute mode.");
  process.exit(1);
}
const out = fs.openSync(file, "w");
const result = spawnSync("mysqldump", ["--single-transaction", "--routines", "--triggers", `--host=${parsed.hostname}`, `--port=${parsed.port || 3306}`, `--user=${decodeURIComponent(parsed.username)}`, dbName], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(parsed.password || "") }, stdio: ["ignore", out, "inherit"] });
fs.closeSync(out);
process.exitCode = result.status ?? 1;
