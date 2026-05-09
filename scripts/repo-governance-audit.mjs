#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function findStaleBranches(days = 30) {
  const out = [];
  const branches = execSync('git for-each-ref --format="%(refname:short) %(committerdate:iso8601)" refs/heads', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  for (const b of branches) {
    const [name, ...rest] = b.split(' ');
    const date = new Date(rest.join(' ')).getTime();
    if (isFinite(date) && date < cutoff) out.push({ branch: name, lastCommit: rest.join(' ') });
  }
  return out;
}

function findMigrationConflicts() {
  const files = walk('drizzle');
  const migrations = files.filter(f => /\\/\\d{4}_.+\\.sql$/.test(f) || /\\d{4}_.+\\.sql$/.test(path.basename(f))).map(f => path.basename(f));
  const byNum = new Map();
  for (const m of migrations) {
    const num = m.match(/^(\\d{4})_/i)?.[1];
    if (!num) continue;
    const arr = byNum.get(num) ?? [];
    arr.push(m);
    byNum.set(num, arr);
  }
  const conflicts = [];
  for (const [num, arr] of byNum.entries()) if (arr.length > 1) conflicts.push({ num, files: arr });
  return { migrations: migrations.length, conflicts };
}

function scanPlaceholders() {
  const files = walk('.');
  const patterns = [
    /TODO:\s*implement later/i,
    /FIXME_PRODUCTION/i,
    /TEMP_SKIP_SECURITY/i,
    /provider_unconfigured/i,
    /demo_only/i,
    /mock success/i,
    /stub success/i,
    /fake success/i,
    /temporary bypass/i,
    /placeholder-production-risk/i,
  ];
  const hits = [];
  for (const f of files) {
    if (!f.endsWith('.ts') && !f.endsWith('.js') && !f.endsWith('.mjs') && !f.endsWith('.md')) continue;
    try {
      const txt = fs.readFileSync(f,'utf8');
      for (const p of patterns) if (p.test(txt)) hits.push({ file: f, match: (txt.match(p)||[])[0] });
    } catch(e){}
  }
  return hits;
}

function main() {
  console.log('Running repo governance audit...');
  const stale = findStaleBranches();
  const migration = findMigrationConflicts();
  const placeholders = scanPlaceholders();

  const report = { generatedAt: new Date().toISOString(), staleBranches: stale, migration, placeholders };
  console.log(JSON.stringify(report, null, 2));

  const critical = placeholders.length > 0 || migration.conflicts.length > 0;
  if (critical) {
    console.error('Governance audit failed: critical issues found.');
    process.exit(1);
  }
  console.log('Governance audit passed (no critical issues).');
  process.exit(0);
}

main();
