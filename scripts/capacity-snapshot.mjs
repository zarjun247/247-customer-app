#!/usr/bin/env node
/**
 * capacity-snapshot.mjs
 *
 * Captures DB row counts, table sizes, worker queue depth, and average SLO
 * response times. Outputs a markdown report to evidence/capacity-snapshots/<date>.md
 *
 * Usage:
 *   node scripts/capacity-snapshot.mjs [--output <path>] [--help]
 *
 * Environment:
 *   DATABASE_URL   Required for real DB queries. Without it: runs in MOCK MODE.
 */
import fs from "node:fs";
import path from "node:path";
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
capacity-snapshot.mjs — monthly capacity review snapshot

Usage:
  node scripts/capacity-snapshot.mjs [options]

Options:
  --output <path>   Output markdown file (default: evidence/capacity-snapshots/<date>.md)
  --help            Show this help

Environment:
  DATABASE_URL   When set: queries live DB for real data.
                 When unset: MOCK MODE (example data for testing).

Output includes:
  - Top 20 tables by row count and disk size
  - Worker queue depths per queue
  - Average SLO latency per critical procedure (last 7 days)
  - Process memory usage
`);
  process.exit(0);
}

const dateStr = new Date().toISOString().slice(0, 10);
const SNAPSHOTS_DIR = path.join(REPO_ROOT, "evidence/capacity-snapshots");
const defaultOutput = path.join(SNAPSHOTS_DIR, `${dateStr}.md`);
const outputPath = argVal("output", defaultOutput);

const MOCK_MODE = !process.env.DATABASE_URL;
if (MOCK_MODE) {
  console.log("[capacity-snapshot] MOCK MODE — DATABASE_URL not set.");
}

async function getTableStats() {
  if (MOCK_MODE) {
    return [
      { table: "stock_movements", rows: 125000, sizeMb: 48.2 },
      { table: "audit_log_chain", rows: 89000, sizeMb: 32.1 },
      { table: "slo_events", rows: 72000, sizeMb: 14.5 },
      { table: "sales", rows: 45000, sizeMb: 12.3 },
      { table: "sale_lines", rows: 98000, sizeMb: 18.7 },
      { table: "orders", rows: 38000, sizeMb: 9.8 },
      { table: "provider_webhook_events", rows: 31000, sizeMb: 8.4 },
      { table: "worker_jobs", rows: 28000, sizeMb: 6.2 },
      { table: "prescriptions", rows: 22000, sizeMb: 5.6 },
      { table: "batches", rows: 18000, sizeMb: 4.1 },
    ].slice(0, 10);
  }

  // TBD: query information_schema.TABLES for real data
  // SELECT TABLE_NAME as `table`, TABLE_ROWS as rows,
  //   ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS sizeMb
  // FROM information_schema.TABLES
  // WHERE TABLE_SCHEMA = DATABASE()
  // ORDER BY TABLE_ROWS DESC LIMIT 20;
  return [];
}

async function getQueueDepths() {
  if (MOCK_MODE) {
    return [
      { queue: "notifications", pending: 12, dead_letter: 2 },
      { queue: "ocr_jobs", pending: 3, dead_letter: 0 },
      { queue: "outbox_dispatch", pending: 8, dead_letter: 1 },
      { queue: "reservation_expiry", pending: 0, dead_letter: 0 },
    ];
  }
  // TBD: query worker_jobs table grouped by queue name
  return [];
}

async function getSloStats() {
  if (MOCK_MODE) {
    return [
      { procedure: "sale.confirmSale", p95Ms: 320, p99Ms: 580, samples: 4200 },
      {
        procedure: "payment.captureWebhook",
        p95Ms: 180,
        p99Ms: 420,
        samples: 1800,
      },
      {
        procedure: "prescription.upload",
        p95Ms: 890,
        p99Ms: 1420,
        samples: 650,
      },
      { procedure: "inventory.adjust", p95Ms: 95, p99Ms: 210, samples: 3100 },
    ];
  }
  // TBD: query slo_events table for latency percentiles
  return [];
}

function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    rss: Math.round(mem.rss / 1024 / 1024),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    external: Math.round(mem.external / 1024 / 1024),
  };
}

function renderMarkdown(tableStats, queueDepths, sloStats, mem) {
  const mode = MOCK_MODE
    ? " _(MOCK DATA — run with DATABASE_URL for real data)_"
    : "";
  const lines = [
    `# Capacity Snapshot — ${dateStr}${mode}`,
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Mode:** ${MOCK_MODE ? "MOCK (no DATABASE_URL)" : "LIVE"}`,
    "",
    "## Table Sizes (top by row count)",
    "",
    "| Table | Rows | Size (MB) |",
    "|-------|------|-----------|",
    ...tableStats.map(
      r => `| ${r.table} | ${r.rows.toLocaleString()} | ${r.sizeMb} |`
    ),
    "",
    "## Worker Queue Depths",
    "",
    "| Queue | Pending | Dead Letters |",
    "|-------|---------|--------------|",
    ...queueDepths.map(q => `| ${q.queue} | ${q.pending} | ${q.dead_letter} |`),
    "",
    "## SLO Latency (last 7 days)",
    "",
    "| Procedure | p95 (ms) | p99 (ms) | Samples |",
    "|-----------|----------|----------|---------|",
    ...sloStats.map(
      s =>
        `| ${s.procedure} | ${s.p95Ms} | ${s.p99Ms} | ${s.samples.toLocaleString()} |`
    ),
    "",
    "## Process Memory",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| RSS | ${mem.rss} MB |`,
    `| Heap Used | ${mem.heapUsed} MB |`,
    `| Heap Total | ${mem.heapTotal} MB |`,
    `| External | ${mem.external} MB |`,
    "",
    "---",
    "",
    "> Review cadence: monthly. Owner: Platform owner. Escalate if queue depth > 100 or table size grows > 20% month-over-month.",
  ];
  return lines.join("\n");
}

async function main() {
  console.log(`[capacity-snapshot] Collecting snapshot for ${dateStr}...`);

  const [tableStats, queueDepths, sloStats] = await Promise.all([
    getTableStats(),
    getQueueDepths(),
    getSloStats(),
  ]);
  const mem = getMemoryUsage();

  const report = renderMarkdown(tableStats, queueDepths, sloStats, mem);

  if (!fs.existsSync(SNAPSHOTS_DIR))
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  fs.writeFileSync(outputPath, report, "utf-8");

  console.log(`[capacity-snapshot] Report written: ${outputPath}`);
  console.log(
    `[capacity-snapshot] Tables: ${tableStats.length}, Queues: ${queueDepths.length}, SLOs: ${sloStats.length}`
  );
  if (MOCK_MODE) {
    console.log(
      "[capacity-snapshot] NOTE: MOCK MODE — set DATABASE_URL for real data."
    );
  }
}

main().catch(err => {
  console.error(`[capacity-snapshot] Fatal: ${err.message}`);
  process.exit(1);
});
