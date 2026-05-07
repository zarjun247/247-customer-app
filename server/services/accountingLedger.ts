import { eq, sql, and, gte, lte, isNull, ne } from "drizzle-orm";

type EntryInput = {
  storeId?: number | null;
  sourceType: string;
  sourceId: number;
  entryDate?: Date;
  accountCode: string;
  accountName: string;
  debit?: number;
  credit?: number;
  narration?: string;
  metadataJson?: any;
  journalBatchId?: number | null;
};

export type JournalBatchStatus = "draft" | "posted" | "reversed" | "failed";

export type JournalLineInput = {
  accountCode: string;
  accountName: string;
  debit?: number;
  credit?: number;
  narration?: string;
  metadataJson?: any;
};

export type BalancedJournalBatchInput = {
  sourceType: string;
  sourceRef: string;
  sourceId?: number;
  storeId?: number | null;
  entryDate?: Date;
  postedBy?: number | null;
  narration?: string;
  metadataJson?: any;
  lines: JournalLineInput[];
};

const MONEY_EPSILON = 0.005;

function money(input: unknown) {
  const value = Number(input ?? 0);
  if (!Number.isFinite(value)) throw new Error("journal line amount must be finite");
  return Math.round(value * 100) / 100;
}

function assertPresent(value: string | undefined, fieldName: string) {
  if (!value || value.trim().length === 0) throw new Error(`${fieldName} is required`);
}

export function assertBalancedJournalBatch(input: BalancedJournalBatchInput) {
  assertPresent(input.sourceType, "sourceType");
  assertPresent(input.sourceRef, "sourceRef");
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error("journal batch requires lines");

  let debitLineCount = 0;
  let creditLineCount = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of input.lines) {
    assertPresent(line.accountCode, "accountCode");
    assertPresent(line.accountName, "accountName");
    const debit = money(line.debit);
    const credit = money(line.credit);
    if (debit < 0 || credit < 0) throw new Error("journal line debit/credit cannot be negative");
    if (debit > 0 && credit > 0) throw new Error("journal line cannot contain both debit and credit");
    if (debit === 0 && credit === 0) throw new Error("journal line requires debit or credit");
    if (debit > 0) debitLineCount += 1;
    if (credit > 0) creditLineCount += 1;
    totalDebit = money(totalDebit + debit);
    totalCredit = money(totalCredit + credit);
  }

  if (debitLineCount === 0) throw new Error("journal batch requires at least one debit line");
  if (creditLineCount === 0) throw new Error("journal batch requires at least one credit line");
  if (Math.abs(totalDebit - totalCredit) > MONEY_EPSILON) throw new Error("journal batch is not balanced");

  return { totalDebit: totalDebit.toFixed(2), totalCredit: totalCredit.toFixed(2), debitLineCount, creditLineCount };
}

export async function createJournalBatch(db: any, input: Omit<BalancedJournalBatchInput, "lines"> & { status?: JournalBatchStatus; failureReason?: string | null; totalDebit?: string; totalCredit?: string }) {
  const { accountingJournalBatches } = await import("../../drizzle/schema");
  const [res] = await db.insert(accountingJournalBatches).values({
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    storeId: input.storeId ?? null,
    status: input.status ?? "draft",
    totalDebit: input.totalDebit ?? "0.00",
    totalCredit: input.totalCredit ?? "0.00",
    postedBy: input.postedBy ?? null,
    postedAt: input.status === "posted" ? new Date() : null,
    failureReason: input.failureReason ?? null,
  });
  return { id: (res as any).insertId, status: input.status ?? "draft", persisted: true };
}

export async function postBalancedJournalBatch(db: any, input: BalancedJournalBatchInput) {
  const { accountingJournalBatches, accountingJournalEntries } = await import("../../drizzle/schema");
  const sourceId = input.sourceId ?? Number(input.sourceRef);
  if (!Number.isInteger(sourceId) || sourceId < 0) throw new Error("numeric sourceId is required until legacy journal entry sourceId is migrated");

  let totals;
  try {
    totals = assertBalancedJournalBatch(input);
  } catch (error: any) {
    const failureReason = error?.message ?? "journal batch validation failed";
    await db.insert(accountingJournalBatches).values({
      sourceType: input.sourceType || "invalid",
      sourceRef: input.sourceRef || "invalid",
      storeId: input.storeId ?? null,
      status: "failed",
      totalDebit: "0.00",
      totalCredit: "0.00",
      postedBy: input.postedBy ?? null,
      postedAt: null,
      failureReason,
    });
    throw error;
  }

  const [batchRes] = await db.insert(accountingJournalBatches).values({
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    storeId: input.storeId ?? null,
    status: "posted",
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
    postedBy: input.postedBy ?? null,
    postedAt: new Date(),
    failureReason: null,
  });
  const journalBatchId = (batchRes as any).insertId;

  await db.insert(accountingJournalEntries).values(input.lines.map((line) => ({
    journalBatchId,
    storeId: input.storeId ?? null,
    sourceType: input.sourceType,
    sourceId,
    entryDate: input.entryDate ?? new Date(),
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: money(line.debit).toFixed(2),
    credit: money(line.credit).toFixed(2),
    narration: line.narration ?? input.narration ?? null,
    metadataJson: line.metadataJson ?? input.metadataJson ?? null,
  })));

  return { id: journalBatchId, status: "posted" as JournalBatchStatus, ...totals, lineCount: input.lines.length, persisted: true };
}

export async function reverseJournalBatch(db: any, input: { journalBatchId: number; sourceRef: string; postedBy?: number | null; reason?: string }) {
  const { accountingJournalBatches, accountingJournalEntries } = await import("../../drizzle/schema");
  const [batch] = await db.select().from(accountingJournalBatches).where(eq(accountingJournalBatches.id, input.journalBatchId)).limit(1);
  if (!batch || batch.status !== "posted") throw new Error("only posted journal batches can be reversed");
  const rows = await db.select().from(accountingJournalEntries).where(eq(accountingJournalEntries.journalBatchId, input.journalBatchId));
  const reversal = await postBalancedJournalBatch(db, {
    sourceType: `${batch.sourceType}_reversal`,
    sourceRef: input.sourceRef,
    sourceId: Number(input.sourceRef),
    storeId: batch.storeId,
    postedBy: input.postedBy ?? null,
    narration: input.reason ?? `reversal of journal batch ${input.journalBatchId}`,
    lines: rows.map((row: any) => ({
      accountCode: row.accountCode,
      accountName: row.accountName,
      debit: Number(row.credit ?? 0),
      credit: Number(row.debit ?? 0),
      metadataJson: { reversedJournalBatchId: input.journalBatchId },
    })),
  });
  await db.update(accountingJournalBatches).set({ status: "reversed", updatedAt: new Date() }).where(eq(accountingJournalBatches.id, input.journalBatchId));
  return reversal;
}

export function createSaleJournalBatch(input: { saleId: number; storeId?: number | null; total: number; gstAmount?: number; paymentAccountCode?: string; paymentAccountName?: string; postedBy?: number | null }) {
  const gst = money(input.gstAmount);
  const total = money(input.total);
  const revenue = money(total - gst);
  if (revenue < 0) throw new Error("sale GST cannot exceed sale total");
  return {
    sourceType: "sale",
    sourceRef: String(input.saleId),
    sourceId: input.saleId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      { accountCode: input.paymentAccountCode ?? "1000", accountName: input.paymentAccountName ?? "Cash / Receivable", debit: total, credit: 0 },
      ...(revenue > 0 ? [{ accountCode: "4000", accountName: "Sales Revenue", debit: 0, credit: revenue }] : []),
      ...(gst > 0 ? [{ accountCode: "2400", accountName: "Output GST", debit: 0, credit: gst }] : []),
    ],
  } satisfies BalancedJournalBatchInput;
}

export function createPurchaseJournalBatch(input: { purchaseInvoiceId: number; storeId?: number | null; netAmount: number; totalGst?: number; postedBy?: number | null }) {
  const gst = money(input.totalGst);
  const net = money(input.netAmount);
  const purchases = money(net - gst);
  if (purchases < 0) throw new Error("purchase GST cannot exceed purchase net amount");
  return {
    sourceType: "purchase",
    sourceRef: String(input.purchaseInvoiceId),
    sourceId: input.purchaseInvoiceId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      ...(purchases > 0 ? [{ accountCode: "5000", accountName: "Purchases", debit: purchases, credit: 0 }] : []),
      ...(gst > 0 ? [{ accountCode: "1400", accountName: "Input GST", debit: gst, credit: 0 }] : []),
      { accountCode: "2100", accountName: "Supplier Payable", debit: 0, credit: net },
    ],
  } satisfies BalancedJournalBatchInput;
}

export function createPaymentJournalBatch(input: { paymentId: number; storeId?: number | null; amount: number; postedBy?: number | null; settlementAccountCode?: string; settlementAccountName?: string }) {
  const amount = money(input.amount);
  return {
    sourceType: "payment",
    sourceRef: String(input.paymentId),
    sourceId: input.paymentId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      { accountCode: input.settlementAccountCode ?? "1000", accountName: input.settlementAccountName ?? "Cash / Bank", debit: amount, credit: 0 },
      { accountCode: "1100", accountName: "Customer Receivable", debit: 0, credit: amount },
    ],
  } satisfies BalancedJournalBatchInput;
}

export function createRefundJournalBatch(input: { refundId: number; storeId?: number | null; amount: number; gstAmount?: number; postedBy?: number | null }) {
  const gst = money(input.gstAmount);
  const amount = money(input.amount);
  const salesReturn = money(amount - gst);
  if (salesReturn < 0) throw new Error("refund GST cannot exceed refund amount");
  return {
    sourceType: "refund",
    sourceRef: String(input.refundId),
    sourceId: input.refundId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      ...(salesReturn > 0 ? [{ accountCode: "4100", accountName: "Sales Returns", debit: salesReturn, credit: 0 }] : []),
      ...(gst > 0 ? [{ accountCode: "2400", accountName: "Output GST Reversal", debit: gst, credit: 0 }] : []),
      { accountCode: "1000", accountName: "Cash / Bank", debit: 0, credit: amount },
    ],
  } satisfies BalancedJournalBatchInput;
}

export function createSaleReturnJournalBatch(input: { saleReturnId: number; storeId?: number | null; totalRefund: number; gstReversal?: number; postedBy?: number | null }) {
  return { ...createRefundJournalBatch({ refundId: input.saleReturnId, storeId: input.storeId, amount: input.totalRefund, gstAmount: input.gstReversal, postedBy: input.postedBy }), sourceType: "sale_return" } satisfies BalancedJournalBatchInput;
}

export function createPurchaseReturnJournalBatch(input: { purchaseReturnId: number; storeId?: number | null; totalAmount: number; gstReversal?: number; postedBy?: number | null }) {
  const gst = money(input.gstReversal);
  const total = money(input.totalAmount);
  const purchaseReturn = money(total - gst);
  if (purchaseReturn < 0) throw new Error("purchase return GST cannot exceed return amount");
  return {
    sourceType: "purchase_return",
    sourceRef: String(input.purchaseReturnId),
    sourceId: input.purchaseReturnId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      { accountCode: "2100", accountName: "Supplier Payable", debit: total, credit: 0 },
      ...(purchaseReturn > 0 ? [{ accountCode: "5100", accountName: "Purchase Returns", debit: 0, credit: purchaseReturn }] : []),
      ...(gst > 0 ? [{ accountCode: "1400", accountName: "Input GST Reversal", debit: 0, credit: gst }] : []),
    ],
  } satisfies BalancedJournalBatchInput;
}

export async function recordJournalEntry(db: any, input: EntryInput) {
  const { accountingJournalEntries } = await import("../../drizzle/schema");
  const [res] = await db.insert(accountingJournalEntries).values({
    journalBatchId: input.journalBatchId ?? null,
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
  const { accountingJournalEntries, accountingJournalBatches } = await import("../../drizzle/schema");
  const conds = [eq(accountingJournalBatches.status, "posted")] as any[];
  if (input.storeId !== undefined) conds.push(eq(accountingJournalEntries.storeId, input.storeId));
  if (input.fromDate) conds.push(gte(accountingJournalEntries.entryDate, input.fromDate));
  if (input.toDate) conds.push(lte(accountingJournalEntries.entryDate, input.toDate));
  const rows = await db
    .select({
      accountCode: accountingJournalEntries.accountCode,
      accountName: accountingJournalEntries.accountName,
      debit: sql<number>`coalesce(sum(${accountingJournalEntries.debit}),0)`,
      credit: sql<number>`coalesce(sum(${accountingJournalEntries.credit}),0)`,
    })
    .from(accountingJournalEntries)
    .innerJoin(accountingJournalBatches, eq(accountingJournalEntries.journalBatchId, accountingJournalBatches.id))
    .where(and(...conds))
    .groupBy(accountingJournalEntries.accountCode, accountingJournalEntries.accountName);
  const totals = rows.reduce((acc: any, row: any) => ({ debit: money(acc.debit + Number(row.debit ?? 0)), credit: money(acc.credit + Number(row.credit ?? 0)) }), { debit: 0, credit: 0 });
  return { rows, totals, balanced: Math.abs(totals.debit - totals.credit) <= MONEY_EPSILON };
}

export async function getJournalBatchMismatches(db: any) {
  const { accountingJournalEntries, accountingJournalBatches } = await import("../../drizzle/schema");
  const [unbalanced] = await db
    .select({ count: sql<number>`count(*)` })
    .from(accountingJournalBatches)
    .where(and(eq(accountingJournalBatches.status, "posted"), ne(accountingJournalBatches.totalDebit, accountingJournalBatches.totalCredit)));
  const [orphans] = await db
    .select({ count: sql<number>`count(*)` })
    .from(accountingJournalEntries)
    .where(isNull(accountingJournalEntries.journalBatchId));
  return { unbalancedBatchCount: Number(unbalanced?.count ?? 0), orphanEntryCount: Number(orphans?.count ?? 0) };
}

export async function getJournalExportRows(db: any, input: { storeId?: number; fromDate?: Date; toDate?: Date } = {}) {
  const { accountingJournalEntries, accountingJournalBatches } = await import("../../drizzle/schema");
  const conds = [eq(accountingJournalBatches.status, "posted")] as any[];
  if (input.storeId !== undefined) conds.push(eq(accountingJournalEntries.storeId, input.storeId));
  if (input.fromDate) conds.push(gte(accountingJournalEntries.entryDate, input.fromDate));
  if (input.toDate) conds.push(lte(accountingJournalEntries.entryDate, input.toDate));
  const rows = await db
    .select()
    .from(accountingJournalEntries)
    .innerJoin(accountingJournalBatches, eq(accountingJournalEntries.journalBatchId, accountingJournalBatches.id))
    .where(and(...conds));
  return { rows, totals: { count: rows.length }, csvData: rows, persisted: true };
}
