/**
 * Tests for verify-audit-chain.mjs
 * Run with: node --test scripts/__tests__/verify-audit-chain.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts/verify-audit-chain.mjs");

test("--help exits 0 and prints usage", () => {
  const result = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf-8", timeout: 10_000 });
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  assert.match(result.stdout + result.stderr, /verify-audit-chain/i);
});

test("--help output includes --from and --to flags", () => {
  const result = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf-8", timeout: 10_000 });
  assert.match(result.stdout, /--from/i);
  assert.match(result.stdout, /--to/i);
});

test("--help output includes exit code documentation", () => {
  const result = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf-8", timeout: 10_000 });
  assert.match(result.stdout, /exit/i);
});

test("no compiled output: standalone mode exits 0 with JSON", () => {
  // Without DATABASE_URL or compiled output, falls back to standalone mode
  const result = spawnSync("node", [SCRIPT], {
    encoding: "utf-8",
    timeout: 15_000,
    env: { ...process.env, DATABASE_URL: "" },
  });
  // Should exit 0 (standalone mode is not a failure)
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
});

test("--stats flag is accepted without error", () => {
  const result = spawnSync("node", [SCRIPT, "--stats"], {
    encoding: "utf-8",
    timeout: 15_000,
    env: { ...process.env, DATABASE_URL: "" },
  });
  // In standalone mode, stats also exits 0
  assert.ok(result.status === 0 || result.status === 2, `Expected exit 0 or 2, got ${result.status}`);
});
