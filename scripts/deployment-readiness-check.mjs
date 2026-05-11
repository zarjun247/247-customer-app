#!/usr/bin/env node
/**
 * deployment-readiness-check.mjs
 *
 * Aggregates pre-deploy checks and reports pass/fail/warn per item.
 * Exit codes: 0=pass, 1=fail, 2=warn.
 *
 * Usage:
 *   node scripts/deployment-readiness-check.mjs --env <staging|production> [--skip-tests] [--json] [--record]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
deployment-readiness-check.mjs — pre-deploy validation aggregator

Usage:
  node scripts/deployment-readiness-check.mjs [options]

Options:
  --env <staging|production>   Target environment (default: staging)
  --skip-tests                 Skip pnpm test (for dry runs)
  --json                       Output JSON to stdout only
  --record                     Append result to server/data/deployment-validations.json
  --help                       Show this help
`);
  process.exit(0);
}

const ENV_CLASS = argVal("env", "staging");
const SKIP_TESTS = hasArg("skip-tests");
const JSON_MODE = hasArg("json");
const RECORD = hasArg("record");
const TIMEOUT_MS = 60_000;

const VALIDATIONS_PATH = path.join(REPO_ROOT, "server/data/deployment-validations.json");
const RESTORE_DRILLS_PATH = path.join(REPO_ROOT, "server/data/restore-drills.json");
const INCIDENTS_PATH = path.join(REPO_ROOT, "server/data/incidents.json");

const BACKUP_DRILL_MIN_INTERVAL_HOURS = Number(process.env.BACKUP_DRILL_MIN_INTERVAL_HOURS ?? "168");

/** Run a command and return a check result. */
function runCheck(name, cmd, cmdArgs, { cwd = REPO_ROOT, skipReason, useShell } = {}) {
  if (skipReason) {
    return { name, status: "skipped", message: skipReason };
  }
  // On Windows, package-manager commands (pnpm, npm) need shell:true to resolve .cmd wrappers.
  const needsShell = useShell !== false && (cmd === "pnpm" || cmd === "npm");
  const start = Date.now();
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    timeout: TIMEOUT_MS,
    encoding: "utf-8",
    shell: needsShell,
  });
  const durationMs = Date.now() - start;

  if (result.error) {
    return { name, status: "fail", message: result.error.message, durationMs };
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").slice(0, 500);
    return { name, status: "fail", message: stderr || `exit ${result.status}`, durationMs };
  }
  return { name, status: "pass", durationMs };
}

/** Check backup freshness via dry-run mode if supported. */
function checkBackupFreshness() {
  const name = "backup-freshness";
  const scriptPath = path.join(REPO_ROOT, "scripts/backup-db.mjs");
  if (!fs.existsSync(scriptPath)) {
    return { name, status: "skipped", message: "scripts/backup-db.mjs not found" };
  }
  // Backup age is advisory: we warn but don't block.
  return { name, status: "warn", message: `Cannot verify backup age without running a backup. Ensure a backup was taken within ${BACKUP_DRILL_MIN_INTERVAL_HOURS}h.` };
}

/** Check restore drill recency from audit log. */
function checkRestoreDrillRecency() {
  const name = "restore-drill-recency";
  if (!fs.existsSync(RESTORE_DRILLS_PATH)) {
    return { name, status: "warn", message: "No restore-drills.json found. Run a restore drill before deploying." };
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(RESTORE_DRILLS_PATH, "utf-8"));
  } catch {
    return { name, status: "warn", message: "Could not parse restore-drills.json." };
  }
  const records = data.records ?? [];
  if (records.length === 0) {
    return { name, status: "warn", message: "No restore drills recorded. Run a restore drill before deploying." };
  }
  const last = records[records.length - 1];
  if (last.outcome !== "success") {
    return { name, status: "warn", message: `Last restore drill outcome was '${last.outcome}'. A successful drill is required.` };
  }
  const ageHours = (Date.now() - new Date(last.ts).getTime()) / 3_600_000;
  if (ageHours > BACKUP_DRILL_MIN_INTERVAL_HOURS) {
    return { name, status: "warn", message: `Last restore drill was ${ageHours.toFixed(1)}h ago, exceeding ${BACKUP_DRILL_MIN_INTERVAL_HOURS}h interval.` };
  }
  return { name, status: "pass", message: `Last drill: ${ageHours.toFixed(1)}h ago, outcome: success` };
}

/** Check for open P0 incidents. */
function checkOpenIncidents() {
  const name = "no-open-p0-incidents";
  if (!fs.existsSync(INCIDENTS_PATH)) {
    return { name, status: "pass", message: "No incidents.json found (no incidents recorded)." };
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(INCIDENTS_PATH, "utf-8"));
  } catch {
    return { name, status: "warn", message: "Could not parse incidents.json." };
  }
  const records = data.records ?? data.incidents ?? [];
  const openP0 = records.filter((r) => r.severity === "P0" && !["closed", "resolved"].includes(r.status ?? ""));
  if (openP0.length > 0) {
    return { name, status: "fail", message: `${openP0.length} open P0 incident(s). Resolve before deploying.` };
  }
  return { name, status: "pass", message: "No open P0 incidents." };
}

async function main() {
  const checks = [];

  checks.push(runCheck("typecheck", "pnpm", ["run", "check"]));

  if (SKIP_TESTS) {
    checks.push({ name: "tests", status: "skipped", message: "--skip-tests flag set" });
  } else {
    checks.push(runCheck("tests", "pnpm", ["test"]));
  }

  checks.push(runCheck("build", "pnpm", ["run", "build"]));
  checks.push(runCheck("verify-migrations", "node", ["scripts/verify-migrations.mjs"]));
  checks.push(runCheck("ci-governance-guards", "node", ["scripts/ci-governance-guards.mjs", "all"]));
  checks.push(runCheck("verify-docs-structure", "node", ["scripts/verify-docs-structure.mjs"]));

  const validateScript = path.join(REPO_ROOT, "scripts/validate-deployment-env.mjs");
  if (fs.existsSync(validateScript)) {
    // validate-deployment-env checks for external env vars (DATABASE_URL, etc.) that are
    // not present in local dev. A non-zero exit here is a warn, not a fail — it informs
    // the operator that deployment env config is incomplete, but the check itself ran.
    const envCheck = runCheck("validate-deployment-env", "node", ["scripts/validate-deployment-env.mjs", "--env", ENV_CLASS]);
    if (envCheck.status === "fail") {
      checks.push({ ...envCheck, status: "warn", message: `Deployment env not fully configured: ${envCheck.message ?? ""}` });
    } else {
      checks.push(envCheck);
    }
  } else {
    checks.push({ name: "validate-deployment-env", status: "skipped", message: "scripts/validate-deployment-env.mjs not found" });
  }

  checks.push(checkBackupFreshness());
  checks.push(checkRestoreDrillRecency());
  checks.push(checkOpenIncidents());

  const hasFail = checks.some(c => c.status === "fail");
  const hasWarn = checks.some(c => c.status === "warn");
  const overall = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  const exitCode = hasFail ? 1 : hasWarn ? 2 : 0;

  const report = {
    ts: new Date().toISOString(),
    env: ENV_CLASS,
    overall,
    checks,
  };

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stderr.write(`\nDeployment Readiness Check — ${ENV_CLASS}\n`);
    process.stderr.write(`${"=".repeat(50)}\n`);
    for (const c of checks) {
      const icon = c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : c.status === "warn" ? "⚠" : "–";
      const dur = c.durationMs != null ? ` (${c.durationMs}ms)` : "";
      process.stderr.write(`${icon} ${c.name}${dur}${c.message ? ": " + c.message : ""}\n`);
    }
    process.stderr.write(`${"=".repeat(50)}\n`);
    process.stderr.write(`Overall: ${overall.toUpperCase()}\n\n`);
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  }

  if (RECORD) {
    try {
      let data = { records: [] };
      if (fs.existsSync(VALIDATIONS_PATH)) {
        try { data = JSON.parse(fs.readFileSync(VALIDATIONS_PATH, "utf-8")); } catch {}
      }
      const actor = (() => {
        try { return os.userInfo().username; } catch { return "unknown"; }
      })();
      const commitSha = (() => {
        try {
          const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf-8", timeout: 5000 });
          return (r.stdout ?? "").trim().slice(0, 40) || "unknown";
        } catch { return "unknown"; }
      })();
      const record = {
        id: `val-${Date.now()}`,
        ts: report.ts,
        env: ENV_CLASS,
        actor,
        commitSha,
        checks,
        overall,
      };
      data.records.push(record);
      const tmp = VALIDATIONS_PATH + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
      fs.renameSync(tmp, VALIDATIONS_PATH);
      process.stderr.write(`Recorded validation to server/data/deployment-validations.json\n`);
    } catch (err) {
      process.stderr.write(`Warning: could not record validation: ${err.message}\n`);
    }
  }

  process.exit(exitCode);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
