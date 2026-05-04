import { describe, it, expect } from 'vitest';
import { formatInvoiceNumber, buildDraftBillNumber } from './services/invoiceNumbering';

describe('invoice numbering foundation', () => {
  it('formats sequence deterministically', () => {
    expect(formatInvoiceNumber({ prefix: 'INV-S1-2026-27', sequence: 1 })).toBe('INV-S1-2026-27-0001');
  });
  it('draft bill numbering does not issue statutory final number', () => {
    expect(buildDraftBillNumber('1')).toContain('DRF-S1-');
  });
});
