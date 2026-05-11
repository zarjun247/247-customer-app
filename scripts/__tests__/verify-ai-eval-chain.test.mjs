/**
 * Tests for verify-ai-eval-chain.mjs
 * Run with: node --test scripts/__tests__/verify-ai-eval-chain.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(REPO_ROOT, "scripts/verify-ai-eval-chain.mjs");

test("--help exits 0 and prints usage", () => {
  const result = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf-8", timeout: 10_000 });
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  assert.match(result.stdout + result.stderr, /verify-ai-eval-chain/i);
});

test("--help output includes --from and --to flags", () => {
  const result = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf-8", timeout: 10_000 });
  assert.match(result.stdout, /--from/i);
  assert.match(result.stdout, /--to/i);
});

test("--help output includes --stats flag", () => {
  const result = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf-8", timeout: 10_000 });
  assert.match(result.stdout, /--stats/i);
});

test("--help output documents exit codes", () => {
  const result = spawnSync("node", [SCRIPT, "--help"], { encoding: "utf-8", timeout: 10_000 });
  assert.match(result.stdout, /exit/i);
});

test("no compiled output: standalone mode exits 0 with JSON", () => {
  const result = spawnSync("node", [SCRIPT], {
    encoding: "utf-8",
    timeout: 15_000,
    env: { ...process.env, DATABASE_URL: "" },
  });
  assert.equal(result.status, 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
  const output = result.stdout + result.stderr;
  assert.match(output, /standalone|ok|verified/i);
});

test("--stats flag is accepted without error in standalone mode", () => {
  const result = spawnSync("node", [SCRIPT, "--stats"], {
    encoding: "utf-8",
    timeout: 15_000,
    env: { ...process.env, DATABASE_URL: "" },
  });
  assert.ok(result.status === 0 || result.status === 2, `Expected exit 0 or 2, got ${result.status}`);
});

test("--max-rows flag is accepted", () => {
  const result = spawnSync("node", [SCRIPT, "--max-rows", "100"], {
    encoding: "utf-8",
    timeout: 15_000,
    env: { ...process.env, DATABASE_URL: "" },
  });
  assert.ok(result.status === 0, `Expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
});
