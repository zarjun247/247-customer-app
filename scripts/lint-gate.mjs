/**
 * Hard-zero lint gate: any ESLint error in server/ or shared/ fails the build.
 * Test files (*.test.ts) use per-file ratchet from lint-baseline-by-file.json.
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
  const isTestFile = rel.endsWith(".test.ts") || rel.endsWith(".test.tsx");
  const current = r.errorCount;
  totalErrors += current;

  if (isTestFile) {
    // Per-file ratchet for test files only
    const allowed = (baseline[rel] ?? { errors: 0 }).errors;
    if (current > allowed) {
      regressions.push({ file: rel, allowed, current });
    }
  } else if (current > 0) {
    // Hard zero for all non-test source files
    regressions.push({ file: rel, allowed: 0, current });
  }
}

if (regressions.length) {
  console.error("Lint errors found. Run pnpm run lint to see details.");
  for (const { file, allowed, current } of regressions) {
    console.error(`  ${file}: ${current} errors (baseline: ${allowed})`);
  }
  process.exit(1);
}
console.log(`Lint gate OK: ${totalErrors} total errors`);
