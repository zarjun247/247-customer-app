import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(p){ if (!fs.existsSync(p)) throw new Error(`Watched file missing: ${p}`); return fs.readFileSync(p,'utf8'); }

describe('stock invariant guard', () => {
  it('blocks fake qtyBefore/qtyAfter placeholders in stock mutation routers', () => {
    const targets = ['server/routers/purchaseRouter.ts','server/routers/salesRouter.ts','server/routers/inventoryRouter.ts','server/services/stockInvariant.ts'];
    const pattern = /qtyBefore:\s*0|qtyAfter:\s*0/;
    let found = false;
    for (const t of targets) { if (pattern.test(read(t))) { found = true; break; } }
    expect(found).toBe(false);
  });

  it('blocks legacy movement helper usage in inventory router', () => {
    const found = /writeMovement\(/.test(read('server/routers/inventoryRouter.ts'));
    expect(found).toBe(false);
  });

  it('blocks direct stock movement inserts in migrated purchase/inventory flows', () => {
    const pattern = /insert\(stockMovements\)/;
    const found = pattern.test(read('server/routers/purchaseRouter.ts')) || pattern.test(read('server/routers/inventoryRouter.ts'));
    expect(found).toBe(false);
  });

  it('blocks direct qtyOnHand writes in inventory corrections path', () => {
    const pattern = /audit\.complete[\s\S]*update\(batchLedger\)\.set\(\{\s*qtyOnHand/;
    const found = pattern.test(read('server/routers/inventoryRouter.ts'));
    expect(found).toBe(false);
  });

  it('blocks legacy direct batch qty mutations in purchase return commit', () => {
    const pattern = /commitReturn[\s\S]*batchLedger\)\.set\(\{\s*qtyOnHand/;
    const found = pattern.test(read('server/routers/purchaseRouter.ts'));
    expect(found).toBe(false);
  });
});
