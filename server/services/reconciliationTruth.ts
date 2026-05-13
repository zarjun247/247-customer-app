import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "../db";
import {
  counterPayments,
  h1Register,
  saleLines,
  saleReturns,
  sales,
  stockMovements,
} from "../../drizzle/schema";

const n = (v: unknown) => Number(v ?? 0);

export function computeOrderFinancialTruth(input: {
  gross: number;
  discount: number;
  taxes: number;
  paid: number;
  refunded: number;
  cancellationCost?: number;
}) {
  const net = input.gross - input.discount + input.taxes;
  const outstanding =
    net - input.paid + input.refunded + (input.cancellationCost ?? 0);
  return { ...input, net, outstanding };
}

export async function getOrderFinancialTruth(saleId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  if (!sale) throw new Error("Sale not found");
  const lines = await db
    .select()
    .from(saleLines)
    .where(eq(saleLines.saleId, saleId));
  const payments = await db
    .select()
    .from(counterPayments)
    .where(eq(counterPayments.saleId, saleId));
  const returnsForSale = await db
    .select({ id: saleReturns.id, totalRefund: saleReturns.totalRefund })
    .from(saleReturns)
    .where(
      and(eq(saleReturns.saleId, saleId), eq(saleReturns.status, "approved"))
    );
  const gross = lines.reduce((s, l) => s + n(l.saleRate) * n(l.qty), 0);
  const discount = lines.reduce((s, l) => s + n(l.discountAmount), 0);
  const taxes = lines.reduce((s, l) => s + n(l.gstAmount), 0);
  const paid = payments
    .filter(p => p.status === "confirmed")
    .reduce((s, p) => s + n(p.amount), 0);
  const refunded = returnsForSale.reduce((s, r) => s + n(r.totalRefund), 0);
  return {
    sale,
    lines,
    payments,
    returns: returnsForSale,
    ...computeOrderFinancialTruth({ gross, discount, taxes, paid, refunded }),
  };
}

export async function recordCancellationTruth(input: {
  saleId: string;
  reason: string;
  actorId: number;
  cancellationCost?: number;
  refundAmount?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.id, input.saleId))
    .limit(1);
  if (!sale) throw new Error("Sale not found");
  await db
    .update(sales)
    .set({
      status: "cancelled",
      notes: `Cancelled: ${input.reason}`,
      updatedAt: Date.now(),
    })
    .where(eq(sales.id, input.saleId));
  return {
    saleId: input.saleId,
    cancellationCost: input.cancellationCost ?? 0,
    refundAmount: input.refundAmount ?? 0,
  };
}

export const recordSaleTruth = async (saleId: string) =>
  getOrderFinancialTruth(saleId);
export const recordPaymentTruth = async (saleId: string) =>
  getOrderFinancialTruth(saleId);
export const recordRefundTruth = async (saleId: string) =>
  getOrderFinancialTruth(saleId);

export async function getDailySalesTruth(input: {
  fromDate: string;
  toDate: string;
  storeId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const from = new Date(input.fromDate);
  const to = new Date(input.toDate);
  to.setHours(23, 59, 59, 999);
  const conditions = [
    gte(sales.createdAt, from.getTime()),
    lte(sales.createdAt, to.getTime()),
    ne(sales.status, "cancelled"),
  ];
  if (input.storeId) conditions.push(eq(sales.storeId, input.storeId));
  const rows = await db
    .select()
    .from(sales)
    .where(and(...conditions))
    .orderBy(desc(sales.createdAt));
  const totals = rows.reduce(
    (a, r) => ({
      count: a.count + 1,
      gross: a.gross + n(r.total),
      taxes: a.taxes + n(r.gstAmount),
    }),
    { count: 0, gross: 0, taxes: 0 }
  );
  return { rows, totals, csvData: rows };
}

export async function getGstReportTruth(input: {
  fromDate: string;
  toDate: string;
  storeId?: string;
}) {
  return getDailySalesTruth(input);
}
export async function getH1ReportTruth(input: {
  fromDate: string;
  toDate: string;
  storeId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const from = new Date(input.fromDate);
  const to = new Date(input.toDate);
  to.setHours(23, 59, 59, 999);
  const conditions = [
    gte(h1Register.dispensedAt, from),
    lte(h1Register.dispensedAt, to),
  ];
  if (input.storeId) conditions.push(eq(h1Register.storeId, input.storeId));
  const rows = await db
    .select()
    .from(h1Register)
    .where(and(...conditions));
  return { rows, totals: { count: rows.length }, csvData: rows };
}
export async function getBatchwiseBalanceTruth(input: { storeId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const rows = await db
    .select()
    .from(stockMovements)
    .where(
      input.storeId ? eq(stockMovements.storeId, input.storeId) : undefined
    );
  return { rows, totals: { count: rows.length }, csvData: rows };
}
export async function verifyOrderTruth(saleId: string) {
  const t = await getOrderFinancialTruth(saleId);
  return { ok: t.outstanding >= -0.01, truth: t };
}
export async function verifyMovementTruth(input: { storeId?: number }) {
  const rows = await getBatchwiseBalanceTruth(input);
  return {
    ok: rows.rows.every(r => Number(r.qtyAfter ?? 0) >= 0),
    inspected: rows.rows.length,
  };
}
