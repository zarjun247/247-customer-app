import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

export function requirePurchase(role: string | null | undefined) {
  const allowed = [
    "admin",
    "super_admin",
    "store_manager",
    "purchase_manager",
    "pharmacist",
    "inventory_operator",
  ];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Purchase access required",
    });
}

export function requireManager(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager", "purchase_manager"];
  if (!role || !allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager role required",
    });
}

export function calcGst(
  purchaseRate: number,
  gstRate: number,
  qty: number,
  schemeDiscount: number,
  cashDiscount: number
) {
  const baseAmount = purchaseRate * qty;
  const schemeDis = baseAmount * (schemeDiscount / 100);
  const cashDis = (baseAmount - schemeDis) * (cashDiscount / 100);
  const taxableAmount = baseAmount - schemeDis - cashDis;
  const gstAmount = taxableAmount * (gstRate / 100);
  const landingCost = qty > 0 ? (taxableAmount + gstAmount) / qty : 0;
  return {
    baseAmount: +baseAmount.toFixed(2),
    schemeDis: +schemeDis.toFixed(2),
    cashDis: +cashDis.toFixed(2),
    taxableAmount: +taxableAmount.toFixed(2),
    gstAmount: +gstAmount.toFixed(2),
    landingCost: +landingCost.toFixed(2),
  };
}

export function _computeExpiryBucket(
  expiryDate: Date | string | null
): "normal" | "warning" | "critical" | "quarantine_candidate" | "expired" {
  if (!expiryDate) return "normal";
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return "expired";
  if (days <= 30) return "quarantine_candidate";
  if (days <= 60) return "critical";
  if (days <= 90) return "warning";
  return "normal";
}

export async function recalcInvoiceTotals(
  db: Awaited<ReturnType<typeof getDbSafe>>,
  invoiceId: number
) {
  const { purchaseLines, purchaseInvoices } = await import(
    "../../drizzle/schema"
  );
  const lines = await db
    .select()
    .from(purchaseLines)
    .where(eq(purchaseLines.purchaseInvoiceId, invoiceId));
  let totalAmount = 0,
    totalGst = 0,
    totalDiscount = 0;
  for (const l of lines) {
    const pr = parseFloat(l.purchaseRate ?? "0");
    const gr = parseFloat(l.gstRate ?? "12");
    const sd = parseFloat(l.schemeDiscount ?? "0");
    const cd = parseFloat(l.cashDiscount ?? "0");
    const { gstAmount, schemeDis, cashDis } = calcGst(pr, gr, l.qty, sd, cd);
    totalAmount += pr * l.qty;
    totalGst += gstAmount;
    totalDiscount += schemeDis + cashDis;
  }
  const netAmount = totalAmount - totalDiscount + totalGst;
  await db
    .update(purchaseInvoices)
    .set({
      totalAmount: totalAmount.toFixed(2),
      totalGst: totalGst.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      netAmount: netAmount.toFixed(2),
    })
    .where(eq(purchaseInvoices.id, invoiceId));
}
