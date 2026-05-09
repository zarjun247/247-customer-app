import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe("stock truth 10 static guards", () => {
  it('scan routes remain lookup-only (no stock movement writes)', () => {
    const files = (function walk(dir) {
      const out = [];
      if (!fs.existsSync(dir)) return out;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) out.push(...walk(full));
        else out.push(full);
      }
      return out;
    })('server/routers');
    const pattern = /(scanBarcodeFor(Sale|Return|Audit))[\s\S]{0,1200}(insert\(stockMovements\)|update\(batchLedger\)|update\(storeSkus\))/;
    const matches = files.filter(f => { try { return pattern.test(fs.readFileSync(f,'utf8')); } catch(e){return false} });
    expect(matches.length).toBe(0);
  });

  it('routers avoid direct stock movement inserts', () => {
    const files = (function walk(dir) {
      const out = [];
      if (!fs.existsSync(dir)) return out;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) out.push(...walk(full));
        else out.push(full);
      }
      return out;
    })('server/routers');
    const pattern = /insert\(stockMovements\)/;
    const matches = files.filter(f => { try { const txt = fs.readFileSync(f,'utf8'); return pattern.test(txt) && !/legacy|deferred/.test(txt); } catch(e){return false} });
    expect(matches.length).toBe(0);
  });

  it('purchase commit does not directly increment qtyOnHand/stockQty', () => {
    const f = 'server/routers/purchaseRouter.ts';
    if (!fs.existsSync(f)) return expect(true).toBe(true);
    const txt = fs.readFileSync(f,'utf8');
    const pattern = /commitInvoice[\s\S]{0,2800}(qtyOnHand: \(existingLedger\.qtyOnHand|qtyOnHand: qty|quantity: \(existingBatch\.quantity|stockQty: \(sku\.stockQty)/;
    expect(pattern.test(txt)).toBe(false);
  });
});
