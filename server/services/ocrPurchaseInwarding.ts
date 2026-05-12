import { and, eq, ilike, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";
import { recordSupplierPayable } from "./supplierLedger";
import { normalizeProductName } from "./productNormalization";
import { getOcrProviderReadiness } from "./ocrProductionSafety";

export const OCR_CONFIDENCE_REVIEW_THRESHOLD = 70;
export const SUPPLIER_SKU_CONFIDENCE_THRESHOLD = 95;

export const OCR_EXCEPTION_REASONS = [
  "low_confidence",
  "ambiguous_product",
  "missing_batch",
  "missing_expiry",
  "missing_qty",
  "missing_mrp",
  "missing_cost",
  "missing_hsn_or_gst",
  "missing_schedule_for_regulated",
  "supplier_sku_unmapped",
] as const;

export const OCR_APPROVAL_STATUSES = [
  "pending",
  "approved",
  "held",
  "rejected",
] as const;
export const OCR_APPROVAL_DECISIONS = ["approve", "hold", "reject"] as const;

export type OcrExceptionReason = (typeof OCR_EXCEPTION_REASONS)[number];
export type OcrApprovalStatus = (typeof OCR_APPROVAL_STATUSES)[number];
export type OcrApprovalDecision = (typeof OCR_APPROVAL_DECISIONS)[number];

export type OcrLineInput = {
  itemName: string;
  manufacturer?: string | null;
  barcode?: string | null;
  supplierSku?: string | null;
  productCode?: string | null;
  qty: number;
  freeQty?: number;
  mrp: number;
  purchaseRate: number;
  gstRate?: number | null;
  hsnCode?: string | null;
  schedule?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  confidence?: number;
  rawText?: string | null;
};

export type OcrMatchResult = {
  productId: number | null;
  supplierSkuMappingId?: number | null;
  confidence: number;
  reason: string;
  candidateCount?: number;
};

export type OcrLineReviewInput = {
  confidence?: number | string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  qty?: number | null;
  mrp?: number | string | null;
  purchaseRate?: number | string | null;
  hsnCode?: string | null;
  gstRate?: number | string | null;
  schedule?: string | null;
  regulatedRequiresSchedule?: boolean | null;
  matchedProductId?: number | null;
  mappedSupplierSkuId?: number | null;
  supplierSku?: string | null;
  matchConfidence?: number | string | null;
  candidateCount?: number | null;
};

export function normalizeOcrLine(line: OcrLineInput): OcrLineInput {
  return {
    ...line,
    itemName: line.itemName.trim().replace(/\s+/g, " "),
    manufacturer: line.manufacturer?.trim() ?? null,
    confidence: Math.max(0, Math.min(100, line.confidence ?? 0)),
    freeQty: line.freeQty ?? 0,
    gstRate: line.gstRate ?? 12,
    rawText: line.rawText ?? null,
  };
}

function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  let s: string;
  if (typeof value === "object") {
    s = JSON.stringify(value);
  } else {
    const prim = value as string | number | boolean | bigint;
    s = String(prim);
  }
  return s.trim() !== "";
}

function positive(value: unknown): boolean {
  return Number(value) > 0;
}

function isRegulatedSchedule(schedule?: string | null): boolean {
  return (
    !!schedule &&
    ["H", "H1", "X", "NRX"].includes(schedule.trim().toUpperCase())
  );
}

export function classifyOcrLineException(
  line: OcrLineReviewInput
): OcrExceptionReason | null {
  if (Number(line.confidence ?? 0) < OCR_CONFIDENCE_REVIEW_THRESHOLD)
    return "low_confidence";
  if (!line.matchedProductId || Number(line.candidateCount ?? 0) > 1)
    return "ambiguous_product";
  if (
    line.supplierSku &&
    (!line.mappedSupplierSkuId ||
      Number(line.matchConfidence ?? 0) < SUPPLIER_SKU_CONFIDENCE_THRESHOLD)
  )
    return "supplier_sku_unmapped";
  if (!present(line.batchNo)) return "missing_batch";
  if (!present(line.expiryDate)) return "missing_expiry";
  if (!positive(line.qty)) return "missing_qty";
  if (!positive(line.mrp)) return "missing_mrp";
  if (!positive(line.purchaseRate)) return "missing_cost";
  if (!present(line.hsnCode) || !present(line.gstRate))
    return "missing_hsn_or_gst";
  if (line.regulatedRequiresSchedule && !present(line.schedule))
    return "missing_schedule_for_regulated";
  return null;
}

export function approvalStatusForException(
  exceptionReason: OcrExceptionReason | null
): OcrApprovalStatus {
  return exceptionReason ? "held" : "pending";
}

export function assertOcrDraftApprovedForHandoff(
  draft: { status?: string | null },
  lines: Array<{
    status?: string | null;
    approvalStatus?: string | null;
    exceptionReason?: string | null;
    productId?: number | null;
    batchNo?: string | null;
    expiryDate?: string | null;
    qty?: number | null;
    mrp?: string | number | null;
    purchaseRate?: string | number | null;
  }>
) {
  if (draft.status !== "approved")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "OCR draft requires human approval before purchase handoff",
    });
  const unsafe = lines.find(
    line =>
      line.status !== "approved" ||
      line.approvalStatus !== "approved" ||
      !!line.exceptionReason ||
      !line.productId ||
      !present(line.batchNo) ||
      !present(line.expiryDate) ||
      !positive(line.qty) ||
      !positive(line.mrp) ||
      !positive(line.purchaseRate)
  );
  if (unsafe)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "All OCR draft lines must be approved and exception-free before purchase handoff",
    });
}

export function buildOcrExceptionReport(
  rows: Array<{
    exceptionReason?: string | null;
    approvalStatus?: string | null;
  }>
) {
  const byExceptionReason: Record<string, number> = {};
  const byApprovalStatus: Record<string, number> = {};
  for (const row of rows) {
    const reason = row.exceptionReason ?? "none";
    const status = row.approvalStatus ?? "pending";
    byExceptionReason[reason] = (byExceptionReason[reason] ?? 0) + 1;
    byApprovalStatus[status] = (byApprovalStatus[status] ?? 0) + 1;
  }
  return { totalRows: rows.length, byExceptionReason, byApprovalStatus };
}

export async function createOcrJob(
  db: any,
  payload: {
    storeId: number;
    fileUrl: string;
    fileKey: string;
    filename: string;
    mimeType: string;
    sourceType?: string;
    createdBy: number;
    supplierHint?: string | null;
  },
  ctx?: any
) {
  const { ingestionJobs } = await import("../../drizzle/schema");
  const [job] = await db
    .insert(ingestionJobs)
    .values({
      ...payload,
      sourceType: payload.sourceType ?? "upload",
      jobType: "purchase_bill",
      status: "queued",
    })
    .$returningId();
  await logAudit(
    {
      action: "ocr.job.created",
      entityType: "ingestion_job",
      entityId: job.id,
      afterJson: payload,
    },
    ctx
  );
  return job;
}

export async function parseSupplierBill(rawText?: string) {
  const readiness = getOcrProviderReadiness();
  if (!readiness.ok) {
    return {
      provider: process.env.OCR_PROVIDER ?? readiness.status,
      status: readiness.status,
      ok: false,
      manualRequired: true,
      rawText: rawText ?? "",
      reason: readiness.reason,
    };
  }
  return {
    provider: process.env.OCR_PROVIDER ?? "llm",
    status: "manual_required",
    ok: false,
    manualRequired: true,
    rawText: rawText ?? "",
    reason:
      "No certified supplier-bill OCR adapter is wired here; use the reviewed ingestion pipeline.",
  };
}

export async function matchSupplier(
  db: any,
  supplierName?: string | null,
  supplierGstin?: string | null
) {
  const { suppliers } = await import("../../drizzle/schema");
  if (supplierGstin) {
    const [byGstin] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.gstin, supplierGstin))
      .limit(1);
    if (byGstin) return byGstin;
  }
  if (supplierName) {
    const [byName] = await db
      .select()
      .from(suppliers)
      .where(ilike(suppliers.supplierName, supplierName))
      .limit(1);
    if (byName) return byName;
  }
  return null;
}

export async function matchProductOrCreateDraft(
  db: any,
  line: OcrLineInput,
  supplierId?: number | null
): Promise<OcrMatchResult> {
  const { products, productSupplierMappings } = await import(
    "../../drizzle/schema"
  );
  if (line.barcode) {
    const [p] = await db
      .select()
      .from(products)
      .where(eq(products.barcode, line.barcode))
      .limit(1);
    if (p)
      return {
        productId: p.id,
        confidence: 100,
        reason: "barcode_exact",
        candidateCount: 1,
      };
  }
  if (line.productCode) {
    const [p] = await db
      .select()
      .from(products)
      .where(eq(products.companyCode, line.productCode))
      .limit(1);
    if (p)
      return {
        productId: p.id,
        confidence: 98,
        reason: "sku_exact",
        candidateCount: 1,
      };
  }
  if (supplierId && line.supplierSku) {
    const [m] = await db
      .select()
      .from(productSupplierMappings)
      .where(
        and(
          eq(productSupplierMappings.supplierId, supplierId),
          eq(productSupplierMappings.supplierProductCode, line.supplierSku)
        )
      )
      .limit(1);
    if (m)
      return {
        productId: m.productId,
        supplierSkuMappingId: m.id,
        confidence: 96,
        reason: "supplier_mapping",
        candidateCount: 1,
      };
  }
  const normalized = normalizeProductName(line.itemName);
  const token =
    normalized.split(" ").find(part => part.length >= 3) ??
    line.itemName.split(" ")[0];
  const matches = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(ilike(products.name, `%${token}%`))
    .limit(5);
  if (matches.length === 1)
    return {
      productId: matches[0].id,
      confidence: 74,
      reason: "name_fallback",
      candidateCount: 1,
    };
  return {
    productId: null,
    confidence: 0,
    reason: matches.length > 1 ? "ambiguous_product" : "draft_required",
    candidateCount: matches.length,
  };
}

export async function detectPriceChange(
  db: any,
  productId: number,
  nextPurchaseRate: number
) {
  const { purchaseLines } = await import("../../drizzle/schema");
  const [x] = await db
    .select({ avgRate: sql<number>`avg(${purchaseLines.purchaseRate})` })
    .from(purchaseLines)
    .where(eq(purchaseLines.productId, productId));
  const baseline = Number(x?.avgRate ?? 0);
  if (!baseline) return { flagged: false, deltaPct: 0 };
  const deltaPct = ((nextPurchaseRate - baseline) / baseline) * 100;
  return { flagged: Math.abs(deltaPct) >= 10, deltaPct };
}

export async function createPurchaseDraftFromOcr(
  db: any,
  payload: any,
  ctx?: any
) {
  const { purchaseInvoices } = await import("../../drizzle/schema");
  const [res] = await db
    .insert(purchaseInvoices)
    .values({ ...payload, sourceType: "ocr", status: "draft" });
  const id = res.insertId;
  await logAudit(
    {
      action: "ocr.purchase_draft_created",
      entityType: "purchase_invoice",
      entityId: id,
      afterJson: payload,
    },
    ctx
  );
  return id;
}

export async function reviewOcrLine(
  db: any,
  lineId: number,
  updates: any,
  ctx?: any
) {
  const { ocrExtractedLines } = await import("../../drizzle/schema");
  const decision =
    updates.approvalDecision ??
    (updates.approvalStatus === "approved"
      ? "approve"
      : updates.approvalStatus === "rejected"
        ? "reject"
        : "hold");
  await db
    .update(ocrExtractedLines)
    .set({
      ...updates,
      approvalDecision: decision,
      reviewedAt: new Date(),
      approvedAt: updates.approvedAt ?? new Date(),
    })
    .where(eq(ocrExtractedLines.id, lineId));
  await logAudit(
    {
      action: "ocr.line.reviewed",
      entityType: "ocr_extracted_line",
      entityId: lineId,
      afterJson: updates,
    },
    ctx
  );
}

export async function approveOcrDraft(db: any, jobId: number) {
  const { ingestionJobs } = await import("../../drizzle/schema");
  await db
    .update(ingestionJobs)
    .set({ status: "under_review" })
    .where(eq(ingestionJobs.id, jobId));
}

export async function rejectOcrDraft(db: any, jobId: number) {
  const { ingestionJobs } = await import("../../drizzle/schema");
  await db
    .update(ingestionJobs)
    .set({ status: "failed" })
    .where(eq(ingestionJobs.id, jobId));
}

export async function commitReviewedPurchaseDraft(
  db: any,
  input: {
    invoiceId: number;
    supplierId: number;
    actorId: number;
    actorRole: string;
    source?: string;
  },
  ctx?: any
) {
  const { purchaseInvoices } = await import("../../drizzle/schema");
  const [inv] = await db
    .select()
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.id, input.invoiceId));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
  if (inv.status !== "committed")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Draft must be committed via purchase commit path first",
    });
  await recordSupplierPayable(
    db,
    {
      supplierId: input.supplierId,
      purchaseInvoiceId: input.invoiceId,
      storeId: inv.storeId,
      amount: Number(inv.netAmount ?? 0),
      actorId: input.actorId,
      actorRole: input.actorRole,
      source: input.source ?? "admin",
    },
    ctx
  );
  await logAudit(
    {
      action: "purchase.ocr_draft_committed",
      entityType: "purchase_invoice",
      entityId: input.invoiceId,
      afterJson: { status: inv.status },
    },
    ctx
  );
  return { success: true };
}
