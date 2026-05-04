import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const purchaseRouter = readFileSync('server/routers/purchaseRouter.ts', 'utf8');
const salesRouter = readFileSync('server/routers/salesRouter.ts', 'utf8');
const paymentRouter = readFileSync('server/routers/paymentRouter.ts', 'utf8');
const inventoryRouter = readFileSync('server/routers/inventoryRouter.ts', 'utf8');
const reportsRouter = readFileSync('server/routers/reportsRouter.ts', 'utf8');

describe('commercial flow static guards', () => {
  it('purchase commit keeps stockInvariant + supplier payable + idempotency', () => {
    expect(purchaseRouter).toContain('commitInvoice');
    expect(purchaseRouter).toContain('increaseStockForPurchaseCommit');
    expect(purchaseRouter).toContain('recordSupplierPayable');
    expect(purchaseRouter).toContain('withIdempotency');
  });

  it('sale confirm keeps stockInvariant + idempotency + reservation checks', () => {
    expect(salesRouter).toContain('confirmSale');
    expect(salesRouter).toContain('decreaseStockForSaleConfirmation');
    expect(salesRouter).toContain('withIdempotency');
    expect(salesRouter).toContain('getCanonicalAvailability');
  });

  it('payment verify has duplicate/already-paid guard', () => {
    expect(paymentRouter).toContain('verify');
    expect(paymentRouter).toMatch(/already paid|already_paid|duplicate/i);
  });

  it('barcode scan route is lookup-only before sale confirm', () => {
    const scanBlock = salesRouter.slice(salesRouter.indexOf('scanBarcode'), salesRouter.indexOf('confirmSale'));
    expect(scanBlock).toContain('resolveBarcodeForSale');
    expect(scanBlock).not.toContain('stockMovements');
    expect(scanBlock).not.toContain('decreaseStockForSaleConfirmation');
  });

  it('stock audit completion has duplicate guard', () => {
    expect(inventoryRouter).toContain('auditSessionRouter');
    expect(inventoryRouter).toMatch(/already|duplicate|completed/i);
  });

  it('reports expose normalized shape markers', () => {
    expect(reportsRouter).toContain('rows');
    expect(reportsRouter).toContain('totals');
    expect(reportsRouter).toContain('csvData');
  });

  it('commercial routers do not directly insert stock movements', () => {
    expect(purchaseRouter).not.toContain('insert(stockMovements)');
    expect(salesRouter).not.toContain('insert(stockMovements)');
  });
});
