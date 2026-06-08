#!/usr/bin/env node
/**
 * sbom-ci-guard.mjs
 *
 * CI guard: reads the generated CycloneDX SBOM and asserts that the
 * `components` array is non-empty. Exits 1 with a clear error message
 * if the SBOM is missing or has zero components, so the CI pipeline
 * fails loudly rather than silently shipping an empty bill of materials.
 *
 * Usage:
 *   node scripts/sbom-ci-guard.mjs [--sbom <path>]
 *
 * Defaults to sbom.cyclonedx.json in the repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const argVal = (n, fallback = "") => {
  const idx = args.findIndex(a => a === `--${n}` || a.startsWith(`--${n}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=")
    ? hit.split("=").slice(1).join("=")
    : (args[idx + 1] ?? fallback);
};

const sbomPath = argVal("sbom", path.join(REPO_ROOT, "sbom.cyclonedx.json"));

console.log(`[sbom-ci-guard] Checking SBOM at: ${sbomPath}`);

if (!fs.existsSync(sbomPath)) {
  console.error(
    `[sbom-ci-guard] ERROR: SBOM file not found at ${sbomPath}.\n` +
      "  Run 'node scripts/sbom-generate.mjs' first, or check the CI workflow."
  );
  process.exit(1);
}

let sbom;
try {
  sbom = JSON.parse(fs.readFileSync(sbomPath, "utf-8"));
} catch (err) {
  console.error(
    `[sbom-ci-guard] ERROR: Failed to parse SBOM JSON: ${err.message}`
  );
  process.exit(1);
}

const components = sbom.components ?? sbom.packages ?? [];
const count = Array.isArray(components) ? components.length : 0;

if (count === 0) {
  console.error(
    "[sbom-ci-guard] ERROR: SBOM components array is empty.\n" +
      "  The SBOM must list at least one dependency component.\n" +
      "  This likely means sbom-generate.mjs produced a skeleton document.\n" +
      "  Ensure 'pnpm list --json' returns valid output or use npm-based CI."
  );
  process.exit(1);
}

console.log(`[sbom-ci-guard] OK: ${count} component(s) found in SBOM.`);
console.log("[sbom-ci-guard] SBOM guard passed.");
