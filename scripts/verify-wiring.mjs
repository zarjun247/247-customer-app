#!/usr/bin/env node
/**
 * verify-wiring.mjs
 *
 * 8 static checks that assert SM-E wiring is in place:
 *   1. CSRF middleware imported in httpSecurity.ts
 *   2. retentionWorker start/stop exported
 *   3. dsrSlaMonitor start/stop exported
 *   4. server/_core/index.ts calls all 4 worker start functions
 *   5. intelligenceRouter imports assertPhaseAtLeast
 *   6. aiEvalRouter imports assertPhaseAtLeast
 *   7. system.ts is a barrel (re-exports system_ops, system_comms, system_consumer)
 *   8. client featureFlags.tsx exports PhaseProvider and PhaseGate
 *
 * Usage:
 *   node scripts/verify-wiring.mjs
 *
 * Exits 0 if all checks pass. Exits 1 and prints failures otherwise.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf-8");
}

const checks = [
  {
    name: "CSRF middleware wired in httpSecurity.ts",
    file: "server/middleware/httpSecurity.ts",
    patterns: ["csrfMiddleware", "handleCsrfError"],
  },
  {
    name: "retentionWorker exports startRetentionWorker and stopRetentionWorker",
    file: "server/services/retentionWorker.ts",
    patterns: [
      "export function startRetentionWorker",
      "export function stopRetentionWorker",
    ],
  },
  {
    name: "dsrSlaMonitor exports startDsrSlaMonitor and stopDsrSlaMonitor",
    file: "server/services/dsrSlaMonitor.ts",
    patterns: [
      "export function startDsrSlaMonitor",
      "export function stopDsrSlaMonitor",
    ],
  },
  {
    name: "server/_core/index.ts calls all 4 worker start functions",
    file: "server/_core/index.ts",
    patterns: [
      "startRetentionWorker",
      "stopRetentionWorker",
      "startDsrSlaMonitor",
      "stopDsrSlaMonitor",
    ],
  },
  {
    name: "intelligenceRouter imports assertPhaseAtLeast",
    file: "server/routers/intelligenceRouter.ts",
    patterns: ["assertPhaseAtLeast"],
  },
  {
    name: "aiEvalRouter imports assertPhaseAtLeast",
    file: "server/routers/aiEvalRouter.ts",
    patterns: ["assertPhaseAtLeast"],
  },
  {
    name: "system.ts is a barrel re-exporting system_ops, system_comms, system_consumer",
    file: "drizzle/schema/system.ts",
    patterns: [
      'export * from "./system_ops"',
      'export * from "./system_comms"',
      'export * from "./system_consumer"',
    ],
  },
  {
    name: "client featureFlags.tsx exports PhaseProvider and PhaseGate",
    file: "client/src/lib/featureFlags.tsx",
    patterns: ["export function PhaseProvider", "export function PhaseGate"],
  },
];

let failures = 0;

for (const check of checks) {
  const content = read(check.file);
  if (content === null) {
    console.error(`FAIL [${check.name}]: file not found — ${check.file}`);
    failures++;
    continue;
  }

  const missing = check.patterns.filter(p => !content.includes(p));
  if (missing.length > 0) {
    console.error(`FAIL [${check.name}]:`);
    for (const m of missing) {
      console.error(`  missing pattern: ${m}`);
    }
    failures++;
  } else {
    console.log(`PASS [${check.name}]`);
  }
}

console.log(`\n${checks.length - failures}/${checks.length} checks passed.`);
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
