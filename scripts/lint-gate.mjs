/**
 * Compares the current ESLint problem count against lint-baseline.txt.
 * Fails if count increases (regression), passes if stable or improved.
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";

const baseline = parseInt(readFileSync("lint-baseline.txt", "utf8").trim(), 10);
if (isNaN(baseline)) {
  console.error("lint-baseline.txt is missing or invalid");
  process.exit(1);
}

let output = "";
try {
  output = execSync("pnpm run lint", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
} catch (err) {
  output = (err.stdout ?? "") + (err.stderr ?? "");
}

const match = output.match(/(\d+) problems/);
const current = match ? parseInt(match[1], 10) : 0;

if (current > baseline) {
  console.error(
    `Lint regression: ${current} problems > baseline ${baseline}. Run pnpm run lint:fix to remediate.`
  );
  process.exit(1);
}
console.log(`Lint OK: ${current} problems (baseline ${baseline})`);
