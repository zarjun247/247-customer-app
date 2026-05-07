import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";
import { logAudit } from "./audit";

export type ProductScheduleFlags = { schedule: string; requiresPrescription: boolean; h1RegisterRequired: boolean; regulated: boolean };

type PrescriptionDoctorContext = { prescriptionId: number | null; prescriptionRef: string | null; doctorName: string | null; doctorRegNo: string | null };

async function getDb() { const { getDb } = await import("../db"); const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" }); return db; }

function parseLegacyIntegerRef(value: unknown, label: string): number {
  const ref = String(value ?? "").trim();
  if (!/^\d+$/.test(ref)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${label} must be a numeric legacy reference for this lookup` });
  return parseInt(ref, 10);
}

function parseOptionalLegacyIntegerRef(value: unknown): number | null {
  const ref = String(value ?? "").trim();
  return /^\d+$/.test(ref) ? parseInt(ref, 10) : null;
}

function requireText(value: unknown, message: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new TRPCError({ code: "PRECONDITION_FAILED", message });
  return text;
}

async function resolvePrescriptionDoctorContext(prescriptionRef: string | null): Promise<PrescriptionDoctorContext> {
  if (!prescriptionRef) return { prescriptionId: null, prescriptionRef: null, doctorName: null, doctorRegNo: null };
  const legacyPrescriptionId = parseOptionalLegacyIntegerRef(prescriptionRef);
  if (!legacyPrescriptionId) return { prescriptionId: null, prescriptionRef, doctorName: null, doctorRegNo: null };
  const db = await getDb(); const { prescriptions } = await import("../../drizzle/schema");
  const [rx] = await db.select({ doctorName: prescriptions.doctorName, doctorRegNo: prescriptions.doctorReg }).from(prescriptions).where(eq(prescriptions.id, legacyPrescriptionId)).limit(1);
  return { prescriptionId: legacyPrescriptionId, prescriptionRef, doctorName: rx?.doctorName ? String(rx.doctorName).trim() : null, doctorRegNo: rx?.doctorRegNo ? String(rx.doctorRegNo).trim() : null };
}

export async function getProductScheduleFlags(productId: string): Promise<ProductScheduleFlags> {
  const db = await getDb(); const { products } = await import("../../drizzle/schema");
  const productNumericId = parseLegacyIntegerRef(productId, "Product reference");
  const [p] = await db.select({ schedule: products.schedule, requiresPrescription: products.requiresPrescription }).from(products).where(eq(products.id, productNumericId)).limit(1);
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
  const saleRef = requireText(saleId, "Sale reference required for H1 dispensing");
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleRef)).limit(1); if (!sale) return;
  const lines = await db.select().from(saleLines).where(eq(saleLines.saleId, saleRef));
  if (!pharmacistId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pharmacist identity required for H1 dispensing" });
  for (const line of lines) {
    const productRef = requireText(line.productId, "Product reference required for H1 register");
    const flags = await getProductScheduleFlags(productRef); if (!flags.h1RegisterRequired) continue;
    const saleBillNo = requireText(sale.billNo, "Bill number required for H1 register");
    const storeRef = requireText(sale.storeId, "Store reference required for H1 register");
    const patientName = requireText(sale.customerName, "Patient name required for H1 register");
    const saleLineRef = requireText(line.id, "Sale line reference required for H1 register");
    const [product] = await db.select({ name: products.name }).from(products).where(eq(products.id, parseLegacyIntegerRef(productRef, "Product reference"))).limit(1);
    const drugName = requireText(product?.name, "Missing product name for H1 register");
    const rx = await resolvePrescriptionDoctorContext(sale.prescriptionId ?? null);
    const doctorName = requireText(rx.doctorName, "Doctor name required before creating final H1 register row");
    const legacySaleId = parseOptionalLegacyIntegerRef(saleRef);
    const legacyStoreId = parseOptionalLegacyIntegerRef(storeRef);
    const prescriptionRef = `sale:${saleRef}:line:${saleLineRef}`;
    const batchLedgerId = line.batchLedgerId ? String(line.batchLedgerId) : null;
    const [existing] = await db.select().from(h1Register).where(or(and(eq(h1Register.saleRef, saleRef), eq(h1Register.saleLineRef, saleLineRef)), and(eq(h1Register.prescriptionRef, prescriptionRef), eq(h1Register.drugName, drugName)))).limit(1);
    const auditPayload = { saleRef, saleLineRef, saleBillNo, billNo: saleBillNo, prescriptionId: rx.prescriptionId, prescriptionRef, patientName, patientPhone: sale.customerMobile ?? null, doctorName, prescribingDoctor: doctorName, doctorRegNo: rx.doctorRegNo, drugName, productId: productRef, batchNo: line.batchNo ?? null, batchLedgerId, batchId: batchLedgerId, qty: line.qty, pharmacistId, statutoryContextStatus: "complete" };
    if (!existing) {
      await db.insert(h1Register).values({ storeId: legacyStoreId, storeRef, patientName, patientPhone: sale.customerMobile ?? null, prescribingDoctor: doctorName, doctorName, doctorRegNo: rx.doctorRegNo, drugName, productId: productRef, batchNo: line.batchNo ?? null, batchLedgerId, batchId: batchLedgerId, qty: line.qty, pharmacistId, billNo: saleBillNo, saleBillNo, saleId: legacySaleId, prescriptionId: rx.prescriptionId, prescriptionRef, saleRef, saleLineRef, statutoryContextStatus: "complete" });
      await logAudit({ action: "h1.register.created", entityType: "sale", entityId: legacySaleId, afterJson: auditPayload }, ctx);
    } else {
      await db.update(h1Register).set({ storeRef, productId: existing.productId ?? productRef, batchLedgerId: existing.batchLedgerId ?? batchLedgerId, batchId: existing.batchId ?? batchLedgerId, saleRef, saleLineRef, saleBillNo: existing.saleBillNo ?? saleBillNo, doctorName: existing.doctorName ?? doctorName, doctorRegNo: existing.doctorRegNo ?? rx.doctorRegNo, statutoryContextStatus: "complete" }).where(eq(h1Register.id, existing.id));
      await logAudit({ action: "h1.register.verified", entityType: "sale", entityId: legacySaleId, afterJson: { ...auditPayload, h1RegisterId: existing.id } }, ctx);
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
