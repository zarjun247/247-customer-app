#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const SKIP = new Set(['.git','node_modules','dist','coverage']);
function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    try {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        let stat;
        try { stat = fs.statSync(full); } catch (e) { continue; }
        if (stat.isDirectory()) {
          if (!SKIP.has(name)) stack.push(full);
        } else {
          out.push(full);
        }
      }
    } catch (e) {
      // ignore permission issues
    }
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
  const migrations = files.map(f => path.basename(f)).filter(b => /^\d{4}_.*\.sql$/i.test(b));
  const byNum = new Map();
  for (const m of migrations) {
    const num = m.match(/^(\d{4})_/i)?.[1];
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
  // Only scan runtime code areas (not test/guard files or scripts to avoid self-flagging)
  const targets = ['server/routers', 'server/services', 'server/_core', 'drizzle', 'src', 'lib', 'docs'];
  const files = targets.flatMap(t => walk(t)).filter(Boolean);

  // Map patterns to severity
  const patterns = [
    { re: /provider[_-]?unconfigured/i, severity: 'WARN', label: 'provider_unconfigured' }, // treat as WARN by default; promote to BLOCKER on unsafe context
    { re: /\b(fake|stub|mock)[\s_-]*success\b/i, severity: 'BLOCKER', label: 'fake_stub_success' },
    { re: /\bFIXME\b/i, severity: 'WARN', label: 'FIXME' },
    { re: /\bTODO\b[:]?/i, severity: 'WARN', label: 'TODO' },
    { re: /demo[-_ ]?only/i, severity: 'WARN', label: 'demo_only' },
    { re: /temporary bypass/i, severity: 'BLOCKER', label: 'temporary_bypass' },
    { re: /placeholder[-_ ]?production/i, severity: 'WARN', label: 'placeholder_production' },
    { re: /TEMP[_-]?SKIP[_-]?SECURITY/i, severity: 'BLOCKER', label: 'temp_skip_security' }
  ];

  const hits = [];
  for (const f of files) {
    if (!f) continue;
    if (!/\.(ts|js|mjs|md|tsx|jsx)$/.test(f)) continue;
    // skip tests and guard files and scripts to avoid self-flagging
    if (/\.test\.|\.guard\.test\.|scripts[\\/]/i.test(f)) continue;
    try {
      const txt = fs.readFileSync(f,'utf8');
      for (const p of patterns) {
        const m = txt.match(p.re);
        if (m) {
          let severity = p.severity;
          // Promote provider_unconfigured matches to BLOCKER when used in unsafe success-like contexts
          if (p.label === 'provider_unconfigured') {
            const ctx = txt.slice(Math.max(0, m.index - 80), Math.min(txt.length, (m.index || 0) + 160));
            const unsafeSuccess = /provider[_-]?unconfigured[_-]?.*(export|generated|synced|complete|completed|sent|verified|imported)/i;
            if (unsafeSuccess.test(ctx) || /providerState\s*[:=]\s*["'`]provider[_-]?unconfigured/i.test(ctx)) severity = 'BLOCKER';
            // ignore enum/type definitions and provider contract files (these are legitimate)
            if (/server\/config\/providerContracts|server\/config\/providerContracts\.ts|providerContracts|connectors|jobQueue|providerContract|drizzle\/schema\.ts/i.test(f)) {
              severity = 'INFO';
            }
          }
          hits.push({ file: f, match: m[0], label: p.label, severity });
        }
      }
    } catch (e) {
      // ignore unreadable files
    }
  }
  return hits;
}

function checkCurrentTruthShas() {
  const out = [];
  const truthPath = 'CURRENT_MAIN_TRUTH.md';
  if (!fs.existsSync(truthPath)) return out;
  const txt = fs.readFileSync(truthPath, 'utf8');
  const shas = Array.from(new Set((txt.match(/\b[0-9a-f]{40}\b/ig) || [])));
  for (const sha of shas) {
    try {
      execSync(`git cat-file -t ${sha}`, { stdio: 'ignore' });
      out.push({ sha, exists: true });
    } catch (e) {
      out.push({ sha, exists: false });
    }
  }
  return out;
}

function findDuplicateGovernanceFiles() {
  const names = ['CURRENT_MAIN_TRUTH.md','OPEN_BLOCKERS.md','PRODUCTION_SCORECARD.md','ACTIVE_PR_MATRIX.md','VALIDATION_COMMANDS.md','CANONICAL_REPO_STATE_LOCK.md'];
  const hits = [];
  for (const n of names) {
    const found = walk('.').filter(p => p.endsWith(n));
    if (found.length > 1) hits.push({ file: n, locations: found });
  }
  return hits;
}


function main() {
  console.log('Running repo governance audit...');
  const stale = findStaleBranches();
  const migration = findMigrationConflicts();
  const placeholders = scanPlaceholders();
  const truthShas = checkCurrentTruthShas();
  const duplicateGov = findDuplicateGovernanceFiles();

  // Classify findings
  const report = {
    generatedAt: new Date().toISOString(),
    staleBranches: stale,
    migration,
    placeholders,
    truthShas,
    duplicateGovernanceFiles: duplicateGov
  };

  // Flatten placeholders by severity
  const blockers = placeholders.filter(p => p.severity === 'BLOCKER');
  const warns = placeholders.filter(p => p.severity === 'WARN');
  const infos = [];

  for (const s of truthShas) if (!s.exists) blockers.push({ file: 'CURRENT_MAIN_TRUTH.md', match: s.sha, label: 'stale_sha', severity: 'BLOCKER' });
  for (const d of duplicateGov) warns.push({ file: d.file, match: d.locations.join(', '), label: 'duplicate_governance_file', severity: 'WARN' });
  if (migration.conflicts && migration.conflicts.length) migration.conflicts.forEach(c => blockers.push({ file: 'drizzle', match: c.files.join(', '), label: 'migration_conflict', severity: 'BLOCKER' }));

  console.log(JSON.stringify({ report, summary: { blockers: blockers.length, warns: warns.length, infos: infos.length } }, null, 2));

  if (blockers.length > 0) {
    console.error('Governance audit FAILED: BLOCKERS detected. See report JSON for details.');
    process.exit(2);
  }

  if (warns.length > 0) {
    console.warn('Governance audit completed with WARNINGS. Review report JSON for details.');
    process.exit(0);
  }

  console.log('Governance audit passed (no blockers or warnings).');
  process.exit(0);
}

main();
