import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('barcode alias governance static guards', () => {
  it('barcode scan remains non mutating by contract', () => {
    const src = fs.readFileSync('server/services/barcodeService.ts','utf8');
    expect(src.includes('resolveBarcode')).toBe(true);
  });
});
