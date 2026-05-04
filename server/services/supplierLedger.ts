import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";

export async function recordSupplierPayable(db: any, input: { supplierId: number; purchaseInvoiceId: number; storeId: number; amount: number; actorId: number; actorRole: string; source: string }, ctx?: any) {
  const { supplierPayments } = await import("../../drizzle/schema");
  const [existing] = await db.select().from(supplierPayments).where(and(eq(supplierPayments.purchaseInvoiceId, input.purchaseInvoiceId), eq(supplierPayments.paymentMode, "credit" as any))).limit(1);
  if (existing) return { idempotent: true, paymentId: existing.id };
  const [res] = await db.insert(supplierPayments).values({ supplierId: input.supplierId, purchaseInvoiceId: input.purchaseInvoiceId, storeId: input.storeId, amount: String(input.amount), paymentMode: "credit", paymentDate: new Date(), notes: "Auto payable entry", createdBy: input.actorId });
  const id = (res as any).insertId;
  await logAudit({ action: "supplier.payable.created", entityType: "purchase_invoice", entityId: input.purchaseInvoiceId, afterJson: { amount: input.amount, paymentId: id } }, ctx);
  return { success: true, paymentId: id };
}

export async function recordSupplierPayment(db: any, input: any, ctx?: any) {
  const { supplierPayments } = await import("../../drizzle/schema");
  const [res] = await db.insert(supplierPayments).values(input);
  const id = (res as any).insertId;
  await logAudit({ action: "supplier.payment.recorded", entityType: "supplier_payment", entityId: id, afterJson: input }, ctx);
  return { id };
}

export async function allocatePaymentToInvoice(db: any, input: { supplierPaymentId: number; purchaseInvoiceId?: number; purchaseReturnId?: number; amount: number; allocationType: "invoice_payment" | "advance_applied" | "debit_note" | "return_credit" | "adjustment"; createdBy?: number }, ctx?: any) {
  const { supplierPaymentAllocations } = await import("../../drizzle/schema");
  const [existing] = await db.select().from(supplierPaymentAllocations).where(and(eq(supplierPaymentAllocations.supplierPaymentId, input.supplierPaymentId), input.purchaseInvoiceId ? eq(supplierPaymentAllocations.purchaseInvoiceId, input.purchaseInvoiceId) : isNull(supplierPaymentAllocations.purchaseInvoiceId), eq(supplierPaymentAllocations.allocationType, input.allocationType))).limit(1);
  if (existing) return { idempotent: true, allocationId: existing.id };
  const [res] = await db.insert(supplierPaymentAllocations).values({ supplierPaymentId: input.supplierPaymentId, purchaseInvoiceId: input.purchaseInvoiceId ?? null, purchaseReturnId: input.purchaseReturnId ?? null, amount: String(input.amount), allocationType: input.allocationType, createdBy: input.createdBy ?? null });
  const id = (res as any).insertId;
  await logAudit({ action: "supplier.payment.allocated", entityType: "supplier_payment", entityId: input.supplierPaymentId, afterJson: { ...input, allocationId: id } }, ctx);
  return { success: true, allocationId: id };
}

export async function allocateSupplierPayment(db: any, input: { supplierPaymentId: number; supplierId: number; invoiceIds?: number[]; createdBy?: number }, ctx?: any) {
  const { purchaseInvoices } = await import("../../drizzle/schema");
  const invoices = input.invoiceIds?.length ? await db.select().from(purchaseInvoices).where(inArray(purchaseInvoices.id, input.invoiceIds)) : [];
  let remaining = await getUnallocatedPaymentAmount(db, input.supplierPaymentId);
  const allocations = [] as any[];
  for (const inv of invoices) {
    if (remaining <= 0) break;
    const out = await getInvoiceOutstanding(db, inv.id);
    if (out <= 0) continue;
    const applied = Math.min(remaining, out);
    const alloc = await allocatePaymentToInvoice(db, { supplierPaymentId: input.supplierPaymentId, purchaseInvoiceId: inv.id, amount: applied, allocationType: "invoice_payment", createdBy: input.createdBy }, ctx);
    allocations.push({ invoiceId: inv.id, amount: applied, ...alloc });
    remaining -= applied;
  }
  return { success: true, allocations, unallocated: remaining };
}

export async function recordSupplierAdvance(db: any, input: { supplierId: number; storeId: number; amount: number; createdBy: number; referenceNo?: string }, ctx?: any) {
  const payment = await recordSupplierPayment(db, { supplierId: input.supplierId, storeId: input.storeId, purchaseInvoiceId: null, amount: String(input.amount), paymentMode: "advance", referenceNo: input.referenceNo ?? null, notes: "supplier advance", createdBy: input.createdBy }, ctx);
  return { ...payment, advance: true };
}

export async function applySupplierDebitNote(db: any, input: { supplierId: number; purchaseInvoiceId?: number; storeId: number; amount: number; createdBy: number; reason?: string }, ctx?: any) {
  const payment = await recordSupplierPayment(db, { supplierId: input.supplierId, storeId: input.storeId, purchaseInvoiceId: input.purchaseInvoiceId ?? null, amount: String(input.amount), paymentMode: "debit_note", notes: input.reason ?? "debit note", createdBy: input.createdBy }, ctx);
  await allocatePaymentToInvoice(db, { supplierPaymentId: payment.id, purchaseInvoiceId: input.purchaseInvoiceId, amount: input.amount, allocationType: "debit_note", createdBy: input.createdBy }, ctx);
  return payment;
}

export async function applyPurchaseReturnCredit(db: any, input: { supplierId: number; purchaseInvoiceId: number; purchaseReturnId: number; storeId: number; amount: number; createdBy: number }, ctx?: any) {
  const payment = await recordSupplierPayment(db, { supplierId: input.supplierId, storeId: input.storeId, purchaseInvoiceId: input.purchaseInvoiceId, amount: String(input.amount), paymentMode: "return_credit", notes: `purchase return credit:${input.purchaseReturnId}`, createdBy: input.createdBy }, ctx);
  await allocatePaymentToInvoice(db, { supplierPaymentId: payment.id, purchaseInvoiceId: input.purchaseInvoiceId, purchaseReturnId: input.purchaseReturnId, amount: input.amount, allocationType: "return_credit", createdBy: input.createdBy }, ctx);
  return payment;
}

async function getUnallocatedPaymentAmount(db: any, supplierPaymentId: number) {
  const { supplierPayments, supplierPaymentAllocations } = await import("../../drizzle/schema");
  const [p] = await db.select().from(supplierPayments).where(eq(supplierPayments.id, supplierPaymentId));
  if (!p) return 0;
  const [a] = await db.select({ allocated: sql<number>`coalesce(sum(${supplierPaymentAllocations.amount}),0)` }).from(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.supplierPaymentId, supplierPaymentId));
  return Number(p.amount ?? 0) - Number(a?.allocated ?? 0);
}

async function getInvoiceOutstanding(db: any, purchaseInvoiceId: number) {
  const { purchaseInvoices, supplierPaymentAllocations } = await import("../../drizzle/schema");
  const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, purchaseInvoiceId));
  if (!inv) return 0;
  const [a] = await db.select({ allocated: sql<number>`coalesce(sum(${supplierPaymentAllocations.amount}),0)` }).from(supplierPaymentAllocations).where(eq(supplierPaymentAllocations.purchaseInvoiceId, purchaseInvoiceId));
  return Number(inv.netAmount ?? 0) - Number(a?.allocated ?? 0);
}

export async function getSupplierOutstanding(db: any, supplierId: number) {
  const { purchaseInvoices, supplierPaymentAllocations, supplierPayments } = await import("../../drizzle/schema");
  const [p] = await db.select({ payables: sql<number>`coalesce(sum(case when ${purchaseInvoices.status}='committed' then ${purchaseInvoices.netAmount} else 0 end),0)` }).from(purchaseInvoices).where(eq(purchaseInvoices.supplierId, supplierId));
  const [applied] = await db.select({ allocated: sql<number>`coalesce(sum(${supplierPaymentAllocations.amount}),0)` }).from(supplierPaymentAllocations)
    .innerJoin(supplierPayments, eq(supplierPaymentAllocations.supplierPaymentId, supplierPayments.id))
    .where(eq(supplierPayments.supplierId, supplierId));
  return { supplierId, outstanding: Number(p?.payables ?? 0) - Number(applied?.allocated ?? 0), payables: Number(p?.payables ?? 0), allocated: Number(applied?.allocated ?? 0) };
}

export async function getSupplierLedger(db: any, supplierId: number) {
  const { supplierPayments } = await import("../../drizzle/schema");
  const rows = await db.select().from(supplierPayments).where(eq(supplierPayments.supplierId, supplierId));
  return rows.map((r: any) => ({ ...r, transactionType: r.paymentMode === "credit" ? "invoice_payable" : r.paymentMode }));
}
export async function getSupplierAgeing(db: any, supplierId: number) { const { purchaseInvoices } = await import("../../drizzle/schema"); const rows = await db.select().from(purchaseInvoices).where(and(eq(purchaseInvoices.supplierId, supplierId), inArray(purchaseInvoices.status, ["committed", "partially_returned"] as any))); return { rows, totals: { count: rows.length }, csvData: rows }; }
export async function reconcileSupplierBalance(db: any, supplierId: number) { return getSupplierOutstanding(db, supplierId); }

export async function markInvoicePaidIfSettled(db: any, purchaseInvoiceId: number) {
  const { purchaseInvoices } = await import("../../drizzle/schema");
  const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, purchaseInvoiceId));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
  const outstanding = await getInvoiceOutstanding(db, purchaseInvoiceId);
  if (outstanding <= 0) {
    await db.update(purchaseInvoices).set({ paymentStatus: "paid" }).where(eq(purchaseInvoices.id, purchaseInvoiceId));
    return { settled: true };
  }
  return { settled: false };
}
