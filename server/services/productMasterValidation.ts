import { assertProductMasterCompleteness, buildCanonicalProductKey, detectPotentialDuplicateProducts, normalizeHsnCode, type ProductMasterLike } from "./productNormalization";

const REGULATED_SCHEDULES = new Set(["H", "H1", "X", "RX", "NRX"]);
const KNOWN_SCHEDULES = new Set(["OTC", "RX", "H", "H1", "X", "NRX"]);

export type RuntimeGateStatus = "ok" | "incomplete_master" | "review_required";
export type RuntimeGateResult = {
  complete: boolean;
  status: RuntimeGateStatus;
  errors: string[];
  warnings: string[];
  duplicateCandidates: ReturnType<typeof detectPotentialDuplicateProducts>;
  canonicalKey?: string;
  reviewRequired?: boolean;
};

function isMissing(value: unknown) { return value === null || value === undefined || value === ""; }
function positiveNumber(value: unknown) { return Number(value) > 0 && Number.isFinite(Number(value)); }
export function getScheduleCode(product: ProductMasterLike | { scheduleCode?: string | null; schedule?: string | null; requiresPrescription?: boolean | number | null }) { return String((product as any).schedule ?? (product as any).scheduleCode ?? "").trim().toUpperCase(); }
export function isRegulatedProduct(product: ProductMasterLike | { scheduleCode?: string | null; schedule?: string | null; requiresPrescription?: boolean | number | null }) { const schedule = getScheduleCode(product); return REGULATED_SCHEDULES.has(schedule) || (product as any).requiresPrescription === true || (product as any).requiresPrescription === 1; }

function baseResult(product: ProductMasterLike, options?: { requireBarcode?: boolean; scanFirst?: boolean; peers?: ProductMasterLike[]; relaxedOtc?: boolean }): RuntimeGateResult {
  const base = assertProductMasterCompleteness(product);
  const errors = [...base.errors];
  const warnings: string[] = [];
  if ((options?.requireBarcode || options?.scanFirst) && !product.barcode) errors.push("missing_barcode");
  if (product.hsnCode && !normalizeHsnCode(product.hsnCode)) errors.push("hsn_invalid");
  const schedule = getScheduleCode(product);
  if (schedule && !KNOWN_SCHEDULES.has(schedule)) errors.push("unknown_schedule");
  if (options?.relaxedOtc && schedule === "OTC") {
    for (const code of ["missing_strength", "missing_form", "missing_pack_size", "missing_manufacturer", "missing_schedule"]) {
      const idx = errors.indexOf(code);
      if (idx >= 0) { errors.splice(idx, 1); warnings.push(code); }
    }
  }
  const duplicates = detectPotentialDuplicateProducts([...(options?.peers ?? []), product]).filter((d) => d.rightId === product.id || d.leftId === product.id || !product.id);
  if (duplicates.length) warnings.push("duplicate_risk_review_required");
  return { complete: errors.length === 0, status: errors.length === 0 ? "ok" : "incomplete_master", errors, warnings, duplicateCandidates: duplicates, canonicalKey: buildCanonicalProductKey(product), reviewRequired: duplicates.length > 0 };
}

export function getProductMasterCompleteness(product: ProductMasterLike, options?: { requireBarcode?: boolean; scanFirst?: boolean; peers?: ProductMasterLike[]; relaxedOtc?: boolean }) {
  return baseResult(product, options);
}

export const validateProductForSale = (p: ProductMasterLike, peers?: ProductMasterLike[]) => {
  const r = baseResult(p, { peers, relaxedOtc: true });
  if (!normalizeHsnCode(p.hsnCode)) r.errors.push("sale_missing_hsn");
  if (isMissing(p.gstRate)) r.errors.push("sale_missing_gst_rate");
  r.complete = r.errors.length === 0; r.status = r.complete ? "ok" : "incomplete_master";
  return r;
};
export const validateProductForInwarding = (p: ProductMasterLike, peers?: ProductMasterLike[]) => ({ ...baseResult(p, { peers }), reviewRequired: true });
export const validateProductForInvoice = (p: ProductMasterLike, peers?: ProductMasterLike[]) => baseResult(p, { peers, relaxedOtc: true });
export function validateProductForRegulatedSale(p: ProductMasterLike, peers?: ProductMasterLike[]) {
  const r = validateProductForSale(p, peers);
  const schedule = getScheduleCode(p);
  if (!schedule) r.errors.push("regulated_unknown_schedule_fail_closed");
  if (p.requiresPrescription === null || p.requiresPrescription === undefined) r.errors.push("missing_requires_prescription");
  if (isRegulatedProduct(p) && !schedule) r.errors.push("regulated_missing_schedule");
  if (isRegulatedProduct(p) && !REGULATED_SCHEDULES.has(schedule)) r.errors.push("regulated_schedule_mismatch");
  if (REGULATED_SCHEDULES.has(schedule) && p.requiresPrescription !== true && p.requiresPrescription !== 1) r.errors.push("regulated_requires_prescription_flag_missing");
  r.complete = r.errors.length === 0; r.status = r.complete ? "ok" : "incomplete_master";
  return r;
}
export const validateProductForBarcodeLabel = (p: ProductMasterLike, peers?: ProductMasterLike[]) => baseResult(p, { scanFirst: true, peers, relaxedOtc: true });

export function validatePurchaseRuntimeLine(input: { product?: ProductMasterLike | null; batchNo?: string | null; expiryDate?: unknown; mrp?: unknown; purchaseRate?: unknown; cost?: unknown; gstRate?: unknown; hsnCode?: string | null }) {
  const errors: string[] = [];
  if (!input.product) errors.push("product_not_found");
  if (!input.batchNo || !String(input.batchNo).trim()) errors.push("missing_batch_no");
  if (!input.expiryDate) errors.push("missing_expiry");
  if (!positiveNumber(input.mrp)) errors.push("invalid_mrp");
  if (!positiveNumber(input.purchaseRate ?? input.cost)) errors.push("invalid_cost");
  const product = input.product;
  if (product) {
    const merged = { ...product, hsnCode: input.hsnCode ?? product.hsnCode, gstRate: (input.gstRate ?? product.gstRate) as string | number | null | undefined };
    const master = validateProductForInvoice(merged);
    errors.push(...master.errors.map((e) => `product_${e}`));
    if (isRegulatedProduct(merged) && !getScheduleCode(merged)) errors.push("product_regulated_missing_schedule");
  }
  return { complete: errors.length === 0, status: errors.length === 0 ? "ok" as const : "incomplete_master" as const, errors };
}

export function validateBarcodeRuntimeLabel(input: { product?: ProductMasterLike | null; batchNo?: string | null; expiryDate?: unknown; mrp?: unknown; internalBarcode?: string | null }) {
  const errors: string[] = [];
  if (!input.product) errors.push("product_not_found");
  if (!input.product || !buildCanonicalProductKey(input.product)) errors.push("missing_canonical_identity");
  if (!input.batchNo || !String(input.batchNo).trim()) errors.push("missing_batch_no");
  if (!input.expiryDate) errors.push("missing_expiry");
  if (!positiveNumber(input.mrp)) errors.push("invalid_mrp");
  if (!input.internalBarcode) errors.push("missing_internal_barcode");
  if (input.product) errors.push(...validateProductForBarcodeLabel(input.product).errors.map((e) => `product_${e}`));
  return { complete: errors.length === 0, status: errors.length === 0 ? "ok" as const : "incomplete_master" as const, errors };
}

export function getProductMasterExceptionRows(rows: ProductMasterLike[]) { const mapped = rows.map((row) => ({ row, ...getProductMasterCompleteness(row, { peers: rows }) })).filter((r) => !r.complete); return { rows: mapped, totals: { count: mapped.length }, csvData: mapped.map((m) => ({ id: m.row.id ?? "", errors: m.errors.join("|"), warnings: m.warnings.join("|"), canonicalKey: m.canonicalKey ?? "" })) }; }
