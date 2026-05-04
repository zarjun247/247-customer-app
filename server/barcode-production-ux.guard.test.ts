import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('barcode production ux guards', () => {
  it('scanner and label components exist', () => {
    expect(fs.existsSync('client/src/components/barcode/BarcodeScannerInput.tsx')).toBe(true);
    expect(fs.existsSync('client/src/components/barcode/BarcodeLabelPreview.tsx')).toBe(true);
  });
  it('route wiring exists for scan and label queue actions', () => {
    const sales = fs.readFileSync('server/routers/salesRouter.ts', 'utf8');
    const purchase = fs.readFileSync('server/routers/purchaseRouter.ts', 'utf8');
    const inventory = fs.readFileSync('server/routers/inventoryRouter.ts', 'utf8');
    expect(sales).toContain('scanBarcodeForSale');
    expect(sales).toContain('scanBarcodeForReturn');
    expect(purchase).toContain('ensureScannerReadyForBatch');
    expect(purchase).toContain('listLabelQueue');
    expect(purchase).toContain('reprintLabel');
    expect(inventory).toContain('scanBarcodeForAudit');
  });
});
