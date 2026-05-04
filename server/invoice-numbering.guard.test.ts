import { describe, it, expect } from 'vitest';
import { formatInvoiceNumber } from './services/invoiceNumbering';

describe('invoice numbering foundation', () => {
  it('formats sequence deterministically', () => {
    expect(formatInvoiceNumber({ prefix: 'INV-S1-2026-27-20260504', sequence: 1 })).toBe('INV-S1-2026-27-20260504-0001');
  });
});
