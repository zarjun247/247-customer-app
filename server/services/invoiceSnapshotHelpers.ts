import { createHash } from "crypto";

export function r2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as string | number);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  if (typeof value === "object") return JSON.stringify(value);
  const prim = value as string | number | boolean | bigint;
  return String(prim);
}

export function normalizeEmpty(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let s: string;
  if (typeof value === "object") {
    s = JSON.stringify(value);
  } else {
    const prim = value as string | number | boolean | bigint;
    s = String(prim);
  }
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(object[key])}`)
    .join(",")}}`;
}

export function computeSnapshotHash(snapshotJson: unknown): string {
  return createHash("sha256")
    .update(stableSerialize(snapshotJson))
    .digest("hex");
}

const CRITICAL_STORE_FIELDS = [
  "storeGSTIN",
  "storeDrugLicense",
  "storeAddress",
] as const;

type CriticalStoreField = (typeof CRITICAL_STORE_FIELDS)[number];

export type StatutoryPayload = {
  billNo?: unknown;
  invoiceDate?: unknown;
  storeName?: unknown;
  storeGSTIN?: unknown;
  storeDrugLicense?: unknown;
  storeAddress?: unknown;
  lineItems?: Array<{
    productName?: unknown;
    hsnCode?: unknown;
    gstRate?: number | null;
    mrp?: number | null;
    taxableValue?: number | null;
  }>;
};

export function evaluateStatutoryCompleteness(payload: StatutoryPayload) {
  const missingFields: string[] = [];
  if (!payload.billNo) missingFields.push("billNo");
  if (!payload.invoiceDate) missingFields.push("invoiceDate");
  if (!payload.storeName) missingFields.push("storeName");
  for (const field of CRITICAL_STORE_FIELDS) {
    if (!payload[field]) missingFields.push(field);
  }
  const lineItems = payload.lineItems ?? [];
  for (let i = 0; i < lineItems.length; i++) {
    const line = lineItems[i];
    if (!line.productName) missingFields.push(`lineItems[${i}].productName`);
    if (!line.hsnCode) missingFields.push(`lineItems[${i}].hsnCode`);
    if (line.gstRate === null || line.gstRate === undefined)
      missingFields.push(`lineItems[${i}].gstRate`);
    if (line.mrp === null || line.mrp === undefined)
      missingFields.push(`lineItems[${i}].mrp`);
    if (line.taxableValue === null || line.taxableValue === undefined)
      missingFields.push(`lineItems[${i}].taxableValue`);
  }

  const productionCriticalMissing: string[] =
    process.env.NODE_ENV === "production"
      ? missingFields.filter((field): field is CriticalStoreField =>
          (CRITICAL_STORE_FIELDS as ReadonlyArray<string>).includes(field)
        )
      : [];

  return {
    complete: missingFields.length === 0,
    status: missingFields.length === 0 ? "complete" : "warning",
    missingFields,
    productionCriticalMissing,
  };
}

export type InsurerSnapshotInput = {
  snapshotJson?: {
    prescriptionReference?: unknown;
    paymentReference?: unknown;
    orderReference?: unknown;
    saleReference?: unknown;
    lineItems?: Array<{
      productName?: unknown;
      batchNo?: unknown;
      expiry?: unknown;
      hsnCode?: unknown;
      qty?: unknown;
      mrp?: unknown;
      sellingPrice?: unknown;
      discount?: unknown;
      taxableValue?: unknown;
      gstRate?: unknown;
      gstTotal?: unknown;
      lineTotal?: unknown;
    }>;
    statutoryCompleteness?: { complete: boolean } | null;
  };
} & Record<string, unknown>;

type SnapshotPayloadInner = NonNullable<InsurerSnapshotInput["snapshotJson"]>;

function resolveSnapshotPayload(
  snapshot: InsurerSnapshotInput
): SnapshotPayloadInner {
  if (snapshot.snapshotJson) return snapshot.snapshotJson;
  return snapshot as unknown as SnapshotPayloadInner;
}

export function buildInsurerReadyInvoicePackage(
  snapshot: InsurerSnapshotInput
) {
  const payload = resolveSnapshotPayload(snapshot);
  return {
    invoiceSnapshot: payload,
    prescriptionReference: payload.prescriptionReference ?? null,
    paymentReference: payload.paymentReference ?? null,
    orderReference: payload.orderReference ?? null,
    saleReference: payload.saleReference ?? null,
    medicineSummary: (payload.lineItems ?? []).map(line => ({
      productName: line.productName,
      batchNo: line.batchNo ?? null,
      expiry: line.expiry ?? null,
      hsnCode: line.hsnCode ?? null,
      qty: line.qty,
      mrp: line.mrp,
      sellingPrice: line.sellingPrice,
      discount: line.discount,
      taxableValue: line.taxableValue,
      gstRate: line.gstRate,
      gstTotal: line.gstTotal,
      lineTotal: line.lineTotal,
    })),
    insurerSubmissionReady: payload.statutoryCompleteness?.complete === true,
  };
}

export function assertCustomerCanAccessInvoiceSnapshot(
  snapshot: InsurerSnapshotInput & { customerId?: string | null },
  user: { id: number | string; role?: string | null }
) {
  const staffRoles = new Set([
    "admin",
    "super_admin",
    "store_manager",
    "pharmacist",
    "salesman",
    "cashier",
    "accountant",
    "auditor",
  ]);
  if (user.role && staffRoles.has(user.role)) return true;
  const uid = String(user.id);
  const payload = snapshot.snapshotJson ?? snapshot;
  const payloadCustomerId = (payload as { customerId?: string | number | null })
    .customerId;
  const effectiveCustomerId = snapshot.customerId ?? payloadCustomerId;
  if (effectiveCustomerId != null && String(effectiveCustomerId) === uid)
    return true;
  const saleRef = payload.saleReference as
    | { createdBy?: string | number | null }
    | undefined;
  const createdBy = saleRef?.createdBy;
  if (createdBy != null && String(createdBy) === uid) return true;
  return false;
}
