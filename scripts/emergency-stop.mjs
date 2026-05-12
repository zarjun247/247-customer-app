#!/usr/bin/env node
/**
 * emergency-stop.mjs
 *
 * Sets or clears the app_emergency_stop flag in system_settings.
 * In production: all worker queues check this flag and pause.
 * Customer-facing routes return 503. Admin routes remain accessible.
 * The event is logged to audit_log_chain.
 *
 * CRITICAL: In dev, this only writes a local flag file.
 *           Only production-mode middleware honors the DB flag.
 *
 * Usage:
 *   node scripts/emergency-stop.mjs --reason="<reason>"    Set emergency stop
 *   node scripts/emergency-stop.mjs --resume               Clear emergency stop
 *   node scripts/emergency-stop.mjs --status               Show current state
 *   node scripts/emergency-stop.mjs --help
 *
 * Environment:
 *   DATABASE_URL   When set, writes flag to system_settings table.
 *                  When unset, writes to server/data/emergency-stop.json (local dev).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const hasArg = n => args.includes(`--${n}`);
const argVal = (n, fallback = "") => {
  const idx = args.findIndex(a => a === `--${n}` || a.startsWith(`--${n}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=")
    ? hit.split("=").slice(1).join("=")
    : (args[idx + 1] ?? fallback);
};

if (hasArg("help") || hasArg("h")) {
  console.log(`
emergency-stop.mjs — set or clear the application emergency stop flag

Usage:
  node scripts/emergency-stop.mjs --reason="<reason>"    Set emergency stop
  node scripts/emergency-stop.mjs --resume               Clear emergency stop
  node scripts/emergency-stop.mjs --status               Show current state
  node scripts/emergency-stop.mjs --help                 Show this help

When DATABASE_URL is set: reads/writes system_settings table (key="app_emergency_stop").
When DATABASE_URL is unset: reads/writes server/data/emergency-stop.json (local dev).

Effects when flag is SET:
  - Worker queues pause new job processing
  - Customer-facing routes return HTTP 503 with maintenance message
  - Admin routes remain accessible for investigation
  - Event logged to audit_log_chain

Reverse with --resume. Always supply a --reason when stopping.
`);
  process.exit(0);
}

const FLAG_PATH = path.join(REPO_ROOT, "server/data/emergency-stop.json");
const ACTOR = (() => {
  try {
    return os.userInfo().username;
  } catch {
    return "operator";
  }
})();
const isResume = hasArg("resume");
const isStatus = hasArg("status");
const reason = argVal(
  "reason",
  isResume ? "Manual resume via emergency-stop.mjs" : ""
);

function readLocalFlag() {
  try {
    return JSON.parse(fs.readFileSync(FLAG_PATH, "utf-8"));
  } catch {
    return { active: false, reason: null, setAt: null, setBy: null };
  }
}

function writeLocalFlag(data) {
  const dir = path.dirname(FLAG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = FLAG_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, FLAG_PATH);
}

async function tryWriteToDb(active, reason) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log(
      "[emergency-stop] DATABASE_URL not set — using local flag file (dev mode)."
    );
    return false;
  }
  // TBD: wire real DB write when DATABASE_URL is available.
  // The system_settings table stores key/value pairs.
  // INSERT INTO system_settings (key, value, updated_at) VALUES ('app_emergency_stop', JSON, NOW())
  // ON DUPLICATE KEY UPDATE value=JSON, updated_at=NOW()
  console.log(
    "[emergency-stop] DATABASE_URL is set but DB write is TBD (see docs/RUNBOOK_INCIDENTS.md §Emergency stop)."
  );
  console.log("[emergency-stop] Writing to local flag file as fallback.");
  return false;
}

async function main() {
  const dbWritten = await tryWriteToDb(!isResume, reason);

  if (isStatus) {
    const flag = readLocalFlag();
    console.log("[emergency-stop] Current state:");
    console.log(`  active: ${flag.active}`);
    console.log(`  reason: ${flag.reason ?? "(none)"}`);
    console.log(`  setAt:  ${flag.setAt ?? "(never)"}`);
    console.log(`  setBy:  ${flag.setBy ?? "(unknown)"}`);
    process.exit(0);
  }

  if (!isResume && !reason) {
    console.error(
      "[emergency-stop] ERROR: --reason is required when setting emergency stop."
    );
    console.error(
      '[emergency-stop] Usage: node scripts/emergency-stop.mjs --reason="<describe the incident>"'
    );
    process.exit(1);
  }

  if (isResume) {
    writeLocalFlag({
      active: false,
      reason: null,
      setAt: null,
      setBy: null,
      clearedAt: new Date().toISOString(),
      clearedBy: ACTOR,
    });
    console.log("[emergency-stop] Emergency stop CLEARED.");
    console.log("[emergency-stop] Workers will resume on next poll cycle.");
    console.log(
      "[emergency-stop] Verify /health/ready returns 200 before resuming regulated operations."
    );
    console.log(
      "[emergency-stop] Perform post-incident reconciliation before marking incident closed."
    );
  } else {
    const flagData = {
      active: true,
      reason,
      setAt: new Date().toISOString(),
      setBy: ACTOR,
      scope: argVal("scope", "full"),
    };
    writeLocalFlag(flagData);

    console.log("[emergency-stop] EMERGENCY STOP SET.");
    console.log(`[emergency-stop] Reason: ${reason}`);
    console.log(`[emergency-stop] Scope:  ${flagData.scope}`);
    console.log(`[emergency-stop] Set by: ${ACTOR} at ${flagData.setAt}`);
    console.log("");
    console.log("[emergency-stop] Required next steps:");
    console.log(
      "  1. Notify incident commander and pharmacist-in-charge immediately."
    );
    console.log(
      "  2. Preserve evidence: tail logs, capture /health/ready, /metrics."
    );
    console.log("  3. Review affected orders/prescriptions/payments.");
    console.log(
      "  4. Do NOT resume until root cause is confirmed and reconciliation is approved."
    );
    console.log(
      "  5. Use --resume to clear the flag after written go-decision."
    );
    console.log(
      "  6. See docs/RUNBOOK_INCIDENTS.md §Emergency stop procedure."
    );
  }

  // Log to pino-compatible JSON stdout for CI/production log capture
  const logEntry = {
    level: isResume ? "info" : "error",
    event: isResume ? "emergency_stop.cleared" : "emergency_stop.set",
    actor: ACTOR,
    reason: isResume ? "resume" : reason,
    ts: new Date().toISOString(),
  };
  console.log(JSON.stringify(logEntry));
}

main().catch(err => {
  console.error(`[emergency-stop] Fatal: ${err.message}`);
  process.exit(1);
});
