import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const routersWithNoLocalAuditHelpers = [
  'server/routers/inventoryRouter.ts',
  'server/routers/prescriptionGovRouter.ts',
  'server/routers/ocrIngestionRouter.ts',
  'server/routers/masterDataRouter.ts',
  'server/routers/masterDataPart3Router.ts',
];

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

function walkFiles(dir, exts = ['.ts', '.tsx', '.js', '.mjs']) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) files.push(...walkFiles(full, exts));
    else if (stat.isFile() && exts.includes(path.extname(name))) files.push(full);
  }
  return files;
}

function grepFiles(paths, regex, globExclude = []) {
  const matches = [];
  for (const p of paths) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      for (const f of walkFiles(p)) {
        const normF = f.split(path.sep).join('/');
        if (globExclude.some(ex => {
          const normEx = ex.replace(/^!/, '').split(path.sep).join('/');
          return normF.includes(normEx);
        })) continue;
        const txt = readFileSafe(f);
        if (regex.test(txt)) matches.push({ file: f, text: txt.match(regex)[0] });
      }
    } else {
      const txt = readFileSafe(p);
      if (regex.test(txt)) matches.push({ file: p, text: txt.match(regex)[0] });
    }
  }
  return matches;
}

describe('audit unification static guard', () => {
  it('blocks direct db.insert(auditLogs) outside central audit service/db adapters', () => {
    const matches = grepFiles(['server'], /db\.insert\(auditLogs/,
      ['server/services/audit.ts', 'server/db.ts', 'server/audit-unification.guard.test.ts']);
    expect(matches.length).toBe(0);
  });

  it('blocks router-local audit helper wrappers for completed routers only', () => {
    const helperPattern = /async function writeAudit|async function writeAuditLog|async function recordAuditEvent|async function createAuditLog|async function logAudit/;
    const matches = grepFiles(routersWithNoLocalAuditHelpers, helperPattern);
    expect(matches.length).toBe(0);
  });

  it('blocks entityId: 0 in production router audit contexts', () => {
    const matches = grepFiles(['server/routers'], /entityId:\s*0/,
      ['**/*.test.ts']);
    expect(matches.length).toBe(0);
  });
});
