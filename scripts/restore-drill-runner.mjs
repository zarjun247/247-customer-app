#!/usr/bin/env node
/**
 * restore-drill-runner.mjs
 *
 * Wraps scripts/restore-db-drill.mjs with audit logging.
 * After invoking the underlying script, records the outcome to
 * server/data/restore-drills.json with actor, timing, and result.
 *
 * Usage:
 *   node scripts/restore-drill-runner.mjs [--backup-file <path>] [--help]
 *
 * Required env vars (passed through to restore-db-drill.mjs):
 *   RESTORE_DATABASE_URL   Target staging/test DB URL
 *   RESTORE_BACKUP_FILE    Path to backup file (or use --backup-file)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const hasArg = (n) => args.includes(`--${n}`);
const argVal = (n, fallback = "") => {
  const idx = args.findIndex(a => a === `--${n}` || a.startsWith(`--${n}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : args[idx + 1] ?? fallback;
};

if (hasArg("help") || hasArg("h")) {
  console.log(`
restore-drill-runner.mjs — restore drill wrapper with audit logging

Usage:
  node scripts/restore-drill-runner.mjs [options]

Options:
  --backup-file <path>   Path to the backup file (overrides RESTORE_BACKUP_FILE env var)
  --help                 Show this help

Environment variables:
  RESTORE_DATABASE_URL   Target staging/test database URL (required)
  RESTORE_BACKUP_FILE    Backup file path (can be set via --backup-file)

This script wraps scripts/restore-db-drill.mjs and records the outcome to
server/data/restore-drills.json for audit and SLA tracking.
`);
  process.exit(0);
}

const RESTORE_DRILLS_PATH = path.join(REPO_ROOT, "server/data/restore-drills.json");
const UNDERLYING_SCRIPT = path.join(REPO_ROOT, "scripts/restore-db-drill.mjs");

const ACTOR = (() => { try { return os.userInfo().username; } catch { return "operator"; } })();

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return { records: [] };
  }
}

function writeJson(filePath, data) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function recordDrillOutcome({ drillId, backupFileRef, outcome, durationMs, notes }) {
  const data = readJson(RESTORE_DRILLS_PATH);
  if (!Array.isArray(data.records)) data.records = [];
  data.records.push({
    id: drillId,
    ts: new Date().toISOString(),
    actor: ACTOR,
    backupFileRef,
    outcome,
    durationMs,
    notes,
  });
  writeJson(RESTORE_DRILLS_PATH, data);
}

async function main() {
  const backupFileArg = argVal("backup-file", process.env.RESTORE_BACKUP_FILE ?? "");
  const drillId = `restore-${Date.now()}-${randomUUID().slice(0, 8)}`;

  if (!fs.existsSync(UNDERLYING_SCRIPT)) {
    console.warn(`[restore-drill-runner] WARNING: scripts/restore-db-drill.mjs not found.`);
    console.warn(`[restore-drill-runner] Recording a stub outcome. The real restore script is required for a full drill.`);
    recordDrillOutcome({
      drillId,
      backupFileRef: backupFileArg || "unknown",
      outcome: "partial",
      durationMs: 0,
      notes: "restore-drill-stub: scripts/restore-db-drill.mjs not found. Record is advisory only.",
    });
    process.exit(0);
  }

  const passArgs = [];
  if (backupFileArg) passArgs.push("--backup-file", backupFileArg);
  // Pass through all other non-standard args except --backup-file
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--backup-file") { i++; continue; }
    if (!["--help", "--h"].includes(args[i])) passArgs.push(args[i]);
  }

  console.log(`[restore-drill-runner] Starting restore drill (id=${drillId})`);
  console.log(`[restore-drill-runner] Invoking: node scripts/restore-db-drill.mjs ${passArgs.join(" ")}`);

  const start = Date.now();
  const result = spawnSync("node", [UNDERLYING_SCRIPT, ...passArgs], {
    cwd: REPO_ROOT,
    timeout: 300_000,
    encoding: "utf-8",
    stdio: "inherit",
  });
  const durationMs = Date.now() - start;

  const exitCode = result.status ?? 1;
  const outcome = exitCode === 0 ? "success" : "fail";
  const notes = result.error
    ? `Error: ${result.error.message}`
    : `Exit code ${exitCode}. Duration: ${durationMs}ms.`;

  recordDrillOutcome({
    drillId,
    backupFileRef: backupFileArg || process.env.RESTORE_BACKUP_FILE || "unknown",
    outcome,
    durationMs,
    notes,
  });

  console.log(`[restore-drill-runner] Outcome: ${outcome} (${durationMs}ms)`);
  console.log(`[restore-drill-runner] Recorded to server/data/restore-drills.json`);

  process.exit(exitCode);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
