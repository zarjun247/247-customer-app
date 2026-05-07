import { describe, expect, it } from 'vitest';
import { creditNotes, saleReturns, sales } from '../drizzle/schema';
import {
  assertCreditNoteAmountAllowed,
  assertCreditNoteSplitPreserved,
  assertNoFakeRefundLedgerLink,
  createCreditNoteDraft,
  deriveCreditNoteSummaryFromReturn,
  issueCreditNote,
} from './services/creditNoteService';

function makeDb(state: { sale?: any; saleReturn?: any; notes?: any[] }) {
  const notes = state.notes ?? [];
  return {
    select: () => ({
      from: (table: any) => ({
        where: () => ({
          limit: async () => {
            if (table === sales) return state.sale ? [state.sale] : [];
            if (table === saleReturns) return state.saleReturn ? [state.saleReturn] : [];
            if (table === creditNotes) return notes;
            return [];
          },
        }),
      }),
    }),
    insert: (table: any) => ({
      values: async (row: any) => {
        if (table === creditNotes) notes.push(row);
      },
    }),
    update: (table: any) => ({
      set: (patch: any) => ({
        where: async () => {
          if (table === creditNotes) Object.assign(notes[0], patch);
        },
      }),
    }),
    notes,
  } as any;
}

describe('credit note lifecycle guards', () => {
  it('creates a draft credit note for a valid sale invoice and preserves GST split', async () => {
    const db = makeDb({ sale: { id: 'sale-1', billNo: 'INV-1', storeId: 'store-1', customerId: 'cust-1', total: '118.00', status: 'confirmed' } });
    const note = await createCreditNoteDraft({
      creditNoteNo: 'CN-1',
      saleId: 'sale-1',
      amountPaise: 11800,
      taxableAmountPaise: 10000,
      gstAmountPaise: 1800,
      reason: 'returned goods',
      lineSplits: [{ saleLineId: 'line-1', productId: 'prod-1', taxableAmountPaise: 10000, gstAmountPaise: 1800, grossAmountPaise: 11800, gstRate: 18 }],
    }, db);
    expect(note.status).toBe('draft');
    expect(note.saleId).toBe('sale-1');
    expect(note.originalInvoiceNo).toBe('INV-1');
    expect(note.lineSplitsJson).toContain('line-1');
  });

  it('blocks a credit note that exceeds the original refundable invoice amount', () => {
    expect(() => assertCreditNoteAmountAllowed({ invoiceAmountPaise: 10000, requestedAmountPaise: 10001 })).toThrow('Credit note exceeds refundable invoice amount');
  });

  it('blocks multiple issued credit notes from exceeding the original invoice amount', () => {
    expect(() => assertCreditNoteAmountAllowed({ invoiceAmountPaise: 20000, existingIssuedCreditNotePaise: 15000, requestedAmountPaise: 6000 })).toThrow('Credit note exceeds refundable invoice amount');
  });

  it('derives safe sale return linkage and GST summary without inventing missing line detail', () => {
    const summary = deriveCreditNoteSummaryFromReturn({ totalRefund: '59.00', gstReversal: '9.00' }, [{ saleLineId: 'line-2', productId: 'prod-2', refundAmount: '59.00', gstReversal: '9.00' }]);
    expect(summary).toMatchObject({ amountPaise: 5900, taxableAmountPaise: 5000, gstAmountPaise: 900 });
    expect(summary.lineSplits[0]).toMatchObject({ saleLineId: 'line-2', grossAmountPaise: 5900 });
  });

  it('allows optional real refund ids but rejects placeholder refund-ledger linkage', () => {
    expect(() => assertNoFakeRefundLedgerLink('rfnd_current_main_1')).not.toThrow();
    expect(() => assertNoFakeRefundLedgerLink(null)).not.toThrow();
    expect(() => assertNoFakeRefundLedgerLink('refund-ledger-pending-1')).toThrow('Do not fake refund ledger linkage');
  });

  it('blocks duplicate credit note numbers before issue', async () => {
    const db = makeDb({
      sale: { id: 'sale-1', billNo: 'INV-1', storeId: 'store-1', total: '118.00', status: 'confirmed' },
      notes: [{ id: 'existing', creditNoteNo: 'CN-DUP', status: 'issued', saleId: 'other-sale', originalInvoiceNo: 'INV-0', amountPaise: 100 }],
    });
    await expect(createCreditNoteDraft({ creditNoteNo: 'CN-DUP', saleId: 'sale-1', amountPaise: 1000, taxableAmountPaise: 900, gstAmountPaise: 100, reason: 'duplicate' }, db)).rejects.toThrow('Duplicate credit note number');
  });

  it('issues draft notes with optional current-main refund linkage and no refund ledger fabrication', async () => {
    const draft = { id: 'draft-1', creditNoteNo: 'CN-ISSUE', originalInvoiceNo: 'INV-1', saleId: 'sale-1', orderId: null, saleReturnId: null, refundId: 'rfnd_current_main_1', amountPaise: 11800, taxableAmountPaise: 10000, gstAmountPaise: 1800, reason: 'refund', status: 'draft', storeId: 'store-1', customerId: null };
    const db = makeDb({ sale: { id: 'sale-1', billNo: 'INV-1', storeId: 'store-1', total: '118.00', status: 'confirmed' }, notes: [draft] });
    const issued = await issueCreditNote({ creditNoteId: 'draft-1', issuedBy: 'manager-1' }, db);
    expect(issued.status).toBe('issued');
    expect(issued.refundId).toBe('rfnd_current_main_1');
  });

  it('rejects non-reconciling GST/taxable/gross splits', () => {
    expect(() => assertCreditNoteSplitPreserved({ amountPaise: 11800, taxableAmountPaise: 10000, gstAmountPaise: 1700 })).toThrow('taxable plus GST');
  });
});
