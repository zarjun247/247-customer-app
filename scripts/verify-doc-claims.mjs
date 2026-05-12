/**
 * Verify that claims made in docs match the actual codebase.
 *
 * Five checks:
 *   1. Sealed files exist (they are claimed protected in CLAUDE.md / project docs).
 *   2. Scripts referenced in package.json "scripts" all exist on disk.
 *   3. Scripts referenced in .github/workflows/*.yml all exist on disk.
 *   4. Every process.env.VAR in server/_core/env.ts appears in .env.example.
 *   5. scripts/lint-baseline-by-file.json is valid JSON.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const errors = [];

// ── 1. Sealed files ─────────────────────────────────────────────────────────
const SEALED = [
  "server/services/aiGovernance.ts",
  "server/services/stockInvariant.ts",
  "server/services/reservationLedger.ts",
  "server/services/capabilityGrantService.ts",
  "server/services/auditHashChain.ts",
];

for (const f of SEALED) {
  if (!existsSync(resolve(root, f))) {
    errors.push(`[sealed-files] Missing sealed file: ${f}`);
  }
}

// ── 2. Scripts in package.json "scripts" exist on disk ──────────────────────
const pkgRaw = readFileSync(resolve(root, "package.json"), "utf8");
const pkg = JSON.parse(pkgRaw);
const pkgScriptRefs =
  Object.values(pkg.scripts ?? {})
    .join("\n")
    .match(/scripts\/[\w.-]+\.mjs/g) ?? [];

for (const ref of [...new Set(pkgScriptRefs)]) {
  if (!existsSync(resolve(root, ref))) {
    errors.push(`[pkg-scripts] package.json references missing script: ${ref}`);
  }
}

// ── 3. Scripts in .github/workflows/*.yml exist on disk ─────────────────────
const workflowsDir = resolve(root, ".github/workflows");
if (existsSync(workflowsDir)) {
  const yamlFiles = readdirSync(workflowsDir).filter(
    f => f.endsWith(".yml") || f.endsWith(".yaml")
  );
  for (const yf of yamlFiles) {
    const yamlText = readFileSync(resolve(workflowsDir, yf), "utf8");
    const refs = yamlText.match(/scripts\/[\w.-]+\.mjs/g) ?? [];
    for (const ref of [...new Set(refs)]) {
      if (!existsSync(resolve(root, ref))) {
        errors.push(`[ci-scripts] ${yf} references missing script: ${ref}`);
      }
    }
  }
}

// ── 4. env.ts process.env vars appear in .env.example ───────────────────────
const envTs = readFileSync(resolve(root, "server/_core/env.ts"), "utf8");
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");

const envVarMatches = [...envTs.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)];
const envVarsInCode = [...new Set(envVarMatches.map(m => m[1]))];

for (const varName of envVarsInCode) {
  if (!envExample.includes(varName)) {
    errors.push(
      `[env-coverage] ${varName} in env.ts but missing from .env.example`
    );
  }
}

// ── 5. lint-baseline-by-file.json is valid JSON ─────────────────────────────
const baselinePath = resolve(root, "scripts/lint-baseline-by-file.json");
try {
  JSON.parse(readFileSync(baselinePath, "utf8"));
} catch (e) {
  errors.push(
    `[lint-baseline] scripts/lint-baseline-by-file.json is not valid JSON: ${e.message}`
  );
}

// ── Result ───────────────────────────────────────────────────────────────────
if (errors.length) {
  console.error("Doc-claims verification FAILED:");
  for (const e of errors) console.error(" ", e);
  process.exit(1);
}
console.log("Doc-claims verification OK (5/5 checks passed)");
