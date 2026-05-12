/**
 * Per-file lint ratchet: compares current ESLint error counts against
 * scripts/lint-baseline-by-file.json. Any file that gains errors vs its
 * baseline fails the gate. Files that improve (fewer errors) are allowed.
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";

const baselinePath = new URL(
  "./lint-baseline-by-file.json",
  import.meta.url
).pathname.replace(/^\/([A-Z]:)/, "$1");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

let raw = "";
try {
  raw = execSync("pnpm exec eslint server/ shared/ --format json", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  raw = err.stdout ?? "[]";
}

const results = JSON.parse(raw || "[]");
const regressions = [];
let totalErrors = 0;

for (const r of results) {
  if (!r.errorCount && !r.warningCount) continue;
  const rel = r.filePath
    .replace(process.cwd().replace(/\\/g, "/") + "/", "")
    .replace(/\\/g, "/");
  const allowed = (baseline[rel] ?? { errors: 0 }).errors;
  const current = r.errorCount;
  totalErrors += current;
  if (current > allowed) {
    regressions.push({ file: rel, allowed, current });
  }
}

if (regressions.length) {
  console.error("Lint regressions detected:");
  for (const { file, allowed, current } of regressions) {
    console.error(`  ${file}: ${current} errors (baseline: ${allowed})`);
  }
  process.exit(1);
}
console.log(
  `Lint gate OK: ${totalErrors} total errors (all within per-file baselines)`
);
