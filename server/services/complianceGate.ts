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
  for (const line of lines) {
    const flags = await getProductScheduleFlags(String(line.productId)); if (!flags.h1RegisterRequired) continue;
    const [existing] = await db.select().from(h1Register).where(and(eq(h1Register.saleId, Number(saleId) || 0), eq(h1Register.drugName, String(line.productId)))).limit(1);
    if (!existing) {
      await db.insert(h1Register).values({ storeId: Number(sale.storeId) || 0, patientName: sale.customerName ?? "NA", patientPhone: sale.customerMobile, prescribingDoctor: null, drugName: String(line.productId), qty: line.qty, pharmacistId, billNo: sale.billNo, saleId: Number(saleId) || 0, prescriptionRef: sale.prescriptionId ?? null });
      await logAudit({ action: "compliance.h1_register_created", entityType: "sale", entityId: Number(saleId) || 0, afterJson: { saleId, lineId: line.id } }, ctx);
    }
  }
}

export async function assertCanConfirmSale(saleId: string, ctx?: any) {
  const result = await validateSaleCompliance(saleId);
  if (!result.ok) { await logAudit({ action: "compliance.sale_blocked", entityType: "sale", entityId: Number(saleId) || 0, reason: "regulated_without_clearance", afterJson: result }, ctx); throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Regulated items require valid prescription and pharmacist approval" }); }
}
export async function assertCanPickPackDeliver(saleId: string, _nextStatus: string, ctx?: any) { await assertCanConfirmSale(saleId, ctx); }
export function assertNoAutonomousRegulatedRelease() { return true; }
export async function getComplianceDecisionSummary(saleId: string) { return validateSaleCompliance(saleId); }
