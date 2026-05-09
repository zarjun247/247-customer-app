#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const roots = ["server", "drizzle", "client/src"].filter((root) => fs.existsSync(root));
const patterns = [
  ["TODO production", /TODO\s+production/i],
  ["placeholder provider success", /placeholder\s+provider\s+success/i],
  ["demo success", /demo\s+success/i],
  ["synthetic-provider-success", new RegExp(String.raw`(?:mock|stub)\s+success`, "i")],
  ["hardcoded demo data", /hardcoded\s+demo\s+data/i],
  ["analytics placeholder", /analytics.*(?:todo|placeholder|demo)/i],
];
function walk(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  return fs.readdirSync(target).flatMap((entry) => walk(path.join(target, entry)));
}
const files = roots.flatMap(walk).filter((file) => /\.(ts|tsx|js|jsx|sql|md)$/.test(file) && !file.endsWith(".test.ts"));
const violations = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  for (const [label, pattern] of patterns) if (pattern.test(src)) violations.push(`${label}: ${file}`);
}
console.log(`Runtime placeholder scan: ${files.length} files scanned.`);
for (const violation of violations) console.log(`FAIL ${violation}`);
console.log(`Summary: ${violations.length} blocker(s).`);
process.exitCode = violations.length ? 1 : 0;
