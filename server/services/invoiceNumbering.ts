import { and, eq } from "drizzle-orm";

export type InvoiceDocumentType = "sale_invoice" | "credit_note" | "return_note";
const pad = (n: number, width = 4) => String(n).padStart(width, "0");

export function formatInvoiceNumber(input: { prefix: string; sequence: number }) { return `${input.prefix}-${pad(input.sequence)}`; }
function fyFrom(date = new Date()) { const y = date.getUTCFullYear(); const m = date.getUTCMonth() + 1; return m >= 4 ? `${y}-${String(y + 1).slice(-2)}` : `${y - 1}-${String(y).slice(-2)}`; }
function prefixFor(storeId: string, docType: InvoiceDocumentType, date = new Date()) { const t = docType === "sale_invoice" ? "INV" : docType === "credit_note" ? "CRN" : "RTN"; return `${t}-S${storeId}-${fyFrom(date)}`; }

export async function getNextInvoiceSequence(db: any, storeId: string, docType: InvoiceDocumentType) {
  const { invoiceSequences } = await import("../../drizzle/schema");
  const financialYear = fyFrom();
  const prefix = prefixFor(storeId, docType);
  const [row] = await db.select().from(invoiceSequences).where(and(eq(invoiceSequences.storeId, storeId), eq(invoiceSequences.financialYear, financialYear), eq(invoiceSequences.documentType, docType as any))).limit(1);
  return { financialYear, prefix, sequence: Number(row?.lastNumber ?? 0) + 1 };
}

export async function assertInvoiceNumberUnique(db: any, value: string) {
  const { sales, saleReturns } = await import("../../drizzle/schema");
  const [s] = await db.select({ id: sales.id }).from(sales).where(eq(sales.billNo, value)).limit(1);
  const [r] = await db.select({ id: saleReturns.id }).from(saleReturns).where(eq(saleReturns.returnNo, value)).limit(1);
  if (s || r) throw new Error(`Duplicate invoice/return number: ${value}`);
}

export async function reserveInvoiceNumber(db: any, storeId: string, docType: InvoiceDocumentType) {
  const { invoiceSequences } = await import("../../drizzle/schema");
  const next = await getNextInvoiceSequence(db, storeId, docType);
  const value = formatInvoiceNumber({ prefix: next.prefix, sequence: next.sequence });
  await assertInvoiceNumberUnique(db, value);
  const [row] = await db.select().from(invoiceSequences).where(and(eq(invoiceSequences.storeId, storeId), eq(invoiceSequences.financialYear, next.financialYear), eq(invoiceSequences.documentType, docType as any))).limit(1);
  if (row) {
    await db.update(invoiceSequences).set({ lastNumber: next.sequence, prefix: next.prefix }).where(eq(invoiceSequences.id, row.id));
  } else {
    await db.insert(invoiceSequences).values({ storeId, financialYear: next.financialYear, documentType: docType as any, prefix: next.prefix, lastNumber: next.sequence });
  }
  return value;
}

export async function generateInvoiceNumber(db: any, storeId: string) { return reserveInvoiceNumber(db, storeId, "sale_invoice"); }
export async function generateCreditNoteNumber(db: any, storeId: string) { return reserveInvoiceNumber(db, storeId, "credit_note"); }
export async function generateReturnNoteNumber(db: any, storeId: string) { return reserveInvoiceNumber(db, storeId, "return_note"); }
export async function getInvoiceNumberForSale(db: any, saleId: string) { const { sales } = await import("../../drizzle/schema"); const [sale] = await db.select({ billNo: sales.billNo }).from(sales).where(eq(sales.id, saleId)).limit(1); return sale?.billNo ?? null; }
export function buildDraftBillNumber(storeId: string, date = new Date()) { return `DRF-S${storeId}-${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,'0')}${String(date.getUTCDate()).padStart(2,'0')}-${String(date.getUTCHours()).padStart(2,'0')}${String(date.getUTCMinutes()).padStart(2,'0')}${String(date.getUTCSeconds()).padStart(2,'0')}`; }
