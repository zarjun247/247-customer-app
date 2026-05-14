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
let totalWarnings = 0;

for (const r of results) {
  if (!r.errorCount && !r.warningCount) continue;
  const rel = r.filePath
    .replace(process.cwd().replace(/\\/g, "/") + "/", "")
    .replace(/\\/g, "/");
  const isTestFile = rel.endsWith(".test.ts") || rel.endsWith(".test.tsx");
  const currentErrors = r.errorCount;
  const currentWarnings = r.warningCount;
  totalErrors += currentErrors;
  totalWarnings += currentWarnings;

  if (isTestFile) {
    // Per-file ratchet for test files only
    const allowed = (baseline[rel] ?? { errors: 0 }).errors;
    if (currentErrors > allowed) {
      regressions.push({ file: rel, allowed, current: currentErrors });
    }
  } else if (currentErrors > 0) {
    // Hard zero errors for all non-test source files
    regressions.push({ file: rel, allowed: 0, current: currentErrors });
  } else if (currentWarnings > 0) {
    // Hard zero warnings for all non-test source files
    regressions.push({
      file: rel,
      allowed: 0,
      current: currentWarnings,
      kind: "warnings",
    });
  }
}

if (regressions.length) {
  console.error("Lint issues found. Run pnpm run lint to see details.");
  for (const { file, allowed, current, kind } of regressions) {
    const label = kind === "warnings" ? "warnings" : "errors";
    console.error(`  ${file}: ${current} ${label} (baseline: ${allowed})`);
  }
  process.exit(1);
}
console.log(`Lint gate OK: ${totalErrors} errors, ${totalWarnings} warnings`);
