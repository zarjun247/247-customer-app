import { createHash } from "crypto";

export type NormalizedPack = {
  quantity: number | null;
  unit: string | null;
  text: string | null;
};
export type ProductMasterLike = {
  id?: number | string | null;
  name?: string | null;
  genericName?: string | null;
  brandName?: string | null;
  brand?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  form?: string | null;
  packSize?: string | null;
  manufacturer?: string | null;
  companyName?: string | null;
  hsnCode?: string | null;
  gstRate?: number | string | null;
  schedule?: string | null;
  requiresPrescription?: boolean | number | null;
  barcode?: string | null;
};

const compact = (v?: string | null) =>
  (v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
export const normalizeProductName = (v?: string | null) =>
  compact(v).replace(/[^A-Z0-9 +\-/().]/g, "");
export const normalizeGenericName = (v?: string | null) =>
  compact(v).replace(/\bTAB\b/g, "TABLET");
export const normalizeBrandName = (v?: string | null) => compact(v);
export const normalizeStrength = (v?: string | null) =>
  compact(v)
    .replace(/\bMILLIGRAM\b/g, "MG")
    .replace(/\bGRAM\b/g, "G");
export const normalizeDosageForm = (v?: string | null) =>
  compact(v)
    .replace(/\bTABS?\b/g, "TABLET")
    .replace(/\bCAPS?\b/g, "CAPSULE");
export function normalizePackSize(v?: string | null): NormalizedPack {
  const text = compact(v);
  const match = text.match(/(\d+(?:\.\d+)?)\s*([A-Z]+)/);
  return {
    quantity: match ? Number(match[1]) : null,
    unit: match ? match[2] : null,
    text: text || null,
  };
}
export const normalizeManufacturer = (v?: string | null) =>
  compact(v).replace(/\bPVT\.?\s*LTD\b/g, "PVT LTD");
export const normalizeHsnCode = (v?: string | null) =>
  (v ?? "").replace(/\D/g, "").slice(0, 8) || null;
export const normalizeBarcode = (v?: string | null) =>
  (v ?? "").trim().replace(/\s+/g, "").toUpperCase();

const productForm = (p: ProductMasterLike) => p.dosageForm ?? p.form ?? null;
const productManufacturer = (p: ProductMasterLike) =>
  p.manufacturer ?? p.companyName ?? null;

export function buildCanonicalProductKey(p: ProductMasterLike) {
  const pack = normalizePackSize(p.packSize);
  const parts = [
    normalizeGenericName(p.genericName),
    normalizeStrength(p.strength),
    normalizeDosageForm(productForm(p)),
    pack.text,
    normalizeManufacturer(productManufacturer(p)),
  ].filter(Boolean);
  return (
    parts.join("|") || normalizeProductName(p.name ?? p.brandName ?? p.brand)
  );
}

export function scoreProductMatch(a: ProductMasterLike, b: ProductMasterLike) {
  let score = 0;
  if (
    buildCanonicalProductKey(a) &&
    buildCanonicalProductKey(a) === buildCanonicalProductKey(b)
  )
    score += 70;
  if (
    normalizeProductName(a.name ?? a.brandName ?? a.brand) ===
    normalizeProductName(b.name ?? b.brandName ?? b.brand)
  )
    score += 15;
  if (
    normalizeBarcode(a.barcode) &&
    normalizeBarcode(a.barcode) === normalizeBarcode(b.barcode)
  )
    score += 20;
  return Math.min(100, score);
}

export function detectPotentialDuplicateProducts(rows: ProductMasterLike[]) {
  const out: Array<{
    canonicalKey: string;
    candidateProductIds: Array<number | string | null | undefined>;
    reason: string;
    reviewStatus: "review_required";
    score: number;
    leftId?: number | string | null;
    rightId?: number | string | null;
  }> = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const score = scoreProductMatch(rows[i], rows[j]);
      if (score >= 70) {
        const canonicalKey = buildCanonicalProductKey(rows[i]);
        out.push({
          leftId: rows[i].id,
          rightId: rows[j].id,
          score,
          canonicalKey,
          candidateProductIds: [rows[i].id, rows[j].id].filter(
            id => id !== undefined
          ),
          reason:
            score >= 90
              ? "barcode_or_exact_master_match"
              : "canonical_master_match",
          reviewStatus: "review_required",
        });
      }
    }
  }
  return out;
}

export function assertProductMasterCompleteness(p: ProductMasterLike) {
  const errors: string[] = [];
  if (!normalizeProductName(p.name ?? p.brandName ?? p.brand))
    errors.push("missing_name");
  if (!normalizeStrength(p.strength)) errors.push("missing_strength");
  if (!normalizeDosageForm(productForm(p))) errors.push("missing_form");
  if (!normalizePackSize(p.packSize).text) errors.push("missing_pack_size");
  if (!normalizeManufacturer(productManufacturer(p)))
    errors.push("missing_manufacturer");
  if (!normalizeHsnCode(p.hsnCode)) errors.push("missing_hsn");
  if (p.gstRate === null || p.gstRate === undefined || p.gstRate === "")
    errors.push("missing_gst_rate");
  if (!p.schedule) errors.push("missing_schedule");
  return { ok: errors.length === 0, errors };
}

export function buildProductMasterAuditPayload(
  before: ProductMasterLike,
  after: ProductMasterLike
) {
  return {
    before,
    after,
    canonicalBefore: buildCanonicalProductKey(before),
    canonicalAfter: buildCanonicalProductKey(after),
    fingerprint: createHash("sha1").update(JSON.stringify(after)).digest("hex"),
  };
}
