import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return '';
  }
}

function walkFiles(dir, exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) {
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

function grepFiles(paths, regex) {
  const matches = [];
  for (const p of paths) {
    const stat = fs.existsSync(p) ? fs.statSync(p) : null;
    if (stat && stat.isDirectory()) {
      for (const f of walkFiles(p)) {
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

describe('store isolation static guards', () => {
  it('has central rbac helpers', () => {
    const matches = grepFiles(['server/_core/rbac.ts'], /requireStoreAccess|requireStaffStore|assertCanCrossStore/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('high risk routers include active store access checks', () => {
    const targets = [
      'server/routers/inventoryRouter.ts',
      'server/routers/purchaseRouter.ts',
      'server/routers/salesRouter.ts',
      'server/routers/reportsRouter.ts',
      'server/routers/deliveryRouter.ts',
    ];
    const matches = grepFiles(targets, /requireStoreAccess\(/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('blocks default store fallback patterns', () => {
    const matches = grepFiles(['server/routers', 'server/_core'], /storeId\s*\?\?\s*1|storeId\s*\|\|\s*1|staffStoreId\s*\?\?\s*1|staffStoreId\s*\|\|\s*1/);
    expect(matches.length).toBe(0);
  });

  it('fails if requireStoreAccess import is unused in touched routers', () => {
    const files = ['server/routers/deliveryRouter.ts', 'server/routers/reportsRouter.ts'];
    const violations = [];
    for (const f of files) {
      const txt = readFileSafe(f);
      const hasImport = /import .*requireStoreAccess/.test(txt);
      const hasCall = /requireStoreAccess\(/.test(txt);
      if (hasImport && !hasCall) violations.push(f);
    }
    expect(violations.length).toBe(0);
  });
});
