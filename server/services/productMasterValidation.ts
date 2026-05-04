import { assertProductMasterCompleteness, detectPotentialDuplicateProducts, type ProductMasterLike } from "./productNormalization";

export function getProductMasterCompleteness(product: ProductMasterLike, options?: { requireBarcode?: boolean; scanFirst?: boolean; peers?: ProductMasterLike[] }) {
  const base = assertProductMasterCompleteness(product);
  const errors = [...base.errors];
  if ((options?.requireBarcode || options?.scanFirst) && !product.barcode) errors.push("missing_barcode");
  if (product.hsnCode && String(product.hsnCode).replace(/\D/g, "").length < 4) errors.push("hsn_invalid");
  if (product.schedule && !["OTC", "RX", "H", "H1", "X"].includes(String(product.schedule).toUpperCase())) errors.push("unknown_schedule");
  const duplicates = detectPotentialDuplicateProducts([...(options?.peers ?? []), product]).filter((d) => d.rightId === product.id || d.leftId === product.id || !product.id);
  if (duplicates.length) errors.push("duplicate_risk");
  return { complete: errors.length === 0, errors, duplicateCandidates: duplicates };
}

export const validateProductForSale = (p: ProductMasterLike, peers?: ProductMasterLike[]) => getProductMasterCompleteness(p, { requireBarcode: false, peers });
export const validateProductForInwarding = (p: ProductMasterLike, peers?: ProductMasterLike[]) => ({ ...getProductMasterCompleteness(p, { peers }), reviewRequired: true });
export const validateProductForInvoice = (p: ProductMasterLike, peers?: ProductMasterLike[]) => getProductMasterCompleteness(p, { peers });
export function validateProductForRegulatedSale(p: ProductMasterLike, peers?: ProductMasterLike[]) { const r = getProductMasterCompleteness(p, { peers }); const schedule = String(p.schedule ?? "").toUpperCase(); if (["H", "H1", "X", "RX"].includes(schedule) && !p.schedule) r.errors.push("regulated_missing_schedule"); if (!schedule) r.errors.push("regulated_unknown_schedule_fail_closed"); r.complete = r.errors.length === 0; return r; }
export const validateProductForBarcodeLabel = (p: ProductMasterLike, peers?: ProductMasterLike[]) => getProductMasterCompleteness(p, { requireBarcode: true, scanFirst: true, peers });
export function getProductMasterExceptionRows(rows: ProductMasterLike[]) { const mapped = rows.map((row) => ({ row, ...getProductMasterCompleteness(row, { peers: rows }) })).filter((r) => !r.complete); return { rows: mapped, totals: { count: mapped.length }, csvData: mapped.map((m) => ({ id: m.row.id ?? "", errors: m.errors.join("|") })) }; }
