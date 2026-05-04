import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";

export function toCsv(rows: Record<string, any>[]) { if (!rows.length) return ""; const headers = Object.keys(rows[0]); return [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n"); }

export async function generateTallyCsvExport(db: any, input: { exportType: string; rows: any[]; storeId?: number; dateFrom?: Date; dateTo?: Date; filters?: Record<string, any>; generatedBy?: number; allowReexport?: boolean }) {
  const { tallyExportRuns } = await import("../../drizzle/schema");
  const checksum = crypto.createHash("sha256").update(JSON.stringify({ exportType: input.exportType, rows: input.rows, storeId: input.storeId ?? null, dateFrom: input.dateFrom?.toISOString() ?? null, dateTo: input.dateTo?.toISOString() ?? null, filters: input.filters ?? {} })).digest("hex");
  const [existing] = await db.select().from(tallyExportRuns).where(eq(tallyExportRuns.checksum, checksum)).limit(1);
  if (existing && !input.allowReexport) return { status: "duplicate_blocked", checksum, runId: existing.id, csv: toCsv(input.rows), deferred: { tallyXml: true, odbcPush: true } };
  const [res] = await db.insert(tallyExportRuns).values({ storeId: input.storeId ?? null, exportType: input.exportType, dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null, filtersJson: input.filters ?? null, rowCount: input.rows.length, checksum, status: existing ? "reexported" : "generated", generatedBy: input.generatedBy ?? null });
  return { status: existing ? "reexported" : "generated", checksum, runId: (res as any).insertId, rows: input.rows, csv: toCsv(input.rows), deferred: { tallyXml: true, odbcPush: true } };
}

export async function getGstOutputSummary(db: any) { const { sales } = await import("../../drizzle/schema"); return db.select().from(sales).limit(200); }
export async function getGstInputSummary(db: any) { const { purchaseInvoices } = await import("../../drizzle/schema"); return db.select().from(purchaseInvoices).limit(200); }
export async function getGstNetPosition(db: any) { const out = await getGstOutputSummary(db); const inp = await getGstInputSummary(db); return { rows: [{ outputRows: out.length, inputRows: inp.length }], totals: { outputRows: out.length, inputRows: inp.length, netRows: out.length - inp.length }, csvData: [{ outputRows: out.length, inputRows: inp.length, netRows: out.length - inp.length }] }; }
export async function getPaymentModeBreakdown(db: any) { const { counterPayments } = await import("../../drizzle/schema"); const rows = await db.select().from(counterPayments).limit(500); return { rows, totals: { count: rows.length }, csvData: rows }; }
export async function getSettlementSummary(db: any) { return getPaymentModeBreakdown(db); }
