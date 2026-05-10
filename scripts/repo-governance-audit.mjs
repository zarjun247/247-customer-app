#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const requiredFiles = [
  "AGENTS.MD",
  "docs/PRODUCT_NORTH_STAR.md",
  "docs/PHARMACY_OS_BLUEPRINT.md",
  "package.json",
  "pnpm-lock.yaml",
  "docker-compose.test.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/concurrency-proof.yml",
  "scripts/ci-governance-guards.mjs",
  "scripts/repo-governance-audit.mjs",
  "scripts/verify-migrations.mjs",
  "server/mysql-concurrency.integration.test.ts",
  "server/testUtils/dbTestLifecycle.ts",
  "CONCURRENCY_PROOF_STATUS.md",
  "OPEN_BLOCKERS.md",
  "CURRENT_MAIN_TRUTH.md",
  "VALIDATION_COMMANDS.md",
];

const requiredPackageScripts = [
  "check",
  "test",
  "build",
  "test:db:bootstrap",
  "test:db:smoke",
  "test:db:concurrency",
];

const requiredValidationCommands = [
  "pnpm run check",
  "pnpm test",
  "pnpm run build",
  "node scripts/verify-migrations.mjs",
  "node scripts/ci-governance-guards.mjs all",
  "node scripts/repo-governance-audit.mjs",
  "git diff --check",
  "pnpm run test:db:concurrency",
];

const concurrencyProofs = [
  /last-unit reservation race/i,
  /POS sale and app reservation/i,
  /invoice number reservations remain unique/i,
  /provider webhook replay/i,
  /refund replay/i,
  /purchase commit double-submit/i,
  /sale confirmation double-submit/i,
  /payment state-transition replay/i,
  /refund settlement cannot exceed paid amount/i,
  /reservation expiry during payment/i,
];

function relPath(filePath) {
  return path.join(REPO_ROOT, filePath);
}

function readRequired(filePath, findings) {
  if (!existsSync(relPath(filePath))) {
    findings.push(`Missing required governance/proof file: ${filePath}`);
    return "";
  }
  return readFileSync(relPath(filePath), "utf8");
}

function assertContains(findings, label, text, pattern, message) {
  if (!pattern.test(text)) findings.push(`${label}: ${message}`);
}

function main() {
  const findings = [];

  for (const filePath of requiredFiles) {
    if (!existsSync(relPath(filePath))) findings.push(`Missing required file: ${filePath}`);
  }

  const packageJsonText = readRequired("package.json", findings);
  if (packageJsonText) {
    const packageJson = JSON.parse(packageJsonText);
    for (const scriptName of requiredPackageScripts) {
      if (!packageJson.scripts?.[scriptName]) findings.push(`package.json is missing script: ${scriptName}`);
    }
    if (packageJson.scripts?.["test:db:concurrency"] !== "vitest run server/mysql-concurrency.integration.test.ts") {
      findings.push("package.json test:db:concurrency must run server/mysql-concurrency.integration.test.ts directly.");
    }
  }

  const validationText = readRequired("VALIDATION_COMMANDS.md", findings);
  for (const command of requiredValidationCommands) {
    if (!validationText.includes(command)) findings.push(`VALIDATION_COMMANDS.md is missing command: ${command}`);
  }
  assertContains(findings, "VALIDATION_COMMANDS.md", validationText, /TEST_DATABASE_URL/i, "must document TEST_DATABASE_URL for DB proof.");
  assertContains(findings, "VALIDATION_COMMANDS.md", validationText, /docker compose -f docker-compose\.test\.yml up -d mysql-test/i, "must document the local Docker MySQL path.");

  const composeText = readRequired("docker-compose.test.yml", findings);
  assertContains(findings, "docker-compose.test.yml", composeText, /mysql:8\.4/i, "must pin the MySQL test service image.");
  assertContains(findings, "docker-compose.test.yml", composeText, /247_customer_app_test/i, "must provision a database whose name includes test.");
  assertContains(findings, "docker-compose.test.yml", composeText, /3307:3306/i, "must expose local MySQL on host port 3307.");

  const workflowText = readRequired(".github/workflows/concurrency-proof.yml", findings);
  assertContains(findings, ".github/workflows/concurrency-proof.yml", workflowText, /mysql:8\.4/i, "must provision MySQL 8.4.");
  assertContains(findings, ".github/workflows/concurrency-proof.yml", workflowText, /TEST_DATABASE_URL:/i, "must set TEST_DATABASE_URL.");
  assertContains(findings, ".github/workflows/concurrency-proof.yml", workflowText, /pnpm run test:db:bootstrap/i, "must apply test migrations before proof.");
  assertContains(findings, ".github/workflows/concurrency-proof.yml", workflowText, /pnpm run test:db:concurrency/i, "must run the DB concurrency proof command.");

  const lifecycleText = readRequired("server/testUtils/dbTestLifecycle.ts", findings);
  assertContains(findings, "server/testUtils/dbTestLifecycle.ts", lifecycleText, /TEST_DB_ENV_VAR = "TEST_DATABASE_URL"/, "must centralize the test DB env var.");
  assertContains(findings, "server/testUtils/dbTestLifecycle.ts", lifecycleText, /database name must include "test"/i, "must refuse non-test databases.");
  assertContains(findings, "server/testUtils/dbTestLifecycle.ts", lifecycleText, /must be separate from DATABASE_URL/i, "must refuse DATABASE_URL reuse.");
  assertContains(findings, "server/testUtils/dbTestLifecycle.ts", lifecycleText, /NODE_ENV === "production"/i, "must refuse production NODE_ENV.");

  const concurrencyTestText = readRequired("server/mysql-concurrency.integration.test.ts", findings);
  assertContains(findings, "server/mysql-concurrency.integration.test.ts", concurrencyTestText, /describe\.skip/i, "must skip instead of pretending proof when TEST_DATABASE_URL is absent.");
  assertContains(findings, "server/mysql-concurrency.integration.test.ts", concurrencyTestText, /DB-backed race proof is not claimed/i, "must warn that skipped DB tests do not claim proof.");
  assertContains(findings, "server/mysql-concurrency.integration.test.ts", concurrencyTestText, /applyTestMigrations/i, "must migrate the DB before running proof cases.");
  for (const proofPattern of concurrencyProofs) {
    assertContains(findings, "server/mysql-concurrency.integration.test.ts", concurrencyTestText, proofPattern, `missing proof case matching ${proofPattern}`);
  }

  const proofStatusText = readRequired("CONCURRENCY_PROOF_STATUS.md", findings);
  assertContains(findings, "CONCURRENCY_PROOF_STATUS.md", proofStatusText, /DB-backed concurrency proof is \*\*not claimed\*\*/i, "must not claim DB proof unless executed.");
  assertContains(findings, "CONCURRENCY_PROOF_STATUS.md", proofStatusText, /CI proof path/i, "must document the CI proof path.");

  if (findings.length > 0) {
    console.error(`Repository governance audit failed with ${findings.length} finding(s):`);
    for (const finding of findings) console.error(`- ${finding}`);
    process.exit(1);
  }

  console.log("Repository governance audit passed.");
  console.log("Verified governance files, validation commands, TEST_DATABASE_URL documentation, local Docker MySQL path, CI MySQL proof workflow, and DB concurrency proof harness coverage.");
}

main();
