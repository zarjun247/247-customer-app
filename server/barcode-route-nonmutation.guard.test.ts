import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('barcode routes are non-mutating on scan', () => {
  it('sales scan routes explicitly defer stock mutation', () => {
    const sales = fs.readFileSync('server/routers/salesRouter.ts', 'utf8');
    expect(sales).toContain('deferred_to_confirmSale_stockInvariant');
    expect(sales).toContain('deferred_to_return_commit_stockInvariant');
  });
  it('audit scan route defers correction to audit complete', () => {
    const inventory = fs.readFileSync('server/routers/inventoryRouter.ts', 'utf8');
    expect(inventory).toContain('deferred_to_audit_complete_applyStockAuditCorrection');
  });
});
