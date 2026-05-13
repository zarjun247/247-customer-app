import { TRPCError } from "@trpc/server";
import { and as _and, desc, eq, sql } from "drizzle-orm";
import { logAudit } from "./audit";
import type { CtxLike } from "./audit";

interface SaleLine {
  productId: string | number;
  batchLedgerId?: string | number | null;
  saleRate: string | number;
  qty: string | number;
  discountAmount?: string | number | null;
}
interface SaleLike {
  subtotal?: string | number | null;
  gstAmount?: string | number | null;
  notes?: string | null;
}

async function getDb() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

export async function getLineCostBasis(
  productId: string,
  batchLedgerId?: string | null
) {
  const db = await getDb();
  const { batchLedger, productSupplierMappings } = await import(
    "../../drizzle/schema"
  );
  if (batchLedgerId) {
    const [b] = await db
      .select()
      .from(batchLedger)
      .where(eq(batchLedger.id, Number(batchLedgerId)))
      .limit(1);
    if (b) return Number(b.landingCost ?? b.purchaseRate ?? 0);
  }
  const [m] = await db
    .select()
    .from(productSupplierMappings)
    .where(eq(productSupplierMappings.productId, Number(productId)))
    .orderBy(desc(productSupplierMappings.id))
    .limit(1);
  return Number(m?.lastPurchaseRate ?? 0);
}
export async function calculateLineGrossMargin(line: SaleLine) {
  const cost = await getLineCostBasis(
    String(line.productId),
    line.batchLedgerId != null ? String(line.batchLedgerId) : null
  );
  const revenue =
    Number(line.saleRate) * Number(line.qty) - Number(line.discountAmount ?? 0);
  const cogs = cost * Number(line.qty);
  const marginAmt = revenue - cogs;
  const marginPct = revenue > 0 ? (marginAmt / revenue) * 100 : 0;
  return { costPerUnit: cost, revenue, cogs, marginAmt, marginPct };
}
export async function calculateSaleMargin(lines: SaleLine[]) {
  const vals = await Promise.all(lines.map(calculateLineGrossMargin));
  const revenue = vals.reduce((a, v) => a + v.revenue, 0);
  const cogs = vals.reduce((a, v) => a + v.cogs, 0);
  const marginAmt = revenue - cogs;
  return {
    revenue,
    cogs,
    marginAmt,
    marginPct: revenue > 0 ? (marginAmt / revenue) * 100 : 0,
  };
}

export async function validateDiscountCode(code: string, sale: SaleLike) {
  const db = await getDb();
  const { discountCodes } = await import("../../drizzle/schema");
  const [dc] = await db
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.code, code.toUpperCase()))
    .limit(1);
  if (!dc) return { valid: false, reason: "Invalid discount code" };
  const now = new Date();
  if (!dc.isActive) return { valid: false, reason: "Discount code inactive" };
  if (dc.startsAt && now < new Date(dc.startsAt))
    return { valid: false, reason: "Discount code not started" };
  if (dc.endsAt && now > new Date(dc.endsAt))
    return { valid: false, reason: "Discount code expired" };
  if (
    dc.usageLimit !== null &&
    dc.usageLimit !== undefined &&
    (dc.usedCount ?? 0) >= dc.usageLimit
  )
    return { valid: false, reason: "Discount code usage limit reached" };
  if (Number(sale.subtotal ?? 0) < Number(dc.minOrderAmount ?? 0))
    return { valid: false, reason: "Minimum order not met" };
  return { valid: true, code: dc };
}

export async function applyDiscountCode(
  saleId: string,
  code: string,
  ctx?: CtxLike
) {
  const db = await getDb();
  const { sales, discountCodes: _discountCodes } = await import(
    "../../drizzle/schema"
  );
  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  if (!sale)
    throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found" });
  const check = await validateDiscountCode(code, sale);
  if (!check.valid) {
    await logAudit(
      {
        action: "discount.code_rejected",
        entityType: "sale",
        entityId: null,
        entityRef: saleId,
        reason: check.reason,
      },
      ctx
    );
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: check.reason });
  }
  const dc = check.code!;
  const subtotal = Number(sale.subtotal ?? 0);
  let discount =
    dc.discountType === "percentage"
      ? subtotal * (Number(dc.value) / 100)
      : Number(dc.value);
  if (dc.maxDiscountAmount !== null && dc.maxDiscountAmount !== undefined)
    discount = Math.min(discount, Number(dc.maxDiscountAmount));
  discount = Math.max(0, Number(discount.toFixed(2)));
  const total = Math.max(
    0,
    Number((subtotal - discount + Number(sale.gstAmount ?? 0)).toFixed(2))
  );
  await db
    .update(sales)
    .set({
      discountAmount: String(discount),
      total: String(total),
      notes: `${sale.notes ?? ""} [discountCode:${dc.code}]`,
      updatedAt: Date.now(),
    })
    .where(eq(sales.id, saleId));
  await logAudit(
    {
      action: "discount.code_validated",
      entityType: "sale",
      entityId: null,
      entityRef: saleId,
      afterJson: { code: dc.code, discount, total },
    },
    ctx
  );
  return { codeId: dc.id, code: dc.code, discountAmount: discount, total };
}

export async function recordDiscountCodeUsage(
  codeId: number,
  saleId: string,
  ctx?: CtxLike
) {
  const db = await getDb();
  const { discountCodes } = await import("../../drizzle/schema");
  await db
    .update(discountCodes)
    .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
    .where(eq(discountCodes.id, codeId));
  await logAudit(
    {
      action: "discount.code_applied",
      entityType: "sale",
      entityId: null,
      entityRef: saleId,
      afterJson: { codeId },
    },
    ctx
  );
}

export function assertDiscountWithinCaps(
  discountAmount: number,
  subtotal: number,
  maxPct = 22
) {
  const pct = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
  if (pct > maxPct)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Discount exceeds cap of ${maxPct}%`,
    });
}
export function requiresMarginOverrideApproval(
  marginPct: number,
  minMarginPct = 8
) {
  return marginPct < minMarginPct;
}
export async function recordMarginOverrideRequest(
  saleId: string,
  reason: string,
  ctx?: CtxLike
) {
  await logAudit(
    {
      action: "margin.override_requested",
      entityType: "sale",
      entityId: null,
      entityRef: saleId,
      reason,
    },
    ctx
  );
  return { saleId, status: "requested" as const };
}
export async function approveMarginOverride(
  saleId: string,
  approvedBy: number,
  reason: string,
  ctx?: CtxLike
) {
  await logAudit(
    {
      action: "margin.override_approved",
      entityType: "sale",
      entityId: null,
      entityRef: saleId,
      actorId: approvedBy,
      reason,
    },
    ctx
  );
  return { saleId, approved: true };
}
export async function assertNoLossWithoutApproval(
  saleId: string,
  role?: string | null,
  ctx?: CtxLike
) {
  const db = await getDb();
  const { saleLines } = await import("../../drizzle/schema");
  const lines = await db
    .select()
    .from(saleLines)
    .where(eq(saleLines.saleId, saleId));
  const margin = await calculateSaleMargin(lines);
  const needs =
    requiresMarginOverrideApproval(margin.marginPct) || margin.marginAmt < 0;
  if (
    needs &&
    !["admin", "super_admin", "store_manager"].includes(String(role ?? ""))
  ) {
    await logAudit(
      {
        action: "margin.sale_blocked",
        entityType: "sale",
        entityId: null,
        entityRef: saleId,
        reason: `margin ${margin.marginPct.toFixed(2)}%`,
      },
      ctx
    );
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Sale margin below allowed threshold. Manager/admin approval required.",
    });
  }
}
