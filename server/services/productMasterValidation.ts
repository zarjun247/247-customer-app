import { TRPCError } from "@trpc/server";
import {
  assertProductMasterCompleteness,
  detectPotentialDuplicateProducts,
  normalizeBarcode,
  normalizeHsnCode,
  type ProductMasterLike,
} from "./productNormalization";

const REGULATED_SCHEDULES = new Set(["H", "H1", "X", "RX", "NRX"]);
const STATUTORY_SALE_TYPES = new Set([
  "counter",
  "medicine",
  "app",
  "whatsapp",
  "phone_assisted",
  "prescription",
  "chronic_refill",
]);

function present(value: unknown) {
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

function positive(value: unknown) {
  return Number(value) > 0;
}

export function normalizeScheduleCode(schedule?: string | null) {
  return String(schedule ?? "")
    .trim()
    .toUpperCase();
}

export function isRegulatedSchedule(schedule?: string | null) {
  return REGULATED_SCHEDULES.has(normalizeScheduleCode(schedule));
}

export function productToMasterLike(row: any): ProductMasterLike {
  return {
    id: row?.id,
    name: row?.name,
    brand: row?.brand,
    brandName: row?.brandName ?? row?.brand,
    genericName: row?.genericName,
    strength: row?.strength,
    dosageForm: row?.dosageForm ?? row?.form,
    form: row?.form,
    packSize: row?.packSize,
    manufacturer: row?.manufacturer ?? row?.companyName,
    companyName: row?.companyName,
    hsnCode: row?.hsnCode,
    gstRate: row?.gstRate,
    schedule: row?.schedule ?? row?.scheduleCode,
    requiresPrescription: row?.requiresPrescription,
    barcode: row?.barcode,
  };
}

export function getProductMasterCompleteness(
  product: ProductMasterLike,
  options?: {
    requireBarcode?: boolean;
    scanFirst?: boolean;
    peers?: ProductMasterLike[];
  }
) {
  const base = assertProductMasterCompleteness(product);
  const errors = [...base.errors];
  const schedule = normalizeScheduleCode(product.schedule);
  if (
    (options?.requireBarcode || options?.scanFirst) &&
    !normalizeBarcode(product.barcode)
  )
    errors.push("missing_barcode");
  if (product.hsnCode && String(product.hsnCode).replace(/\D/g, "").length < 4)
    errors.push("hsn_invalid");
  if (schedule && !["OTC", "RX", "H", "H1", "X", "NRX"].includes(schedule))
    errors.push("unknown_schedule");
  const duplicateCandidates = detectPotentialDuplicateProducts([
    ...(options?.peers ?? []),
    product,
  ]).filter(
    d => d.rightId === product.id || d.leftId === product.id || !product.id
  );
  if (duplicateCandidates.length) errors.push("duplicate_review_required");
  return { complete: errors.length === 0, errors, duplicateCandidates };
}

export const validateProductForSale = (
  p: ProductMasterLike,
  peers?: ProductMasterLike[]
) => getProductMasterCompleteness(p, { peers });
export const validateProductForInwarding = (
  p: ProductMasterLike,
  peers?: ProductMasterLike[]
) => ({ ...getProductMasterCompleteness(p, { peers }), reviewRequired: true });
export const validateProductForInvoice = (
  p: ProductMasterLike,
  peers?: ProductMasterLike[]
) => getProductMasterCompleteness(p, { peers });

export function validateProductForRegulatedSale(
  p: ProductMasterLike,
  peers?: ProductMasterLike[],
  options?: { statutoryPath?: boolean; saleType?: string | null }
) {
  const result = getProductMasterCompleteness(p, { peers });
  const schedule = normalizeScheduleCode(p.schedule);
  const statutoryPath =
    options?.statutoryPath ??
    (options?.saleType ? STATUTORY_SALE_TYPES.has(options.saleType) : true);
  if (!schedule) result.errors.push("regulated_unknown_schedule_fail_closed");
  if (schedule === "OTC" && p.requiresPrescription)
    result.errors.push("rx_product_cannot_use_otc_schedule");
  if (isRegulatedSchedule(schedule) && !p.requiresPrescription)
    result.errors.push("regulated_schedule_requires_rx_flag");
  if (statutoryPath && !normalizeHsnCode(p.hsnCode))
    result.errors.push("statutory_missing_hsn");
  if (statutoryPath && !present(p.gstRate))
    result.errors.push("statutory_missing_gst");
  result.complete = result.errors.length === 0;
  return result;
}

export function validatePurchaseLineMaster(input: {
  product?: ProductMasterLike | null;
  productId?: number | string | null;
  batchNo?: string | null;
  expiryDate?: string | Date | null;
  mrp?: string | number | null;
  purchaseRate?: string | number | null;
  hsnCode?: string | null;
  gstRate?: string | number | null;
}) {
  const errors: string[] = [];
  if (!input.product) errors.push("missing_product");
  if (!present(input.batchNo)) errors.push("missing_batch");
  if (!present(input.expiryDate)) errors.push("missing_expiry");
  if (!positive(input.mrp)) errors.push("missing_mrp");
  if (!positive(input.purchaseRate)) errors.push("missing_cost");
  const product = input.product ? productToMasterLike(input.product) : null;
  const schedule = normalizeScheduleCode(product?.schedule);
  if (product) {
    if (!normalizeHsnCode(input.hsnCode ?? product.hsnCode))
      errors.push("missing_hsn");
    if (!present(input.gstRate ?? product.gstRate))
      errors.push("missing_gst_rate");
    if (
      (product.requiresPrescription || isRegulatedSchedule(schedule)) &&
      !schedule
    )
      errors.push("missing_schedule_for_regulated");
    if (isRegulatedSchedule(schedule) && !product.requiresPrescription)
      errors.push("regulated_schedule_requires_rx_flag");
  }
  return { ok: errors.length === 0, errors };
}

export function validateBarcodeLabelMaster(
  input: ProductMasterLike & {
    batchNo?: string | null;
    expiryDate?: string | Date | null;
    mrp?: string | number | null;
    internalBarcode?: string | null;
  }
) {
  const errors = getProductMasterCompleteness(input, {
    requireBarcode: !input.internalBarcode,
  }).errors;
  if (!present(input.name ?? input.brandName ?? input.brand))
    errors.push("missing_product_identity");
  if (!present(input.batchNo)) errors.push("missing_batch");
  if (!present(input.expiryDate)) errors.push("missing_expiry");
  if (!positive(input.mrp)) errors.push("missing_mrp");
  if (!normalizeBarcode(input.barcode ?? input.internalBarcode ?? null))
    errors.push("missing_barcode_mapping");
  return {
    status: errors.length ? ("incomplete_master" as const) : ("ready" as const),
    errors,
  };
}

export function assertRuntimeGate(
  result: { complete?: boolean; ok?: boolean; errors: string[] },
  message: string
) {
  if (
    result.complete === false ||
    result.ok === false ||
    result.errors.length
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message,
      cause: result.errors,
    });
  }
}

export const validateProductForBarcodeLabel = (
  p: ProductMasterLike,
  peers?: ProductMasterLike[]
) =>
  getProductMasterCompleteness(p, {
    requireBarcode: true,
    scanFirst: true,
    peers,
  });
export function getProductMasterExceptionRows(rows: ProductMasterLike[]) {
  const mapped = rows
    .map(row => ({
      row,
      ...getProductMasterCompleteness(row, { peers: rows }),
    }))
    .filter(r => !r.complete);
  return {
    rows: mapped,
    totals: { count: mapped.length },
    csvData: mapped.map(m => ({
      id: m.row.id ?? "",
      errors: m.errors.join("|"),
    })),
  };
}
