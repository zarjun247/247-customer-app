import { eq, sql, and, gte, lte } from "drizzle-orm";

type EntryInput = { storeId?: number | null; sourceType: string; sourceId: number; entryDate?: Date; accountCode: string; accountName: string; debit?: number; credit?: number; narration?: string; metadataJson?: any };

export async function recordJournalEntry(db: any, input: EntryInput) {
  const { accountingJournalEntries } = await import("../../drizzle/schema");
  const [res] = await db.insert(accountingJournalEntries).values({
    storeId: input.storeId ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    entryDate: input.entryDate ?? new Date(),
    accountCode: input.accountCode,
    accountName: input.accountName,
    debit: String(input.debit ?? 0),
    credit: String(input.credit ?? 0),
    narration: input.narration ?? null,
    metadataJson: input.metadataJson ?? null,
  });
  return { id: (res as any).insertId, persisted: true };
}

export const recordSalesJournal = (db: any, input: Omit<EntryInput, "sourceType">) => recordJournalEntry(db, { ...input, sourceType: "sale" });
export const recordPurchaseJournal = (db: any, input: Omit<EntryInput, "sourceType">) => recordJournalEntry(db, { ...input, sourceType: "purchase" });
export const recordPaymentJournal = (db: any, input: Omit<EntryInput, "sourceType">) => recordJournalEntry(db, { ...input, sourceType: "payment" });
export const recordRefundJournal = (db: any, input: Omit<EntryInput, "sourceType">) => recordJournalEntry(db, { ...input, sourceType: "refund" });
export const recordSupplierPayableJournal = (db: any, input: Omit<EntryInput, "sourceType">) => recordJournalEntry(db, { ...input, sourceType: "supplier_payable" });
export const recordSupplierPaymentJournal = (db: any, input: Omit<EntryInput, "sourceType">) => recordJournalEntry(db, { ...input, sourceType: "supplier_payment" });
export const recordPurchaseReturnJournal = (db: any, input: Omit<EntryInput, "sourceType">) => recordJournalEntry(db, { ...input, sourceType: "purchase_return" });
export const recordGstInputJournal = (db: any, input: Omit<EntryInput, "sourceType">) => recordJournalEntry(db, { ...input, sourceType: "gst_input" });
export const recordGstOutputJournal = (db: any, input: Omit<EntryInput, "sourceType">) => recordJournalEntry(db, { ...input, sourceType: "gst_output" });

export async function getTrialBalanceLite(db: any, input: { storeId?: number; fromDate?: Date; toDate?: Date } = {}) {
  const { accountingJournalEntries } = await import("../../drizzle/schema");
  const conds = [] as any[];
  if (input.storeId !== undefined) conds.push(eq(accountingJournalEntries.storeId, input.storeId));
  if (input.fromDate) conds.push(gte(accountingJournalEntries.entryDate, input.fromDate));
  if (input.toDate) conds.push(lte(accountingJournalEntries.entryDate, input.toDate));
  const [row] = await db.select({ debit: sql<number>`coalesce(sum(${accountingJournalEntries.debit}),0)`, credit: sql<number>`coalesce(sum(${accountingJournalEntries.credit}),0)` }).from(accountingJournalEntries).where(conds.length ? and(...conds) : undefined);
  return { totals: row, balanced: Number(row?.debit ?? 0) === Number(row?.credit ?? 0) };
}

export async function getJournalExportRows(db: any, input: { storeId?: number; fromDate?: Date; toDate?: Date } = {}) {
  const { accountingJournalEntries } = await import("../../drizzle/schema");
  const conds = [] as any[];
  if (input.storeId !== undefined) conds.push(eq(accountingJournalEntries.storeId, input.storeId));
  if (input.fromDate) conds.push(gte(accountingJournalEntries.entryDate, input.fromDate));
  if (input.toDate) conds.push(lte(accountingJournalEntries.entryDate, input.toDate));
  const rows = await db.select().from(accountingJournalEntries).where(conds.length ? and(...conds) : undefined);
  return { rows, totals: { count: rows.length }, csvData: rows, persisted: true };
}
