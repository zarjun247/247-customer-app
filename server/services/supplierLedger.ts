import { and, eq } from "drizzle-orm";
import { logAudit } from "./audit";
import type { CtxLike } from "./audit";
import type { MySqlDatabase } from "drizzle-orm/mysql-core";
import type {
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
} from "drizzle-orm/mysql2";
import type { ResultSetHeader } from "mysql2";
type DrizzleDb = MySqlDatabase<
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
  Record<string, unknown>
>;

export type {
  SupplierAllocationType,
  SupplierLedgerInvoiceInput,
  SupplierLedgerAllocationInput,
  SupplierLedgerReturnInput,
  SupplierAdvanceInput,
  SupplierReconciliationFilters,
  SupplierInvoiceReconciliationRow,
  SupplierAgeingRow,
} from "./supplierLedgerCore";

export { buildSupplierReconciliationReport } from "./supplierLedgerCore";

export async function recordSupplierPayable(
  db: DrizzleDb,
  input: {
    supplierId: number;
    purchaseInvoiceId: number;
    storeId: number;
    amount: number;
    actorId: number;
    actorRole: string;
    source: string;
  },
  ctx?: CtxLike
) {
  const { supplierPayments } = await import("../../drizzle/schema");
  const [existing] = await db
    .select()
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.purchaseInvoiceId, input.purchaseInvoiceId),
        eq(supplierPayments.paymentMode, "credit")
      )
    )
    .limit(1);
  if (existing) return { idempotent: true, paymentId: existing.id };
  const insertResult = await db.insert(supplierPayments).values({
    supplierId: input.supplierId,
    purchaseInvoiceId: input.purchaseInvoiceId,
    storeId: input.storeId,
    amount: String(input.amount),
    paymentMode: "credit",
    paymentDate: new Date(),
    notes: "Auto payable entry",
    createdBy: input.actorId,
  });
  const [header] = insertResult as unknown as [ResultSetHeader];
  const id = header.insertId;
  await logAudit(
    {
      action: "supplier.payable.created",
      entityType: "purchase_invoice",
      entityId: input.purchaseInvoiceId,
      afterJson: { amount: input.amount, paymentId: id },
    },
    ctx
  );
  return { success: true, paymentId: id };
}

export {
  recordSupplierPayment,
  allocatePaymentToInvoice,
  allocateSupplierPayment,
  recordSupplierAdvance,
  applySupplierDebitNote,
  applyPurchaseReturnCredit,
  getUnallocatedPaymentAmount,
  getInvoiceOutstanding,
} from "./supplierPaymentsService";

export {
  getSupplierOutstanding,
  getSupplierLedger,
  getSupplierAgeing,
  getSupplierReconciliationReport,
  reconcileSupplierBalance,
  markInvoicePaidIfSettled,
} from "./supplierReportingService";
