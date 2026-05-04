export type InvoiceLineInput = {
  productName: string;
  batchNo?: string | null;
  expiryDate?: string | Date | null;
  quantity: number;
  mrp: number;
  sellingPrice: number;
  discountAmount?: number;
  gstRate?: number;
  hsnCode?: string | null;
  manufacturer?: string | null;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeGstBreakup(taxableValue: number, gstRate: number, interstate = false) {
  const totalGst = r2((taxableValue * gstRate) / 100);
  const igst = interstate ? totalGst : 0;
  const cgst = interstate ? 0 : r2(totalGst / 2);
  const sgst = interstate ? 0 : r2(totalGst - cgst);
  return { taxableValue: r2(taxableValue), gstRate, cgst, sgst, igst, totalGst: r2(cgst + sgst + igst) };
}

export function buildInvoiceLine(line: InvoiceLineInput) {
  const gross = line.quantity * line.sellingPrice;
  const discount = line.discountAmount ?? 0;
  const taxableValue = Math.max(0, gross - discount);
  const gst = computeGstBreakup(taxableValue, line.gstRate ?? 0, false);
  return { ...line, discountAmount: r2(discount), taxableValue: gst.taxableValue, cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst, totalGst: gst.totalGst, lineTotal: r2(gst.taxableValue + gst.totalGst) };
}

export function computeInvoiceTotals(lines: ReturnType<typeof buildInvoiceLine>[]) {
  const totals = lines.reduce((a, l) => ({ taxable: a.taxable + l.taxableValue, gst: a.gst + l.totalGst, discount: a.discount + (l.discountAmount ?? 0), net: a.net + l.lineTotal }), { taxable: 0, gst: 0, discount: 0, net: 0 });
  return { taxableAmount: r2(totals.taxable), totalGst: r2(totals.gst), totalDiscount: r2(totals.discount), netTotal: r2(totals.net) };
}

export function validateInvoiceCompleteness(payload: any) {
  const missing: string[] = [];
  if (!payload?.header?.invoiceNumber) missing.push("invoiceNumber");
  if (!payload?.header?.storeGstin) missing.push("storeGstin");
  if (!payload?.header?.storeDrugLicense) missing.push("storeDrugLicense");
  for (const [i, line] of (payload?.lines ?? []).entries()) {
    if (!line.hsnCode) missing.push(`lines[${i}].hsnCode`);
    if (line.gstRate === undefined || line.gstRate === null) missing.push(`lines[${i}].gstRate`);
  }
  return { complete: missing.length === 0, missingFields: missing };
}

export function buildInvoiceForSale(input: any) { const lines = (input.lines ?? []).map(buildInvoiceLine); const totals = computeInvoiceTotals(lines); return { header: input.header, lines, totals, completeness: validateInvoiceCompleteness({ header: input.header, lines }) }; }
export function buildInvoiceDocumentPayload(input: any) { return buildInvoiceForSale(input); }
export function buildInsurerReadyInvoiceSummary(input: any) { const base = buildInvoiceForSale(input); return { invoiceNumber: base.header?.invoiceNumber, totals: base.totals, completeness: base.completeness, insurerSubmissionReady: base.completeness.complete }; }
export function buildCreditNoteForReturn(input: { originalInvoiceTotal: number; refundAmount: number; noteNumber: string; }) { if (input.refundAmount > input.originalInvoiceTotal) throw new Error("Credit note exceeds original invoice total"); return { noteNumber: input.noteNumber, refundAmount: r2(input.refundAmount), originalInvoiceTotal: r2(input.originalInvoiceTotal) }; }
export async function getInvoiceBySale(_db: any, _saleId: string) { return null; }
export async function getCustomerInvoiceSummary(_db: any, _userId: number) { return []; }
