import { describe, it, expect } from 'vitest';
import { buildCreditNoteForReturn } from './services/invoiceService';

describe('credit note guards', () => {
  it('prevents over-refund credit notes', () => {
    expect(() => buildCreditNoteForReturn({ noteNumber:'CRN-1', originalInvoiceTotal:100, refundAmount:120 })).toThrow();
  });
});
