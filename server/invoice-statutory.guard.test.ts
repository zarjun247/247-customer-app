import { describe, it, expect } from 'vitest';
import { buildInvoiceLine, buildInvoiceForSale } from './services/invoiceService';

describe('invoice statutory guards', () => {
  it('computes line gst and totals', () => {
    const line = buildInvoiceLine({ productName:'A', quantity:2, mrp:100, sellingPrice:90, discountAmount:10, gstRate:12, hsnCode:'3004' });
    expect(line.totalGst).toBeGreaterThan(0);
  });
  it('detects missing hsn/gstin/license', () => {
    const invoice = buildInvoiceForSale({ header: { invoiceNumber:'INV-1' }, lines: [{ productName:'A', quantity:1, mrp:10, sellingPrice:10 }] });
    expect(invoice.completeness.complete).toBe(false);
    expect(invoice.completeness.missingFields.join(',')).toContain('hsnCode');
  });
});
