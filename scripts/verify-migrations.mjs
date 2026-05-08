#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const value = (name, fallback) => {
  const idx = args.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (idx === -1) return fallback;
  const hit = args[idx];
  return hit.includes("=") ? hit.split("=").slice(1).join("=") : (args[idx + 1] || fallback);
};
const dir = value("migrations-dir", "drizzle");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
const issues = [];
const warnings = [];
const numberOf = (file) => file.match(/^(\d{4})_/)?.[1] ?? null;
const numbered = files.map((file, order) => ({ file, order, num: numberOf(file) })).filter((x) => x.num);
const seen = new Map();
for (const item of numbered) {
  if (seen.has(item.num)) issues.push(`Duplicate migration number ${item.num}: ${seen.get(item.num)} and ${item.file}`);
  seen.set(item.num, item.file);
}
for (let i = 1; i < numbered.length; i++) {
  if (Number(numbered[i].num) < Number(numbered[i - 1].num)) issues.push(`Non-monotonic migration order: ${numbered[i - 1].file} before ${numbered[i].file}`);
}
for (const item of numbered) {
  if (!/^\d{4}_[a-z0-9][a-z0-9_]*\.sql$/.test(item.file)) warnings.push(`Non-standard migration name: ${item.file}`);
}
const destructive = [/\bdrop\s+table\b/i, /\balter\s+table\b[\s\S]{0,240}\bdrop\s+column\b/i, /\btruncate\s+table\b/i, /\bdelete\s+from\b(?![\s\S]{0,160}\bwhere\b)/i];
for (const file of files) {
  const full = path.join(dir, file);
  const sql = fs.readFileSync(full, "utf8");
  const documented = /@destructive-ok|destructive migration documented|rollback reviewed/i.test(sql);
  for (const pattern of destructive) {
    if (pattern.test(sql) && !documented) issues.push(`Destructive statement requires @destructive-ok documentation: ${file}`);
  }
  if (/drift|manual change|out of band schema/i.test(sql)) warnings.push(`Schema drift marker found for review: ${file}`);
}
const latest = numbered.length ? numbered[numbered.length - 1].num : "none";
console.log(`Migration verification for ${dir}`);
console.log(`Files: ${files.length}; numbered: ${numbered.length}; latest: ${latest}`);
for (const warning of warnings) console.log(`WARN ${warning}`);
for (const issue of issues) console.log(`FAIL ${issue}`);
if (!files.length) issues.push(`No SQL migrations found in ${dir}`);
console.log(`Summary: ${issues.length} blocking issue(s), ${warnings.length} warning(s).`);
process.exitCode = issues.length ? 1 : 0;
