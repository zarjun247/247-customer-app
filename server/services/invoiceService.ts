/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import { eq, and as _and, desc } from "drizzle-orm";
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
export function computeGstBreakup(
  taxableValue: number,
  gstRate: number,
  interstate = false
) {
  const totalGst = r2((taxableValue * gstRate) / 100);
  const igst = interstate ? totalGst : 0;
  const cgst = interstate ? 0 : r2(totalGst / 2);
  const sgst = interstate ? 0 : r2(totalGst - cgst);
  return {
    taxableValue: r2(taxableValue),
    gstRate,
    cgst,
    sgst,
    igst,
    totalGst: r2(cgst + sgst + igst),
  };
}
export function buildInvoiceLine(line: InvoiceLineInput) {
  const gross = line.quantity * line.sellingPrice;
  const discount = line.discountAmount ?? 0;
  const taxableValue = Math.max(0, gross - discount);
  const gst = computeGstBreakup(taxableValue, line.gstRate ?? 0, false);
  return {
    ...line,
    discountAmount: r2(discount),
    taxableValue: gst.taxableValue,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: gst.igst,
    totalGst: gst.totalGst,
    lineTotal: r2(gst.taxableValue + gst.totalGst),
  };
}
export function computeInvoiceTotals(
  lines: ReturnType<typeof buildInvoiceLine>[]
) {
  const t = lines.reduce(
    (a, l) => ({
      taxable: a.taxable + l.taxableValue,
      gst: a.gst + l.totalGst,
      discount: a.discount + (l.discountAmount ?? 0),
      net: a.net + l.lineTotal,
    }),
    { taxable: 0, gst: 0, discount: 0, net: 0 }
  );
  return {
    taxableAmount: r2(t.taxable),
    totalGst: r2(t.gst),
    totalDiscount: r2(t.discount),
    netTotal: r2(t.net),
  };
}
export function validateInvoiceCompleteness(payload: any) {
  const missing: string[] = [];
  if (!payload?.header?.invoiceNumber) missing.push("invoiceNumber");
  if (!payload?.header?.storeName) missing.push("storeName");
  if (!payload?.header?.storeAddress) missing.push("storeAddress");
  if (!payload?.header?.storeGstin) missing.push("storeGstin");
  if (!payload?.header?.storeDrugLicense) missing.push("storeDrugLicense");
  for (const [i, line] of (payload?.lines ?? []).entries()) {
    if (!line.productName) missing.push(`lines[${i}].productName`);
    if (!line.hsnCode) missing.push(`lines[${i}].hsnCode`);
    if (line.gstRate === undefined || line.gstRate === null)
      missing.push(`lines[${i}].gstRate`);
    if (
      line.cgst === undefined ||
      line.sgst === undefined ||
      line.igst === undefined ||
      line.totalGst === undefined
    )
      missing.push(`lines[${i}].taxBreakup`);
  }
  return {
    complete: missing.length === 0,
    missingFields: missing,
    status: missing.length === 0 ? "complete" : "incomplete",
  };
}
export function buildInvoiceForSale(input: any) {
  const lines = (input.lines ?? []).map(buildInvoiceLine);
  const totals = computeInvoiceTotals(lines);
  return {
    header: input.header,
    lines,
    totals,
    completeness: validateInvoiceCompleteness({ header: input.header, lines }),
  };
}
export function buildInvoiceDocumentPayload(input: any) {
  return buildInvoiceForSale(input);
}
export function buildInsurerReadyInvoiceSummary(input: any) {
  const base = buildInvoiceForSale(input);
  return {
    invoiceNumber: base.header?.invoiceNumber,
    totals: base.totals,
    completeness: base.completeness,
    insurerSubmissionReady: base.completeness.complete,
  };
}
export function buildCreditNoteForReturn(input: {
  originalInvoiceTotal: number;
  refundAmount: number;
  noteNumber: string;
}) {
  if (input.refundAmount > input.originalInvoiceTotal)
    throw new Error("Credit note exceeds original invoice total");
  return {
    noteNumber: input.noteNumber,
    refundAmount: r2(input.refundAmount),
    originalInvoiceTotal: r2(input.originalInvoiceTotal),
    status: "foundation_only" as const,
  };
}
export async function getInvoiceBySale(db: any, saleId: string) {
  const { sales, saleLines, products } = await import("../../drizzle/schema");
  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  if (!sale)
    return { found: false, status: "unavailable", reason: "sale_not_found" };
  const lines = await db
    .select({ line: saleLines, productName: products.name })
    .from(saleLines)
    .leftJoin(products, eq(saleLines.productId, products.id))
    .where(eq(saleLines.saleId, saleId));
  const normalized = lines.map((x: any) =>
    buildInvoiceLine({
      productName: x.productName ?? "",
      batchNo: x.line.batchNo,
      expiryDate: x.line.expiryDate,
      quantity: Number(x.line.qty ?? 0),
      mrp: Number(x.line.mrp ?? 0),
      sellingPrice: Number(x.line.saleRate ?? 0),
      discountAmount: Number(x.line.discountAmount ?? 0),
      gstRate: Number(x.line.gstRate ?? 0),
      hsnCode: x.line.hsnCode,
    })
  );
  const header = {
    invoiceNumber: sale.billNo,
    storeName: `STORE-${sale.storeId}`,
    storeAddress: null,
    storeGstin: null,
    storeDrugLicense: null,
  };
  const composed = { header, lines: normalized };
  return {
    found: true,
    saleId,
    invoice: buildInvoiceForSale(composed),
    status: "incomplete_data_model",
  };
}
export async function getCustomerInvoiceSummary(db: any, userId: number) {
  const { sales } = await import("../../drizzle/schema");
  const rows = await db
    .select()
    .from(sales)
    .where(eq(sales.createdBy, String(userId)))
    .orderBy(desc(sales.createdAt))
    .limit(50);
  return {
    status: "partial",
    scope: "created_by_only",
    rows: rows.map((s: any) => ({
      saleId: s.id,
      invoiceNumber: s.billNo,
      total: Number(s.total ?? 0),
      paymentMode: s.paymentMode,
      saleStatus: s.status,
      completeness: validateInvoiceCompleteness({
        header: { invoiceNumber: s.billNo },
        lines: [],
      }),
    })),
    limitations: [
      "customer linkage is currently by createdBy; direct customerId ownership mapping is pending",
    ],
  };
}
