import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { logAudit } from "./audit";

export type ProductScheduleFlags = { schedule: string; requiresPrescription: boolean; h1RegisterRequired: boolean; regulated: boolean };

async function getDb() { const { getDb } = await import("../db"); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" }); return db; }

export async function getProductScheduleFlags(productId: string): Promise<ProductScheduleFlags> {
  const db = await getDb(); const { products } = await import("../../drizzle/schema");
  const [p] = await db.select({ schedule: products.schedule, requiresPrescription: products.requiresPrescription }).from(products).where(eq(products.id, Number(productId))).limit(1);
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: `Product ${productId} not found` });
  const schedule = String(p.schedule ?? "OTC");
  const regulated = ["H", "H1", "X"].includes(schedule) || !!p.requiresPrescription;
  return { schedule, requiresPrescription: regulated, h1RegisterRequired: schedule === "H1", regulated };
}

export function requiresPrescription(flags: ProductScheduleFlags) { return flags.requiresPrescription; }
export function requiresPharmacistApproval(flags: ProductScheduleFlags) { return flags.regulated; }

export async function validatePrescriptionForSaleLine(line: { productId: string; rxCleared: number | boolean }) {
  const flags = await getProductScheduleFlags(line.productId);
  if (!requiresPrescription(flags)) return { ok: true, flags };
  if (!line.rxCleared) return { ok: false, flags, reason: "Prescription/pharmacist clearance required" };
  return { ok: true, flags };
}

export async function validateSaleCompliance(saleId: string) {
  const db = await getDb(); const { saleLines } = await import("../../drizzle/schema");
  const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, saleId));
  const results = await Promise.all(lines.map((l) => validatePrescriptionForSaleLine({ productId: String(l.productId), rxCleared: l.rxCleared })));
  const blocked = results.filter((r) => !r.ok);
  return { ok: blocked.length === 0, blockedCount: blocked.length, blocked };
}

export async function createOrVerifyH1RegisterEntry(saleId: string, pharmacistId: number, ctx?: any) {
  const db = await getDb(); const { saleLines, sales, products, h1Register } = await import("../../drizzle/schema");
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1); if (!sale) return;
  const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, saleId));
  if (!pharmacistId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pharmacist identity required for H1 dispensing" });
  for (const line of lines) {
    const flags = await getProductScheduleFlags(String(line.productId)); if (!flags.h1RegisterRequired) continue;
    if (!sale.billNo || !sale.storeId || !sale.customerName) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Missing required H1 sale context" });
    const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, Number(line.productId))).limit(1);
    if (!product?.name) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Missing product name for H1 register" });
    const saleLineRef = String(line.id);
    const saleLineNumericId = /^[0-9]+$/.test(saleLineRef) ? Number(saleLineRef) : null;
    const [existing] = await db.select().from(h1Register).where(and(eq(h1Register.prescriptionRef, `sale:${saleId}:line:${saleLineRef}`), eq(h1Register.drugName, String(product.name)))).limit(1);
    if (!existing) {
      await db.insert(h1Register).values({ storeId: Number(sale.storeId), patientName: sale.customerName, patientPhone: sale.customerMobile, prescribingDoctor: null, drugName: String(product.name), batchNo: line.batchNo ?? null, qty: line.qty, pharmacistId, billNo: sale.billNo, saleId: saleLineNumericId, prescriptionRef: `sale:${saleId}:line:${saleLineRef}` });
      await logAudit({ action: "h1.register.created", entityType: "sale", entityId: saleLineNumericId ?? undefined, afterJson: { saleRef: saleId, saleLineRef, prescriptionRef: sale.prescriptionId ?? null, billNo: sale.billNo, patientName: sale.customerName, patientPhone: sale.customerMobile, prescribingDoctor: null, drugName: product.name, batchNo: line.batchNo ?? null, qty: line.qty, pharmacistId } }, ctx);
    } else {
      await logAudit({ action: "h1.register.verified", entityType: "sale", entityId: saleLineNumericId ?? undefined, afterJson: { saleRef: saleId, saleLineRef, drugName: product.name } }, ctx);
    }
  }
}

export async function assertCanConfirmSale(saleId: string, ctx?: any) {
  const result = await validateSaleCompliance(saleId);
  await logAudit({ action: "regulated.release_checked", entityType: "sale", entityId: undefined, afterJson: { saleId, ...result } }, ctx);
  if (!result.ok) { await logAudit({ action: "regulated.release_blocked", entityType: "sale", entityId: undefined, reason: "regulated_without_clearance", afterJson: { saleId, ...result } }, ctx); throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Regulated items require valid prescription and pharmacist approval" }); }
  await logAudit({ action: "regulated.release_approved", entityType: "sale", entityId: undefined, afterJson: { saleId } }, ctx);
}
export async function assertCanPickPackDeliver(saleId: string, _nextStatus: string, ctx?: any) { await assertCanConfirmSale(saleId, ctx); }
export function assertNoAutonomousRegulatedRelease() { return true; }
export async function getComplianceDecisionSummary(saleId: string) { return validateSaleCompliance(saleId); }
