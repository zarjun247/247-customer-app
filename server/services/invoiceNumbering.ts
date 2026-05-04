import { and, desc, eq, like } from "drizzle-orm";

export type InvoiceDocumentType = "sale_invoice" | "credit_note" | "return_note";

function pad(n: number, width = 4) { return String(n).padStart(width, "0"); }

export function formatInvoiceNumber(input: { prefix: string; sequence: number }) {
  return `${input.prefix}-${pad(input.sequence)}`;
}

function fyFrom(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  return m >= 4 ? `${y}-${String(y + 1).slice(-2)}` : `${y - 1}-${String(y).slice(-2)}`;
}

function prefixFor(storeId: string, docType: InvoiceDocumentType, date = new Date()) {
  const d = `${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,"0")}${String(date.getUTCDate()).padStart(2,"0")}`;
  const typ = docType === "sale_invoice" ? "INV" : docType === "credit_note" ? "CRN" : "RTN";
  return `${typ}-S${storeId}-${fyFrom(date)}-${d}`;
}

export async function getNextInvoiceSequence(db: any, storeId: string, docType: InvoiceDocumentType) {
  const { sales, saleReturns } = await import("../../drizzle/schema");
  const prefix = prefixFor(storeId, docType);
  if (docType === "sale_invoice") {
    const [last] = await db.select({ billNo: sales.billNo }).from(sales).where(and(eq(sales.storeId, storeId), like(sales.billNo, `${prefix}%`))).orderBy(desc(sales.billNo)).limit(1);
    return { prefix, sequence: last ? Number((last.billNo ?? "").split("-").pop() ?? 0) + 1 : 1 };
  }
  const [last] = await db.select({ returnNo: saleReturns.returnNo }).from(saleReturns).where(and(eq(saleReturns.storeId, storeId), like(saleReturns.returnNo, `${prefix}%`))).orderBy(desc(saleReturns.returnNo)).limit(1);
  return { prefix, sequence: last ? Number((last.returnNo ?? "").split("-").pop() ?? 0) + 1 : 1 };
}

export async function generateInvoiceNumber(db: any, storeId: string) {
  const next = await getNextInvoiceSequence(db, storeId, "sale_invoice");
  return formatInvoiceNumber(next);
}
export async function generateCreditNoteNumber(db: any, storeId: string) { const next = await getNextInvoiceSequence(db, storeId, "credit_note"); return formatInvoiceNumber(next); }
export async function generateReturnNoteNumber(db: any, storeId: string) { const next = await getNextInvoiceSequence(db, storeId, "return_note"); return formatInvoiceNumber(next); }

export async function assertInvoiceNumberUnique(db: any, value: string) {
  const { sales, saleReturns } = await import("../../drizzle/schema");
  const [s] = await db.select({ id: sales.id }).from(sales).where(eq(sales.billNo, value)).limit(1);
  const [r] = await db.select({ id: saleReturns.id }).from(saleReturns).where(eq(saleReturns.returnNo, value)).limit(1);
  if (s || r) throw new Error(`Duplicate invoice/return number: ${value}`);
}

export async function reserveInvoiceNumber(db: any, storeId: string, docType: InvoiceDocumentType) {
  const value = docType === "sale_invoice" ? await generateInvoiceNumber(db, storeId) : docType === "credit_note" ? await generateCreditNoteNumber(db, storeId) : await generateReturnNoteNumber(db, storeId);
  await assertInvoiceNumberUnique(db, value);
  return value;
}

export async function getInvoiceNumberForSale(db: any, saleId: string) {
  const { sales } = await import("../../drizzle/schema");
  const [sale] = await db.select({ billNo: sales.billNo }).from(sales).where(eq(sales.id, saleId)).limit(1);
  return sale?.billNo ?? null;
}
