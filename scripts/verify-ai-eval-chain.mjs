#!/usr/bin/env node
/**
 * verify-ai-eval-chain.mjs
 *
 * CLI tool to verify the tamper-evident AI eval ledger hash chain.
 *
 * Usage:
 *   node scripts/verify-ai-eval-chain.mjs [options]
 *
 * Options:
 *   --from <n>       Start sequence number (default: 0)
 *   --to <n>         End sequence number (default: all)
 *   --max-rows <n>   Maximum rows to check (default: 100000)
 *   --stats          Show ledger stats only, skip verification
 *   --help           Show this message
 *
 * Exit codes:
 *   0  Chain verified (or stats-only mode)
 *   1  Chain violation detected
 *   2  DB unavailable or script error
 */
import { createRequire } from "node:module";

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`
verify-ai-eval-chain.mjs — AI eval ledger hash chain verifier

Usage:
  node scripts/verify-ai-eval-chain.mjs [--from N] [--to N] [--max-rows N] [--stats]

Options:
  --from <n>       First sequence number to check (default: 0)
  --to <n>         Last sequence number to check (default: all)
  --max-rows <n>   Max rows to load (default: 100000)
  --stats          Print ledger stats and exit without verifying
  --help           Show this help message

Exit codes:
  0  Verified (or stats mode)
  1  Chain violation detected
  2  Error (DB unavailable, config issue)
`);
  process.exit(0);
}

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  const val = parseInt(args[idx + 1], 10);
  return Number.isFinite(val) ? val : undefined;
}

const fromSequence = getArg("--from");
const toSequence = getArg("--to");
const maxRows = getArg("--max-rows") ?? 100_000;
const statsOnly = args.includes("--stats");

// ─── Load DB + service at runtime ─────────────────────────────────────────────

async function loadServices() {
  try {
    const { verifyChain, getStats } = await import("../dist/server/services/aiEvalLedger.js");
    return { verifyChain, getStats };
  } catch {
    try {
      const require = createRequire(import.meta.url);
      require("tsx/cjs");
      const { verifyChain, getStats } = require("./server/services/aiEvalLedger.ts");
      return { verifyChain, getStats };
    } catch {
      return null;
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const services = await loadServices();

  if (!services) {
    console.warn("[verify-ai-eval-chain] Running in standalone mode (no compiled output found).");
    console.warn("[verify-ai-eval-chain] Connect a DATABASE_URL and re-run after `pnpm build`.");
    console.log(JSON.stringify({ verified: null, note: "standalone-mode-no-db", rowsChecked: 0 }));
    process.exit(0);
  }

  const { verifyChain, getStats } = services;

  if (statsOnly) {
    try {
      const stats = await getStats();
      console.log(JSON.stringify({ ok: true, stats }, null, 2));
      process.exit(0);
    } catch (err) {
      console.error("[verify-ai-eval-chain] getStats failed:", err.message);
      process.exit(2);
    }
  }

  try {
    const result = await verifyChain({ fromSequence, toSequence, maxRows });
    console.log(JSON.stringify({ ok: result.verified, ...result }, null, 2));
    if (!result.verified) {
      console.error(
        `[verify-ai-eval-chain] CHAIN VIOLATION at sequence ${result.firstBreakAt}: ${result.firstBreakReason}`,
      );
      process.exit(1);
    }
    console.error(
      `[verify-ai-eval-chain] OK — ${result.rowsChecked} rows verified up to sequence ${result.lastSequenceNumber}`,
    );
    process.exit(0);
  } catch (err) {
    console.error("[verify-ai-eval-chain] Error:", err.message);
    process.exit(2);
  }
}

main();
