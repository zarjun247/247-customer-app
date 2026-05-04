import { assertProductMasterCompleteness, type ProductMasterInput } from './productNormalization';

export function getProductMasterCompleteness(input: ProductMasterInput & { requiresPrescription?: boolean | null; barcodeRequired?: boolean | null }) {
  const base = assertProductMasterCompleteness(input);
  const issues = [...base.missing];
  const regulated = input.requiresPrescription || input.schedule === 'H' || input.schedule === 'H1' || input.schedule === 'X';
  if (regulated && !input.schedule) issues.push('regulatedScheduleUnknown');
  if (input.barcodeRequired && !input.barcode) issues.push('barcode');
  return { ...base, regulated, issues, reviewRequired: issues.length > 0 };
}

export const validateProductForSale = (input: ProductMasterInput & { requiresPrescription?: boolean | null }) => getProductMasterCompleteness(input);
export const validateProductForInwarding = (input: ProductMasterInput) => ({ ...getProductMasterCompleteness(input), allowDraft: true });
export const validateProductForInvoice = (input: ProductMasterInput) => getProductMasterCompleteness(input);
export function validateProductForRegulatedSale(input: ProductMasterInput & { requiresPrescription?: boolean | null }) {
  const c = getProductMasterCompleteness(input);
  if (c.regulated && !input.schedule) return { ...c, allowed: false, reason: 'schedule_unknown_fail_closed' };
  return { ...c, allowed: true };
}
export const validateProductForBarcodeLabel = (input: ProductMasterInput) => ({ ...getProductMasterCompleteness(input), labelReady: Boolean(input.barcode) });

export function getProductMasterExceptionRows(rows: Array<ProductMasterInput & { id?: number }>) {
  return {
    rows: rows.map((r) => ({ id: r.id, ...getProductMasterCompleteness(r) })).filter((r) => r.reviewRequired),
    totals: { total: rows.length, incomplete: rows.filter((r) => getProductMasterCompleteness(r).reviewRequired).length },
    csvData: rows.map((r) => ({ id: r.id ?? '', name: r.name ?? '', missing: getProductMasterCompleteness(r).issues.join('|') })),
  };
}
