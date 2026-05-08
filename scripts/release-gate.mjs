#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const idx = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : (args[idx + 1] || fallback);
};
const mode = value("mode", process.env.APP_ENV || process.env.NODE_ENV || "test");
const artifactDir = value("artifact-dir", "tmp/artifacts");
fs.mkdirSync(artifactDir, { recursive: true });
const checks = [];
function runCheck(name, command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", env: { ...process.env, APP_ENV: mode, NODE_ENV: mode === "production" ? "production" : (process.env.NODE_ENV || "test") } });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const status = result.status === 0 ? "pass" : (options.advisory ? "warn" : "fail");
  checks.push({ name, status, command: [command, ...commandArgs].join(" "), output: output.slice(0, 4000), advisory: Boolean(options.advisory) });
}
runCheck("environment validation", "node", ["scripts/validate-production-env.mjs", "--mode", mode]);
runCheck("migration verification", "node", ["scripts/verify-migrations.mjs"]);
if (fs.existsSync("scripts/check-runtime-placeholders.mjs")) runCheck("runtime placeholder scan", "node", ["scripts/check-runtime-placeholders.mjs"]);
else if (fs.existsSync("server/placeholder-production.guard.test.ts")) runCheck("placeholder guard", "pnpm", ["test", "--", "server/placeholder-production.guard.test.ts", "--runInBand"], { advisory: mode !== "production" });
checks.push({ name: "tests command reference", status: "info", command: "pnpm test -- --runInBand", output: "Referenced for release evidence; run separately in CI and local validation.", advisory: true });
checks.push({ name: "build command reference", status: "info", command: "pnpm run build", output: "Referenced for release evidence; run separately in CI and local validation.", advisory: true });
const healthFiles = ["server/_core/index.ts", "server/_core/systemRouter.ts"].filter((file) => fs.existsSync(file));
const hasHealth = healthFiles.some((file) => /\/api\/health|\bhealth\b/.test(fs.readFileSync(file, "utf8")));
checks.push({ name: "healthcheck route presence", status: hasHealth ? "pass" : "fail", command: "static source scan", output: hasHealth ? `Healthcheck reference found in ${healthFiles.join(", ")}.` : "No healthcheck route reference found.", advisory: false });
const providerContractFiles = ["server/config/providerContracts.ts", "server/services/providerContract.ts", "server/provider-contract.guard.test.ts"];
const hasProviderContracts = providerContractFiles.every((file) => fs.existsSync(file));
checks.push({ name: "provider contract static check", status: hasProviderContracts ? "pass" : "warn", command: "static source scan", output: hasProviderContracts ? "Provider contract matrix and guard test files are present." : "Provider contract matrix files are incomplete.", advisory: !hasProviderContracts });
const blockers = checks.filter((check) => check.status === "fail");
const report = [
  `# Release Gate Report`,
  ``,
  `Mode: ${mode}`,
  `Generated: ${new Date().toISOString()}`,
  ``,
  `## Summary`,
  ``,
  `Blocking failures: ${blockers.length}`,
  `Warnings: ${checks.filter((check) => check.status === "warn").length}`,
  ``,
  `## Checks`,
  ``,
  ...checks.flatMap((check) => [`### ${check.status.toUpperCase()} ${check.name}`, ``, `Command: \`${check.command}\``, ``, "```", check.output || "(no output)", "```", ""]),
  `## Production readiness blockers`,
  ``,
  ...(blockers.length ? blockers.map((check) => `- ${check.name}`) : ["- None detected by this gate mode."]),
  ``,
  `This release gate is proof infrastructure and does not certify production readiness by itself.`,
  ``,
].join("\n");
const reportPath = path.join(artifactDir, "RELEASE_GATE_REPORT.md");
fs.writeFileSync(reportPath, report);
console.log(`Release gate (${mode}) complete: ${blockers.length} blocking failure(s).`);
for (const check of checks) console.log(`${check.status.toUpperCase()} ${check.name}`);
console.log(`Report written: ${reportPath}`);
process.exitCode = blockers.length ? 1 : 0;
