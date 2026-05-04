export type ProductMasterInput = {
  name?: string | null;
  genericName?: string | null;
  brand?: string | null;
  strength?: string | null;
  form?: string | null;
  packSize?: string | null;
  manufacturer?: string | null;
  companyName?: string | null;
  hsnCode?: string | null;
  gstRate?: string | number | null;
  schedule?: "OTC" | "H" | "H1" | "X" | null;
  barcode?: string | null;
};

const clean = (v?: string | null) => (v ?? "").trim().replace(/\s+/g, " ");
const token = (v?: string | null) => clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");

export const normalizeProductName = (v?: string | null) => clean(v).toUpperCase();
export const normalizeGenericName = (v?: string | null) => clean(v).toUpperCase();
export const normalizeBrandName = (v?: string | null) => clean(v).toUpperCase();
export const normalizeStrength = (v?: string | null) => clean(v).toUpperCase();
export const normalizeDosageForm = (v?: string | null) => clean(v).toLowerCase();
export const normalizePackSize = (v?: string | null) => clean(v).toUpperCase();
export const normalizeManufacturer = (v?: string | null) => clean(v).toUpperCase();
export const normalizeHsnCode = (v?: string | null) => clean(v).replace(/[^0-9]/g, "");
export const normalizeBarcode = (v?: string | null) => clean(v).replace(/\s+/g, "").toUpperCase();

export function buildCanonicalProductKey(input: ProductMasterInput) {
  return [token(input.genericName || input.name), token(input.strength), token(input.form), token(input.packSize), token(input.companyName || input.manufacturer)].join("|");
}

export function scoreProductMatch(a: ProductMasterInput, b: ProductMasterInput) {
  const keys: Array<keyof ProductMasterInput> = ["name", "genericName", "strength", "form", "packSize", "companyName", "manufacturer"];
  let matched = 0;
  for (const k of keys) if (token(a[k] as string) && token(a[k] as string) === token(b[k] as string)) matched++;
  return Math.round((matched / keys.length) * 100);
}

export function detectPotentialDuplicateProducts(rows: Array<ProductMasterInput & { id?: number }>) {
  const dupes: Array<{ leftId?: number; rightId?: number; score: number; canonicalKey: string }> = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const score = scoreProductMatch(rows[i], rows[j]);
    if (score >= 60 || buildCanonicalProductKey(rows[i]) === buildCanonicalProductKey(rows[j])) dupes.push({ leftId: rows[i].id, rightId: rows[j].id, score, canonicalKey: buildCanonicalProductKey(rows[i]) });
  }
  return dupes;
}

export function assertProductMasterCompleteness(input: ProductMasterInput) {
  const missing: string[] = [];
  if (!clean(input.name)) missing.push("name");
  if (!clean(input.strength)) missing.push("strength");
  if (!clean(input.form)) missing.push("form");
  if (!clean(input.packSize)) missing.push("packSize");
  if (!clean(input.companyName || input.manufacturer)) missing.push("manufacturer");
  if (!normalizeHsnCode(input.hsnCode)) missing.push("hsnCode");
  if (input.gstRate === null || input.gstRate === undefined || `${input.gstRate}`.trim() === "") missing.push("gstRate");
  if (!input.schedule) missing.push("schedule");
  return { complete: missing.length === 0, missing, canonicalKey: buildCanonicalProductKey(input) };
}

export function buildProductMasterAuditPayload(before: ProductMasterInput, after: ProductMasterInput) {
  return {
    before,
    after,
    canonicalBefore: buildCanonicalProductKey(before),
    canonicalAfter: buildCanonicalProductKey(after),
    changedAt: new Date().toISOString(),
  };
}
