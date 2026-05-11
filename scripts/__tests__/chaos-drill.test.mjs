/**
 * Tests for chaos-drill.mjs
 * Run with: node --test scripts/__tests__/chaos-drill.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts/chaos-drill.mjs");

test("--help exits 0 and prints usage", () => {
  const result = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf-8", timeout: 10_000 });
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  assert.match(result.stdout + result.stderr, /chaos-drill/i);
});

test("no scenario argument shows help and exits 0", () => {
  const result = spawnSync("node", [SCRIPT], { encoding: "utf-8", timeout: 10_000 });
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}`);
  assert.match(result.stdout + result.stderr, /Usage/i);
});

test("refuses to run against NODE_ENV=production without CHAOS_DRILL_ENABLED", () => {
  const result = spawnSync(
    "node",
    [SCRIPT, "provider-webhook-fail"],
    {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, NODE_ENV: "production", CHAOS_DRILL_ENABLED: "" },
    },
  );
  assert.equal(result.status, 2, `Expected exit 2 (production gate), got ${result.status}. stderr: ${result.stderr}`);
  assert.match(result.stderr, /production/i);
});

test("allows non-production run of readiness-fail-injection", () => {
  const result = spawnSync(
    "node",
    [SCRIPT, "readiness-fail-injection"],
    {
      encoding: "utf-8",
      timeout: 30_000,
      cwd: REPO_ROOT,
      env: { ...process.env, NODE_ENV: "test" },
    },
  );
  // Exit 0 = success, 1 = fail outcome. Either is acceptable (scenario ran)
  assert.ok(
    result.status === 0 || result.status === 1,
    `Expected exit 0 or 1, got ${result.status}. stderr: ${result.stderr?.slice(0, 500)}`,
  );
});

test("unknown scenario exits 1 with error message", () => {
  const result = spawnSync(
    "node",
    [SCRIPT, "not-a-real-scenario"],
    {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, NODE_ENV: "test" },
    },
  );
  assert.equal(result.status, 1, `Expected exit 1, got ${result.status}`);
  assert.match(result.stderr, /Unknown scenario/i);
});
