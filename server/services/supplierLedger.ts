import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";

export async function recordSupplierPayable(db: any, input: { supplierId: number; purchaseInvoiceId: number; storeId: number; amount: number; actorId: number; actorRole: string; source: string }, ctx?: any) {
  const { supplierPayments } = await import("../../drizzle/schema");
  const [existing] = await db.select().from(supplierPayments).where(and(eq(supplierPayments.purchaseInvoiceId, input.purchaseInvoiceId), eq(supplierPayments.paymentMode, "credit" as any))).limit(1);
  if (existing) return { idempotent: true };
  await db.insert(supplierPayments).values({ supplierId: input.supplierId, purchaseInvoiceId: input.purchaseInvoiceId, storeId: input.storeId, amount: String(input.amount), paymentMode: "credit", paymentDate: new Date(), notes: "Auto payable entry", createdBy: input.actorId });
  await logAudit({ action: "supplier.payable.created", entityType: "purchase_invoice", entityId: input.purchaseInvoiceId, afterJson: { amount: input.amount } }, ctx);
  return { success: true };
}

export async function recordSupplierPayment(db: any, input: any, ctx?: any) { const { supplierPayments } = await import("../../drizzle/schema"); const [res] = await db.insert(supplierPayments).values(input); const id = (res as any).insertId; await logAudit({ action: "supplier.payment.recorded", entityType: "supplier_payment", entityId: id, afterJson: input }, ctx); return { id }; }
export async function allocateSupplierPayment() { return { success: true, mode: "direct_or_manual" }; }
export async function getSupplierOutstanding(db: any, supplierId: number) { const { purchaseInvoices, supplierPayments } = await import("../../drizzle/schema"); const [p] = await db.select({ payables: sql<number>`coalesce(sum(case when ${purchaseInvoices.status}='committed' then ${purchaseInvoices.netAmount} else 0 end),0)` }).from(purchaseInvoices).where(eq(purchaseInvoices.supplierId, supplierId)); const [paid] = await db.select({ paid: sql<number>`coalesce(sum(case when ${supplierPayments.paymentMode}!='credit' then ${supplierPayments.amount} else 0 end),0)` }).from(supplierPayments).where(eq(supplierPayments.supplierId, supplierId)); return { supplierId, outstanding: Number(p?.payables ?? 0) - Number(paid?.paid ?? 0) }; }
export async function getSupplierLedger(db: any, supplierId: number) { const { supplierPayments } = await import("../../drizzle/schema"); return db.select().from(supplierPayments).where(eq(supplierPayments.supplierId, supplierId)); }
export async function reconcileSupplierBalance(db: any, supplierId: number) { return getSupplierOutstanding(db, supplierId); }
export async function markInvoicePaidIfSettled(db: any, purchaseInvoiceId: number) { const { purchaseInvoices, supplierPayments } = await import("../../drizzle/schema"); const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, purchaseInvoiceId)); if (!inv) throw new TRPCError({ code: "NOT_FOUND" }); const [paid] = await db.select({ amount: sql<number>`coalesce(sum(case when ${supplierPayments.paymentMode}!='credit' then ${supplierPayments.amount} else 0 end),0)` }).from(supplierPayments).where(eq(supplierPayments.purchaseInvoiceId, purchaseInvoiceId)); if (Number(paid?.amount ?? 0) >= Number(inv.netAmount ?? 0)) { await db.update(purchaseInvoices).set({ paymentStatus: "paid" }).where(eq(purchaseInvoices.id, purchaseInvoiceId)); return { settled: true }; } return { settled: false }; }
