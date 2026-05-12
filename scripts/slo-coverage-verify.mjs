#!/usr/bin/env node
/**
 * slo-coverage-verify.mjs
 *
 * Asserts every critical procedure path has at least one SLO event recorded
 * in the last N days. Reads critical paths from docs/SLO_COVERAGE.md.
 *
 * Usage:
 *   node scripts/slo-coverage-verify.mjs [--days <n>] [--help]
 *
 * Environment:
 *   DATABASE_URL   Required for real queries. Without it: MOCK MODE (asserts doc exists).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const hasArg = n => args.includes(`--${n}`);
const argVal = (n, fallback) => {
  const idx = args.findIndex(a => a === `--${n}` || a.startsWith(`--${n}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=")
    ? hit.split("=").slice(1).join("=")
    : (args[idx + 1] ?? fallback);
};

if (hasArg("help") || hasArg("h")) {
  console.log(`
slo-coverage-verify.mjs — verify SLO event coverage for all critical paths

Usage:
  node scripts/slo-coverage-verify.mjs [--days <n>]

Options:
  --days <n>   Look-back window in days (default: 7)
  --help       Show this help

Reads critical path list from docs/SLO_COVERAGE.md.
Queries slo_events table for coverage within the window.
Exits non-zero if any critical path has no recorded SLO event.
Without DATABASE_URL: validates the SLO_COVERAGE.md document structure only.
`);
  process.exit(0);
}

const LOOKBACK_DAYS = Number(argVal("days", "7"));
const SLO_COVERAGE_DOC = path.join(REPO_ROOT, "docs/SLO_COVERAGE.md");
const MOCK_MODE = !process.env.DATABASE_URL;

// Canonical list of critical paths that MUST have SLO coverage
const CRITICAL_PATHS = [
  "sale.confirmSale",
  "purchase.commitPurchaseInvoice",
  "payment.captureWebhook",
  "prescription.upload",
  "ocr.process",
  "inventory.adjust",
  "dsr.access",
  "dsr.erasure",
  "retention.tick",
];

if (MOCK_MODE) {
  console.log(
    "[slo-coverage] MOCK MODE — DATABASE_URL not set. Validating SLO_COVERAGE.md structure."
  );
}

function validateDoc() {
  if (!fs.existsSync(SLO_COVERAGE_DOC)) {
    console.error(`[slo-coverage] ERROR: docs/SLO_COVERAGE.md not found.`);
    console.error(
      `[slo-coverage] Create this document listing all critical paths and their SLO status.`
    );
    return false;
  }

  const content = fs.readFileSync(SLO_COVERAGE_DOC, "utf-8");
  const missing = CRITICAL_PATHS.filter(p => !content.includes(p));
  if (missing.length > 0) {
    console.error(
      `[slo-coverage] ERROR: These critical paths are missing from SLO_COVERAGE.md:`
    );
    for (const p of missing) console.error(`  - ${p}`);
    return false;
  }

  console.log(
    `[slo-coverage] SLO_COVERAGE.md contains all ${CRITICAL_PATHS.length} critical paths.`
  );
  return true;
}

async function querySloCoverage() {
  // TBD: query slo_events table
  // SELECT slo_name, COUNT(*) as event_count, MAX(created_at) as last_event
  // FROM slo_events
  // WHERE created_at >= NOW() - INTERVAL :days DAY
  //   AND slo_name IN (:paths)
  // GROUP BY slo_name;
  console.log(
    "[slo-coverage] DB query not yet wired — returning mock coverage data."
  );
  return CRITICAL_PATHS.map(p => ({
    sloName: p,
    eventCount: 0,
    lastEvent: null,
    covered: false,
  }));
}

async function main() {
  console.log(
    `[slo-coverage] Checking SLO coverage for ${CRITICAL_PATHS.length} critical paths (${LOOKBACK_DAYS}-day window)...`
  );

  const docValid = validateDoc();
  if (!docValid) {
    process.exit(1);
  }

  if (MOCK_MODE) {
    console.log(
      "[slo-coverage] MOCK MODE: Skipping DB query. Set DATABASE_URL for live coverage check."
    );
    console.log("[slo-coverage] PASS (doc validation only)");
    process.exit(0);
  }

  const coverage = await querySloCoverage();

  const missing = coverage.filter(c => !c.covered || c.eventCount === 0);
  const covered = coverage.filter(c => c.covered && c.eventCount > 0);

  console.log(
    `[slo-coverage] Covered: ${covered.length}/${CRITICAL_PATHS.length}`
  );

  if (missing.length > 0) {
    console.error(`[slo-coverage] FAIL — Missing SLO coverage for:`);
    for (const m of missing) {
      console.error(`  - ${m.sloName} (last event: ${m.lastEvent ?? "never"})`);
    }
    console.error(
      `[slo-coverage] Action: wire sloService.emitSloEvent() calls for missing paths.`
    );
    process.exit(1);
  }

  console.log(
    "[slo-coverage] PASS — All critical paths have recent SLO event coverage."
  );
}

main().catch(err => {
  console.error(`[slo-coverage] Fatal: ${err.message}`);
  process.exit(1);
});
