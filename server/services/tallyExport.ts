import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";

export type TallyExportStatus = "pending" | "generated" | "exported" | "failed" | "cancelled";

export type TallyLedgerSourceRow = {
  id?: number;
  storeId?: number | null;
  sourceType?: string | null;
  sourceId?: number | string | null;
  entryDate?: Date | string | null;
  accountCode?: string | null;
  accountName?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
  narration?: string | null;
  metadataJson?: any;
};

export type TallyCsvRow = {
  voucherDate: string;
  voucherType: string;
  ledgerName: string;
  debitAmount: string;
  creditAmount: string;
  gstLedgerMapping: string;
  narration: string;
  sourceReference: string;
  storeId: string;
  companyIdentifier: string;
};

const CSV_HEADERS: (keyof TallyCsvRow)[] = [
  "voucherDate",
  "voucherType",
  "ledgerName",
  "debitAmount",
  "creditAmount",
  "gstLedgerMapping",
  "narration",
  "sourceReference",
  "storeId",
  "companyIdentifier",
];

export function stableSerialize(value: any): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

export function deterministicSha256(value: any): string {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatAmount(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toFixed(2);
}

export function defaultTallyLedgerMapping(row: Pick<TallyLedgerSourceRow, "sourceType" | "accountCode" | "accountName" | "metadataJson">): string {
  const haystack = [row.sourceType, row.accountCode, row.accountName, row.metadataJson?.ledgerType, row.metadataJson?.gstType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/gst.*input|input.*gst|cgst.*input|sgst.*input|igst.*input/.test(haystack)) return "Input GST";
  if (/gst.*output|output.*gst|cgst.*output|sgst.*output|igst.*output/.test(haystack)) return "Output GST";
  if (/purchase|cogs|supplier_payable/.test(haystack)) return "Purchases";
  if (/sale|revenue|income|customer/.test(haystack)) return "Sales";
  if (/cash|bank|upi|card|payment/.test(haystack)) return "Cash/Bank";
  if (/supplier|payable/.test(haystack)) return "Supplier Ledger";
  if (/customer|receivable/.test(haystack)) return "Customer Ledger";
  return "Unmapped Tally Ledger";
}

function voucherTypeForSource(sourceType?: string | null): string {
  switch (sourceType) {
    case "purchase":
    case "purchase_return":
    case "supplier_payable":
    case "gst_input":
      return "Purchase";
    case "payment":
    case "supplier_payment":
      return "Payment";
    case "refund":
      return "Receipt";
    case "sale":
    case "gst_output":
    default:
      return "Sales";
  }
}

export function buildTallyCsvRows(rows: TallyLedgerSourceRow[], input: { storeId?: number | null; companyIdentifier?: string | null } = {}): TallyCsvRow[] {
  return rows.map((row, index) => {
    const debitAmount = formatAmount(row.debit);
    const creditAmount = formatAmount(row.credit);
    if (Number(debitAmount) === 0 && Number(creditAmount) === 0) {
      throw new Error(`Tally export row ${row.id ?? index} has neither debit nor credit amount`);
    }
    const sourceReference = [row.sourceType ?? "journal", row.sourceId ?? row.id ?? index].join(":");
    const storeId = String(row.storeId ?? input.storeId ?? "");
    return {
      voucherDate: formatDate(row.entryDate),
      voucherType: voucherTypeForSource(row.sourceType),
      ledgerName: row.accountName || row.accountCode || defaultTallyLedgerMapping(row),
      debitAmount,
      creditAmount,
      gstLedgerMapping: defaultTallyLedgerMapping(row),
      narration: row.narration ?? "",
      sourceReference,
      storeId,
      companyIdentifier: input.companyIdentifier ?? storeId,
    };
  });
}

export function toCsv(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(","))].join("\n");
}

export function toTallyCsv(rows: TallyCsvRow[]) {
  return [CSV_HEADERS.join(","), ...rows.map((row) => CSV_HEADERS.map((header) => JSON.stringify(row[header] ?? "")).join(","))].join("\n");
}

function buildDuplicateKey(input: { storeId?: number | null; exportType: string; periodStart?: Date | null; periodEnd?: Date | null; checksum: string }) {
  return deterministicSha256({
    storeId: input.storeId ?? "__global__",
    exportType: input.exportType,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    checksum: input.checksum,
  });
}

async function findExistingRun(db: any, input: { storeId?: number | null; exportType: string; periodStart?: Date | null; periodEnd?: Date | null; checksum: string }) {
  const { tallyExportRuns } = await import("../../drizzle/schema");
  if (typeof db.findTallyExportRun === "function") return db.findTallyExportRun(input);
  const conditions = [
    eq(tallyExportRuns.exportType, input.exportType),
    eq(tallyExportRuns.duplicateKey, buildDuplicateKey(input)),
  ];
  if (input.storeId === undefined || input.storeId === null) conditions.push(eq(tallyExportRuns.storeId, null as any));
  else conditions.push(eq(tallyExportRuns.storeId, input.storeId));
  conditions.push(eq(tallyExportRuns.periodStart, input.periodStart ?? null as any));
  conditions.push(eq(tallyExportRuns.periodEnd, input.periodEnd ?? null as any));
  const [existing] = await db.select().from(tallyExportRuns).where(and(...conditions)).limit(1);
  return existing ?? null;
}

async function insertRun(db: any, values: any) {
  const { tallyExportRuns } = await import("../../drizzle/schema");
  if (typeof db.insertTallyExportRun === "function") return db.insertTallyExportRun(values);
  const [res] = await db.insert(tallyExportRuns).values(values);
  return { id: (res as any)?.insertId ?? (res as any)?.id, ...values };
}

export async function generateTallyCsvExport(db: any, input: { exportType: string; rows: TallyLedgerSourceRow[]; storeId?: number | null; periodStart?: Date | null; periodEnd?: Date | null; dateFrom?: Date | null; dateTo?: Date | null; filters?: Record<string, any>; generatedBy?: number | null; companyIdentifier?: string | null }) {
  const periodStart = input.periodStart ?? input.dateFrom ?? null;
  const periodEnd = input.periodEnd ?? input.dateTo ?? null;
  const generatedAt = new Date();
  try {
    const tallyRows = buildTallyCsvRows(input.rows, { storeId: input.storeId, companyIdentifier: input.companyIdentifier });
    const checksumPayload = { exportType: input.exportType, periodStart, periodEnd, storeId: input.storeId ?? null, rows: tallyRows };
    const checksum = deterministicSha256(checksumPayload);
    const existing = await findExistingRun(db, { storeId: input.storeId ?? null, exportType: input.exportType, periodStart, periodEnd, checksum });
    const csv = toTallyCsv(tallyRows);
    if (existing) {
      return { status: "duplicate_blocked" as const, checksum, runId: existing.id, rows: tallyRows, csv, providerState: "export_generated_duplicate_not_synced", imported: false, synced: false };
    }
    const run = await insertRun(db, {
      storeId: input.storeId ?? null,
      exportType: input.exportType,
      periodStart,
      periodEnd,
      dateFrom: periodStart,
      dateTo: periodEnd,
      filtersJson: input.filters ?? null,
      rowCount: tallyRows.length,
      checksum,
      duplicateKey: buildDuplicateKey({ storeId: input.storeId ?? null, exportType: input.exportType, periodStart, periodEnd, checksum }),
      status: "generated" satisfies TallyExportStatus,
      generatedBy: input.generatedBy ?? null,
      generatedAt,
      exportedAt: null,
      failureReason: null,
      fileKey: null,
      fileUrl: null,
    });
    return { status: "generated" as const, checksum, runId: run.id, rows: tallyRows, csv, providerState: "export_generated_not_synced", imported: false, synced: false };
  } catch (error: any) {
    const failureReason = error?.message ?? "Tally export generation failed";
    const checksum = deterministicSha256({ exportType: input.exportType, periodStart, periodEnd, storeId: input.storeId ?? null, rows: input.rows, failureReason });
    const run = await insertRun(db, {
      storeId: input.storeId ?? null,
      exportType: input.exportType,
      periodStart,
      periodEnd,
      dateFrom: periodStart,
      dateTo: periodEnd,
      filtersJson: input.filters ?? null,
      rowCount: 0,
      checksum,
      duplicateKey: buildDuplicateKey({ storeId: input.storeId ?? null, exportType: input.exportType, periodStart, periodEnd, checksum }),
      status: "failed" satisfies TallyExportStatus,
      generatedBy: input.generatedBy ?? null,
      generatedAt,
      exportedAt: null,
      failureReason,
      fileKey: null,
      fileUrl: null,
    });
    return { status: "failed" as const, checksum, runId: run.id, failureReason, providerState: "export_generation_failed_not_synced", imported: false, synced: false };
  }
}

export async function getGstOutputSummary(db: any) { const { sales } = await import("../../drizzle/schema"); return db.select().from(sales).limit(200); }
export async function getGstInputSummary(db: any) { const { purchaseInvoices } = await import("../../drizzle/schema"); return db.select().from(purchaseInvoices).limit(200); }
export async function getGstNetPosition(db: any) { const out = await getGstOutputSummary(db); const inp = await getGstInputSummary(db); return { rows: [{ outputRows: out.length, inputRows: inp.length }], totals: { outputRows: out.length, inputRows: inp.length, netRows: out.length - inp.length }, csvData: [{ outputRows: out.length, inputRows: inp.length, netRows: out.length - inp.length }] }; }
export async function getPaymentModeBreakdown(db: any) { const { counterPayments } = await import("../../drizzle/schema"); const rows = await db.select().from(counterPayments).limit(500); return { rows, totals: { count: rows.length }, csvData: rows }; }
export async function getSettlementSummary(db: any) { return getPaymentModeBreakdown(db); }
