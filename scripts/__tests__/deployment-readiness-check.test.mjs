/**
 * Tests for deployment-readiness-check.mjs
 * Run with: node --test scripts/__tests__/deployment-readiness-check.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts/deployment-readiness-check.mjs");

test("--help exits 0 and prints usage", () => {
  const result = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf-8", timeout: 10_000 });
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  assert.match(result.stdout + result.stderr, /deployment-readiness-check/i);
});

test("--env staging --skip-tests --json exits without crash", () => {
  const result = spawnSync("node", [SCRIPT, "--env", "staging", "--skip-tests", "--json"], {
    encoding: "utf-8",
    timeout: 120_000,
    cwd: REPO_ROOT,
  });
  // Allow exit 0 (pass), 1 (fail), or 2 (warn) — but not a crash (signal or null)
  assert.ok(
    result.status === 0 || result.status === 1 || result.status === 2,
    `Expected exit 0/1/2, got ${result.status}. stderr: ${result.stderr?.slice(0, 500)}`,
  );
  // JSON mode should produce valid JSON on stdout
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (e) {
    assert.fail(`stdout was not valid JSON: ${result.stdout?.slice(0, 300)}`);
  }
  assert.ok(parsed.checks, "Report should have checks array");
  assert.ok(parsed.overall, "Report should have overall field");
  assert.ok(parsed.env, "Report should have env field");
});

test("--env production --skip-tests --json returns env=production in report", () => {
  const result = spawnSync("node", [SCRIPT, "--env", "production", "--skip-tests", "--json"], {
    encoding: "utf-8",
    timeout: 120_000,
    cwd: REPO_ROOT,
  });
  assert.ok(
    result.status === 0 || result.status === 1 || result.status === 2,
    `Expected exit 0/1/2, got ${result.status}`,
  );
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.env, "production");
});

test("report contains expected check names", () => {
  const result = spawnSync("node", [SCRIPT, "--env", "staging", "--skip-tests", "--json"], {
    encoding: "utf-8",
    timeout: 120_000,
    cwd: REPO_ROOT,
  });
  const parsed = JSON.parse(result.stdout);
  const names = parsed.checks.map((c) => c.name);
  assert.ok(names.includes("typecheck"), "Should include typecheck check");
  assert.ok(names.includes("tests"), "Should include tests check");
  assert.ok(names.includes("backup-freshness"), "Should include backup-freshness check");
  assert.ok(names.includes("restore-drill-recency"), "Should include restore-drill-recency check");
  assert.ok(names.includes("no-open-p0-incidents"), "Should include no-open-p0-incidents check");
});
