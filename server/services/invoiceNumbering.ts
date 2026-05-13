/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export type InvoiceDocumentType =
  | "sale_invoice"
  | "credit_note"
  | "return_note";
const pad = (n: number, width = 4) => String(n).padStart(width, "0");

export function formatInvoiceNumber(input: {
  prefix: string;
  sequence: number;
}) {
  return `${input.prefix}-${pad(input.sequence)}`;
}

export function getIndiaBusinessDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function financialYearFromIndiaBusinessDate(date = new Date()) {
  const { year, month } = getIndiaBusinessDateParts(date);
  return month >= 4
    ? `${year}-${String(year + 1).slice(-2)}`
    : `${year - 1}-${String(year).slice(-2)}`;
}

function prefixFor(
  storeId: string,
  docType: InvoiceDocumentType,
  date = new Date()
) {
  const t =
    docType === "sale_invoice"
      ? "INV"
      : docType === "credit_note"
        ? "CRN"
        : "RTN";
  return `${t}-S${storeId}-${financialYearFromIndiaBusinessDate(date)}`;
}

export async function getNextInvoiceSequence(
  db: any,
  storeId: string,
  docType: InvoiceDocumentType,
  date = new Date()
) {
  const { invoiceSequences } = await import("../../drizzle/schema");
  const financialYear = financialYearFromIndiaBusinessDate(date);
  const prefix = prefixFor(storeId, docType, date);
  const [row] = await db
    .select()
    .from(invoiceSequences)
    .where(
      and(
        eq(invoiceSequences.storeId, storeId),
        eq(invoiceSequences.financialYear, financialYear),
        eq(invoiceSequences.documentType, docType as any)
      )
    )
    .limit(1);
  return { financialYear, prefix, sequence: Number(row?.lastNumber ?? 0) + 1 };
}

export async function assertInvoiceNumberUnique(db: any, value: string) {
  const { sales, saleReturns } = await import("../../drizzle/schema");
  const [s] = await db
    .select({ id: sales.id })
    .from(sales)
    .where(eq(sales.billNo, value))
    .limit(1);
  const [r] = await db
    .select({ id: saleReturns.id })
    .from(saleReturns)
    .where(eq(saleReturns.returnNo, value))
    .limit(1);
  if (s || r) throw new Error(`Duplicate invoice/return number: ${value}`);
}

function isDuplicateKeyError(error: unknown) {
  const e = error as { code?: string; errno?: number; message?: string };
  return (
    e?.code === "ER_DUP_ENTRY" ||
    e?.errno === 1062 ||
    /duplicate/i.test(String(e?.message ?? ""))
  );
}

async function reserveInvoiceNumberOnce(
  db: any,
  storeId: string,
  docType: InvoiceDocumentType,
  date = new Date()
) {
  const { invoiceSequences } = await import("../../drizzle/schema");
  const financialYear = financialYearFromIndiaBusinessDate(date);
  const prefix = prefixFor(storeId, docType, date);
  const reserve = async (tx: any) => {
    if (typeof tx.execute !== "function") {
      const [row] = await tx
        .select()
        .from(invoiceSequences)
        .where(
          and(
            eq(invoiceSequences.storeId, storeId),
            eq(invoiceSequences.financialYear, financialYear),
            eq(invoiceSequences.documentType, docType as any)
          )
        )
        .for("update")
        .limit(1);
      const sequence = Number(row?.lastNumber ?? 0) + 1;
      if (row)
        await tx
          .update(invoiceSequences)
          .set({ lastNumber: sequence, prefix })
          .where(eq(invoiceSequences.id, row.id));
      else
        await tx.insert(invoiceSequences).values({
          storeId,
          financialYear,
          documentType: docType as any,
          prefix,
          lastNumber: sequence,
        });
      return formatInvoiceNumber({ prefix, sequence });
    }
    const [result] = await tx.execute(sql`
      INSERT INTO invoice_sequences (store_id, financial_year, document_type, prefix, last_number)
      VALUES (${storeId}, ${financialYear}, ${docType}, ${prefix}, 1)
      ON DUPLICATE KEY UPDATE last_number = LAST_INSERT_ID(last_number + 1), prefix = VALUES(prefix)
    `);
    const affectedRows = Number(
      (result as { affectedRows?: number })?.affectedRows ?? 0
    );
    if (affectedRows === 1) return formatInvoiceNumber({ prefix, sequence: 1 });
    const [rows] = await tx.execute(sql`SELECT LAST_INSERT_ID() AS sequence`);
    const sequence = Number(
      (rows as Array<{ sequence?: number }>)[0]?.sequence ?? 0
    );
    return formatInvoiceNumber({ prefix, sequence });
  };
  if (typeof db.transaction === "function") return db.transaction(reserve);
  return reserve(db);
}

export async function reserveInvoiceNumber(
  db: any,
  storeId: string,
  docType: InvoiceDocumentType,
  date = new Date()
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const value = await reserveInvoiceNumberOnce(db, storeId, docType, date);
      await assertInvoiceNumberUnique(db, value);
      return value;
    } catch (error) {
      if (attempt === 2 || !isDuplicateKeyError(error)) throw error;
    }
  }
  throw new Error("Unable to reserve unique invoice number");
}

export async function generateInvoiceNumber(db: any, storeId: string) {
  return reserveInvoiceNumber(db, storeId, "sale_invoice");
}
export async function generateCreditNoteNumber(db: any, storeId: string) {
  return reserveInvoiceNumber(db, storeId, "credit_note");
}
export async function generateReturnNoteNumber(db: any, storeId: string) {
  return reserveInvoiceNumber(db, storeId, "return_note");
}
export async function getInvoiceNumberForSale(db: any, saleId: string) {
  const { sales } = await import("../../drizzle/schema");
  const [sale] = await db
    .select({ billNo: sales.billNo })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  return sale?.billNo ?? null;
}
export function buildDraftBillNumber(storeId: string, date = new Date()) {
  const p = getIndiaBusinessDateParts(date);
  return `DRF-S${storeId}-${p.year}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}-${randomUUID()}`;
}
