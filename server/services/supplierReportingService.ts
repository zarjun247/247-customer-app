import { and, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { MySqlDatabase } from "drizzle-orm/mysql-core";
import type {
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
} from "drizzle-orm/mysql2";
import { buildSupplierReconciliationReport } from "./supplierLedgerCore";
import type {
  SupplierReconciliationFilters,
  SupplierLedgerInvoiceInput,
} from "./supplierLedgerCore";
import { getInvoiceOutstanding as _getInvoiceOutstanding } from "./supplierPaymentsService";
type DrizzleDb = MySqlDatabase<
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
  Record<string, unknown>
>;

const OPEN_PURCHASE_STATUSES = ["committed", "partially_returned"] as const;

export async function getSupplierOutstanding(
  db: DrizzleDb,
  supplierId: number,
  storeId?: number
) {
  const report = await getSupplierReconciliationReport(db, {
    supplierId,
    storeId,
  });
  return {
    supplierId,
    storeId: storeId ?? null,
    outstanding: report.totals.outstandingAmount,
    advances: report.totals.advances,
  };
}

export async function getSupplierLedger(db: DrizzleDb, supplierId: number) {
  const { supplierPayments } = await import("../../drizzle/schema");
  const rows = await db
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.supplierId, supplierId));
  return rows.map(r => ({
    ...r,
    transactionType:
      r.paymentMode === "credit" ? "invoice_payable" : r.paymentMode,
  }));
}

async function loadSupplierReconciliationInputs(
  db: DrizzleDb,
  filters: SupplierReconciliationFilters
) {
  const {
    purchaseInvoices,
    supplierPaymentAllocations,
    supplierPayments,
    purchaseReturns,
    suppliers,
  } = await import("../../drizzle/schema");
  const invoiceConds: SQL<unknown>[] = [
    inArray(purchaseInvoices.status, [...OPEN_PURCHASE_STATUSES]),
  ];
  if (filters.supplierId)
    invoiceConds.push(eq(purchaseInvoices.supplierId, filters.supplierId));
  if (filters.storeId)
    invoiceConds.push(eq(purchaseInvoices.storeId, filters.storeId));

  const invoiceRows = await db
    .select({ invoice: purchaseInvoices, supplierName: suppliers.supplierName })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(and(...invoiceConds));

  const invoices: SupplierLedgerInvoiceInput[] = invoiceRows.map(row => ({
    ...row.invoice,
    supplierName: row.supplierName ?? null,
  }));
  const invoiceIds = invoices.map(invoice => invoice.id);
  if (!invoiceIds.length)
    return { invoices, allocations: [], purchaseReturns: [], advances: [] };

  const allocations = await db
    .select({ allocation: supplierPaymentAllocations })
    .from(supplierPaymentAllocations)
    .where(inArray(supplierPaymentAllocations.purchaseInvoiceId, invoiceIds));

  const returnConds: SQL<unknown>[] = [
    inArray(purchaseReturns.purchaseInvoiceId, invoiceIds),
    eq(purchaseReturns.status, "committed"),
  ];
  if (filters.supplierId)
    returnConds.push(eq(purchaseReturns.supplierId, filters.supplierId));
  if (filters.storeId)
    returnConds.push(eq(purchaseReturns.storeId, filters.storeId));
  const returnRows = await db
    .select()
    .from(purchaseReturns)
    .where(and(...returnConds));

  const advanceConds: SQL<unknown>[] = [
    eq(supplierPayments.paymentMode, "advance"),
  ];
  if (filters.supplierId)
    advanceConds.push(eq(supplierPayments.supplierId, filters.supplierId));
  if (filters.storeId)
    advanceConds.push(eq(supplierPayments.storeId, filters.storeId));
  const advanceRows = await db
    .select({
      payment: supplierPayments,
      allocatedAmount: sql<number>`coalesce(sum(${supplierPaymentAllocations.amount}),0)`,
    })
    .from(supplierPayments)
    .leftJoin(
      supplierPaymentAllocations,
      eq(supplierPaymentAllocations.supplierPaymentId, supplierPayments.id)
    )
    .where(and(...advanceConds))
    .groupBy(supplierPayments.id);

  return {
    invoices,
    allocations: allocations.map(row => row.allocation),
    purchaseReturns: returnRows,
    advances: advanceRows.map(row => ({
      ...row.payment,
      allocatedAmount: row.allocatedAmount,
    })),
  };
}

export async function getSupplierAgeing(
  db: DrizzleDb,
  filters: number | SupplierReconciliationFilters
) {
  const normalized =
    typeof filters === "number" ? { supplierId: filters } : filters;
  const report = await getSupplierReconciliationReport(db, normalized);
  return {
    rows: report.ageing,
    totals: {
      count: report.ageing.length,
      outstanding: report.totals.outstandingAmount,
    },
    csvData: report.csvData,
  };
}

export async function getSupplierReconciliationReport(
  db: DrizzleDb,
  filters: SupplierReconciliationFilters = {}
) {
  const loaded = await loadSupplierReconciliationInputs(db, filters);
  return buildSupplierReconciliationReport({
    ...loaded,
    asOfDate: filters.asOfDate,
  });
}

export async function reconcileSupplierBalance(
  db: DrizzleDb,
  supplierId: number,
  storeId?: number
) {
  return getSupplierReconciliationReport(db, { supplierId, storeId });
}

export async function markInvoicePaidIfSettled(
  db: DrizzleDb,
  purchaseInvoiceId: number
) {
  const { purchaseInvoices } = await import("../../drizzle/schema");
  const { TRPCError } = await import("@trpc/server");
  const [inv] = await db
    .select()
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.id, purchaseInvoiceId));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
  const outstanding = await _getInvoiceOutstanding(db, purchaseInvoiceId);
  return { settled: outstanding <= 0 };
}
