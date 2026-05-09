import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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

function fileMatches(file, regex) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return regex.test(txt);
  } catch (e) {
    return false;
  }
}

describe('stock invariant guard', () => {
  it('blocks fake qtyBefore/qtyAfter placeholders in stock mutation routers', () => {
    const targets = [
      'server/routers/purchaseRouter.ts',
      'server/routers/salesRouter.ts',
      'server/routers/inventoryRouter.ts',
      'server/services/stockInvariant.ts',
    ];
    const pattern = /qtyBefore:\s*0|qtyAfter:\s*0/;
    const excludePattern = /movementType:\s*"stock_transfer"/;
    const matches = [];
    for (const t of targets) {
      if (!fs.existsSync(t)) continue;
      const txt = fs.readFileSync(t, 'utf8');
      if (pattern.test(txt) && !excludePattern.test(txt)) matches.push(t);
    }
    expect(matches.length).toBe(0);
  });

  it('blocks legacy movement helper usage in inventory router', () => {
    const f = 'server/routers/inventoryRouter.ts';
    const matches = fileMatches(f, /writeMovement\(/) ? [f] : [];
    expect(matches.length).toBe(0);
  });

  it('blocks direct stock movement inserts in migrated purchase/inventory flows', () => {
    const targets = ['server/routers/purchaseRouter.ts', 'server/routers/inventoryRouter.ts'];
    const matches = [];
    for (const t of targets) {
      if (!fs.existsSync(t)) continue;
      if (fileMatches(t, /insert\(stockMovements\)/)) matches.push(t);
    }
    expect(matches.length).toBe(0);
  });

  it('blocks direct qtyOnHand writes in inventory corrections path', () => {
    const f = 'server/routers/inventoryRouter.ts';
    const pattern = /audit\.complete[\s\S]*update\(batchLedger\)\.set\(\{\s*qtyOnHand/;
    expect(fileMatches(f, pattern)).toBe(false);
  });

  it('blocks legacy direct batch qty mutations in purchase return commit', () => {
    const f = 'server/routers/purchaseRouter.ts';
    const pattern = /commitReturn[\s\S]*batchLedger\)\.set\(\{\s*qtyOnHand/;
    expect(fileMatches(f, pattern)).toBe(false);
  });
});
