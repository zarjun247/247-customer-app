#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());
const args = new Set(process.argv.slice(2));
const rootArgIndex = process.argv.indexOf('--root');
const scanRoot = rootArgIndex >= 0 ? path.resolve(process.argv[rootArgIndex + 1]) : repoRoot;
const mode = [...args].find((arg) => ['all', 'static', 'migration', 'secrets'].includes(arg)) ?? 'all';

const conflictStart = '<'.repeat(7);
const conflictMid = '='.repeat(7);
const conflictEnd = '>'.repeat(7);
const textExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.sql', '.env', '.txt', '.log']);
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.cache', '.vite']);
const warnings = [];

function rel(file) {
  return path.relative(scanRoot, file).split(path.sep).join('/');
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && textExt.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function lineNumber(src, index) {
  return src.slice(0, index).split('\n').length;
}

function violation(file, label, details) {
  return `${rel(file)}: ${label}${details ? ` (${details})` : ''}`;
}

function isTestOrGovernanceFile(file) {
  const name = rel(file);
  return (
    name.endsWith('.test.ts') ||
    name.startsWith('scripts/') ||
    name === 'CI_SECURITY_STATUS.md' ||
    name === 'BRANCH_PROTECTION_ENFORCEMENT_STATUS.md' ||
    name === 'MERGE_GOVERNANCE_STATUS.md' ||
    name === 'PRODUCTION_CI_STATUS.md' ||
    name === 'RELEASE_CHECKPOINT.md' ||
    name === 'SECURITY_LOCKDOWN_STATUS.md' ||
    name === 'PRODUCTION_READINESS_STATUS.md'
  );
}

function scanConflictMarkers(files) {
  const blocked = [conflictStart, conflictMid, conflictEnd];
  const findings = [];
  for (const file of files) {
    const name = rel(file);
    if (name === 'pnpm-lock.yaml') continue;
    const src = read(file);
    for (const marker of blocked) {
      const regex = new RegExp(`^${marker}(?: |$)`, 'gm');
      const match = regex.exec(src);
      if (match) findings.push(violation(file, 'merge conflict marker', `line ${lineNumber(src, match.index)}`));
    }
  }
  return findings;
}

function scanFakeSuccess(files) {
  const findings = [];
  const runtimeFiles = files.filter((file) => /^(server|client)\//.test(rel(file)) && !isTestOrGovernanceFile(file));
  const genericPatterns = [
    ['STUB', /\bSTUB\b/],
    ['fake success', /fake\s+success/i],
    ['mock success', /mock\s+success/i],
    ['demo success', /demo\s+success/i],
    ['provider unconfigured but success', /provider\s+unconfigured\s+but\s+success/i],
  ];
  const providerSuccess = /provider[_\s-]*unconfigured[^\n]*(?:verified\s*:\s*true|ok\s*:\s*true|success\s*:\s*true|status\s*:\s*['\"](?:success|succeeded|sent|printed|synced|verified|captured|refunded)['\"])/i;
  for (const file of runtimeFiles) {
    const src = read(file);
    for (const [label, regex] of genericPatterns) {
      const match = regex.exec(src);
      if (match) findings.push(violation(file, `fake/provider success marker: ${label}`, `line ${lineNumber(src, match.index)}`));
    }
    const providerMatch = providerSuccess.exec(src);
    if (providerMatch) findings.push(violation(file, 'provider-unconfigured success claim', `line ${lineNumber(src, providerMatch.index)}`));
  }
  return findings;
}

function scanH1Casts(files) {
  const findings = [];
  const h1Files = files.filter((file) => /^(server|client)\//.test(rel(file)) && !isTestOrGovernanceFile(file));
  const patterns = [
    ['Number(line.id)', /Number\(\s*line\.id\s*\)/],
    ['Number(saleId)', /Number\(\s*saleId\s*\)/],
    ['entityId: 0', /entityId\s*:\s*0\b/],
  ];
  for (const file of h1Files) {
    const src = read(file);
    const isStatutoryAuditCommercial = /h1|statutory|audit|commercial|sale|invoice/i.test(rel(file)) || /h1|statutory|audit|commercial/i.test(src);
    if (!isStatutoryAuditCommercial) continue;
    for (const [label, regex] of patterns) {
      const match = regex.exec(src);
      if (match) findings.push(violation(file, `unsafe H1 numeric/audit fallback: ${label}`, `line ${lineNumber(src, match.index)}`));
    }
  }
  return findings;
}

function scanAdminRouteBypass(files) {
  const findings = [];
  const adminRoutesConfig = 'client/src/routes/adminRoutes.tsx';
  for (const file of files) {
    const name = rel(file);
    if (!name.startsWith('client/src/') || isTestOrGovernanceFile(file) || name === adminRoutesConfig) continue;
    const src = read(file);
    const routeBypass = /<Route\s+[^>]*path=\{?["'`]\/admin(?:\/|["'`])/g;
    let match;
    while ((match = routeBypass.exec(src))) {
      findings.push(violation(file, 'direct /admin <Route> outside centralized AdminRoutes config', `line ${lineNumber(src, match.index)}`));
    }
  }
  return findings;
}

function scanStockMutation(files) {
  const findings = [];
  const allowed = new Set([
    'server/services/stockLedger.ts',
    'server/services/stockReservation.ts',
    'server/services/stockMovement.ts',
    'server/services/stockInvariant.ts',
    'server/routers/inventoryRouter.ts',
    'server/pharmacy.ts',
    'server/testUtils/commercialFixtures.ts',
  ]);
  const patterns = [
    ['qtyOnHand assignment', /\bqtyOnHand\s*(?:[+\-*/]?=|:\s*[^,}\n]*(?:\+|\-))/],
    ['stockQty assignment', /\bstockQty\s*(?:[+\-*/]?=|:\s*[^,}\n]*(?:\+|\-))/],
    ['batchLedger direct update', /update\(\s*batchLedger\s*\)\s*\.set\s*\(\s*\{[\s\S]{0,240}\bqtyOnHand\b/],
  ];
  for (const file of files) {
    const name = rel(file);
    if (!name.startsWith('server/') || isTestOrGovernanceFile(file) || allowed.has(name)) continue;
    const src = read(file);
    for (const [label, regex] of patterns) {
      const match = regex.exec(src);
      if (match) findings.push(violation(file, `direct stock mutation outside invariant gateway: ${label}`, `line ${lineNumber(src, match.index)}`));
    }
  }
  return findings;
}

function scanBroadBodyLimit(files) {
  for (const file of files) {
    const name = rel(file);
    if (!name.startsWith('server/') || isTestOrGovernanceFile(file)) continue;
    const src = read(file);
    if (/app\.use\(\s*express\.json\(\s*\{[\s\S]{0,120}limit\s*:\s*['"]50mb['"]/m.test(src)) {
      warnings.push(`${name}: global 50mb JSON body limit is present; keep route-level controls on the owning runtime branch.`);
    }
  }
  return [];
}

function scanSecrets(files) {
  const findings = [];
  const candidates = files.filter((file) => !rel(file).endsWith('pnpm-lock.yaml') && !rel(file).startsWith('node_modules/'));
  const patterns = [
    ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ['private key block', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/],
    ['high-entropy assigned secret', /\b(?:api[_-]?key|secret|token|password)\b\s*[:=]\s*['"](?!example|changeme|placeholder|test|demo|dummy|your-|\$\{)[A-Za-z0-9_./+=-]{24,}['"]/i],
  ];
  for (const file of candidates) {
    if (isTestOrGovernanceFile(file)) continue;
    const src = read(file);
    for (const [label, regex] of patterns) {
      const match = regex.exec(src);
      if (match) findings.push(violation(file, `possible committed secret/PII: ${label}`, `line ${lineNumber(src, match.index)}`));
    }
  }
  return findings;
}

function scanMigrations() {
  const drizzleDir = path.join(scanRoot, 'drizzle');
  if (!fs.existsSync(drizzleDir)) return [];
  const files = fs.readdirSync(drizzleDir).filter((name) => name.endsWith('.sql'));
  const numbered = files
    .map((name) => ({ name, number: /^(\d{4})_/.exec(name)?.[1] ?? null }))
    .filter((entry) => entry.number);
  const findings = [];
  const seen = new Map();
  for (const entry of numbered) {
    if (seen.has(entry.number)) findings.push(`drizzle/${entry.name}: duplicate migration number ${entry.number} also used by drizzle/${seen.get(entry.number)}`);
    else seen.set(entry.number, entry.name);
  }
  const sorted = [...numbered].sort((a, b) => a.number.localeCompare(b.number) || a.name.localeCompare(b.name));
  const actual = numbered.map((entry) => entry.name).join('\n');
  const expected = sorted.map((entry) => entry.name).join('\n');
  if (actual !== expected) warnings.push('drizzle/*.sql directory enumeration is not numerically ordered; duplicate detection is enforced, true MySQL migration execution remains deferred to a DB-backed lifecycle branch.');
  const schema = path.join(scanRoot, 'drizzle/schema.ts');
  if (!fs.existsSync(schema)) warnings.push('drizzle/schema.ts not found; schema-reference validation could not run.');
  return findings;
}

const allFiles = walk(scanRoot);
const findings = [];
if (mode === 'all' || mode === 'static') {
  findings.push(...scanConflictMarkers(allFiles));
  findings.push(...scanFakeSuccess(allFiles));
  findings.push(...scanH1Casts(allFiles));
  findings.push(...scanAdminRouteBypass(allFiles));
  findings.push(...scanStockMutation(allFiles));
  findings.push(...scanBroadBodyLimit(allFiles));
}
if (mode === 'all' || mode === 'secrets') findings.push(...scanSecrets(allFiles));
if (mode === 'all' || mode === 'migration') findings.push(...scanMigrations());

for (const warning of warnings) console.warn(`WARN ${warning}`);
if (findings.length) {
  console.error('CI governance guard violations:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log(`CI governance guard scan passed (${mode}) for ${path.relative(repoRoot, scanRoot) || '.'}`);
