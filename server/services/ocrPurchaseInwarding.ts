import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";
import { recordSupplierPayable } from "./supplierLedger";

export type OcrLineInput = { itemName: string; manufacturer?: string | null; barcode?: string | null; supplierSku?: string | null; productCode?: string | null; qty: number; freeQty?: number; mrp: number; purchaseRate: number; gstRate?: number; batchNo?: string | null; expiryDate?: string | null; confidence?: number; rawText?: string | null; };

export async function createOcrJob(db: any, payload: { storeId: number; fileUrl: string; fileKey: string; filename: string; mimeType: string; sourceType?: string; createdBy: number; supplierHint?: string | null; }, ctx?: any) {
  const { ingestionJobs } = await import("../../drizzle/schema");
  const [job] = await db.insert(ingestionJobs).values({ ...payload, sourceType: payload.sourceType ?? "upload", jobType: "purchase_bill", status: "queued" }).$returningId();
  await logAudit({ action: "ocr.job.created", entityType: "ingestion_job", entityId: job.id, afterJson: payload }, ctx);
  return job;
}

export async function parseSupplierBill(rawText?: string) { return { provider: process.env.OCR_PROVIDER ?? "mock", rawText: rawText ?? "" }; }

export function normalizeOcrLine(line: OcrLineInput): OcrLineInput { return { ...line, itemName: line.itemName.trim().replace(/\s+/g, " "), manufacturer: line.manufacturer?.trim() ?? null, confidence: Math.max(0, Math.min(100, line.confidence ?? 0)), freeQty: line.freeQty ?? 0, gstRate: line.gstRate ?? 12, rawText: line.rawText ?? null }; }

export async function matchSupplier(db: any, supplierName?: string | null, supplierGstin?: string | null) { const { suppliers } = await import("../../drizzle/schema"); if (supplierGstin) { const [byGstin] = await db.select().from(suppliers).where(eq(suppliers.gstin, supplierGstin)).limit(1); if (byGstin) return byGstin; } if (supplierName) { const [byName] = await db.select().from(suppliers).where(ilike(suppliers.supplierName, supplierName)).limit(1); if (byName) return byName; } return null; }

export async function matchProductOrCreateDraft(db: any, line: OcrLineInput, supplierId?: number | null) {
  const { products, productSupplierMappings } = await import("../../drizzle/schema");
  if (line.barcode) { const [p] = await db.select().from(products).where(eq(products.barcode, line.barcode)).limit(1); if (p) return { productId: p.id, confidence: 100, reason: "barcode_exact" }; }
  if (line.productCode) { const [p] = await db.select().from(products).where(eq(products.companyCode, line.productCode)).limit(1); if (p) return { productId: p.id, confidence: 98, reason: "sku_exact" }; }
  if (supplierId && line.supplierSku) { const [m] = await db.select().from(productSupplierMappings).where(and(eq(productSupplierMappings.supplierId, supplierId), eq(productSupplierMappings.supplierProductCode, line.supplierSku))).limit(1); if (m) return { productId: m.productId, confidence: 96, reason: "supplier_mapping" }; }
  const matches = await db.select({ id: products.id, name: products.name }).from(products).where(ilike(products.name, `%${line.itemName.split(" ")[0]}%`)).limit(5);
  if (matches.length === 1) return { productId: matches[0].id, confidence: 74, reason: "name_fallback" };
  return { productId: null, confidence: 0, reason: "draft_required" };
}

export async function detectPriceChange(db: any, productId: number, nextPurchaseRate: number) { const { purchaseLines } = await import("../../drizzle/schema"); const [x] = await db.select({ avgRate: sql<number>`avg(${purchaseLines.purchaseRate})` }).from(purchaseLines).where(eq(purchaseLines.productId, productId)); const baseline = Number(x?.avgRate ?? 0); if (!baseline) return { flagged: false, deltaPct: 0 }; const deltaPct = ((nextPurchaseRate - baseline) / baseline) * 100; return { flagged: Math.abs(deltaPct) >= 10, deltaPct }; }

export async function createPurchaseDraftFromOcr(db: any, payload: any, ctx?: any) { const { purchaseInvoices } = await import("../../drizzle/schema"); const [res] = await db.insert(purchaseInvoices).values({ ...payload, sourceType: "ocr", status: "draft" }); const id = (res as any).insertId; await logAudit({ action: "ocr.purchase_draft_created", entityType: "purchase_invoice", entityId: id, afterJson: payload }, ctx); return id; }
export async function reviewOcrLine(db: any, lineId: number, updates: any, ctx?: any) { const { ocrExtractedLines } = await import("../../drizzle/schema"); await db.update(ocrExtractedLines).set({ ...updates, reviewedAt: new Date() }).where(eq(ocrExtractedLines.id, lineId)); await logAudit({ action: "ocr.line.reviewed", entityType: "ocr_extracted_line", entityId: lineId, afterJson: updates }, ctx); }
export async function approveOcrDraft(db: any, jobId: number) { const { ingestionJobs } = await import("../../drizzle/schema"); await db.update(ingestionJobs).set({ status: "under_review" }).where(eq(ingestionJobs.id, jobId)); }
export async function rejectOcrDraft(db: any, jobId: number) { const { ingestionJobs } = await import("../../drizzle/schema"); await db.update(ingestionJobs).set({ status: "failed" }).where(eq(ingestionJobs.id, jobId)); }

export async function commitReviewedPurchaseDraft(db: any, input: { invoiceId: number; supplierId: number; actorId: number; actorRole: string; source?: string }, ctx?: any) {
  const { purchaseInvoices } = await import("../../drizzle/schema");
  const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.invoiceId));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
  if (inv.status !== "committed") throw new TRPCError({ code: "BAD_REQUEST", message: "Draft must be committed via purchase commit path first" });
  await recordSupplierPayable(db, { supplierId: input.supplierId, purchaseInvoiceId: input.invoiceId, storeId: inv.storeId, amount: Number(inv.netAmount ?? 0), actorId: input.actorId, actorRole: input.actorRole, source: input.source ?? "admin" }, ctx);
  await logAudit({ action: "purchase.ocr_draft_committed", entityType: "purchase_invoice", entityId: input.invoiceId, afterJson: { status: inv.status } }, ctx);
  return { success: true };
}
