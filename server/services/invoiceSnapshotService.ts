import { createHash } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  counterPayments,
  invoiceSnapshots,
  orderItems,
  orders,
  products,
  saleLines,
  sales,
  stores,
  users,
} from "../../drizzle/schema";
import { buildInvoiceLine, computeInvoiceTotals } from "./invoiceService";

export type InvoiceSnapshotStatus =
  | "generated"
  | "pdf_generated"
  | "failed"
  | "cancelled";

type AnyRecord = Record<string, any>;

const CRITICAL_STORE_FIELDS = [
  "storeGSTIN",
  "storeDrugLicense",
  "storeAddress",
] as const;

function r2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(d.getTime())
    ? typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value as string | number | boolean)
    : d.toISOString().slice(0, 10);
}

function normalizeEmpty(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = (
    typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value)
  ).trim();
  return s.length > 0 ? s : null;
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const object = value as AnyRecord;
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

export function evaluateStatutoryCompleteness(payload: AnyRecord) {
  const missingFields: string[] = [];
  if (!payload.billNo) missingFields.push("billNo");
  if (!payload.invoiceDate) missingFields.push("invoiceDate");
  if (!payload.storeName) missingFields.push("storeName");
  for (const field of CRITICAL_STORE_FIELDS) {
    if (!payload[field]) missingFields.push(field);
  }
  for (const [i, line] of (payload.lineItems ?? []).entries()) {
    if (!line.productName) missingFields.push(`lineItems[${i}].productName`);
    if (!line.hsnCode) missingFields.push(`lineItems[${i}].hsnCode`);
    if (line.gstRate === null || line.gstRate === undefined)
      missingFields.push(`lineItems[${i}].gstRate`);
    if (line.mrp === null || line.mrp === undefined)
      missingFields.push(`lineItems[${i}].mrp`);
    if (line.taxableValue === null || line.taxableValue === undefined)
      missingFields.push(`lineItems[${i}].taxableValue`);
  }

  const productionCriticalMissing =
    process.env.NODE_ENV === "production"
      ? missingFields.filter(field =>
          CRITICAL_STORE_FIELDS.includes(field as any)
        )
      : [];

  return {
    complete: missingFields.length === 0,
    status: missingFields.length === 0 ? "complete" : "warning",
    missingFields,
    productionCriticalMissing,
  };
}

export function buildSaleInvoiceSnapshotPayload(input: {
  sale: AnyRecord;
  lines: Array<{
    line: AnyRecord;
    productName?: string | null;
    productHsnCode?: string | null;
  }>;
  store?: AnyRecord | null;
  payment?: AnyRecord | null;
  generatedAt?: Date;
}) {
  const sale = input.sale;
  const generatedAt = input.generatedAt ?? new Date();
  const lineItems = input.lines.map(({ line, productName, productHsnCode }) => {
    const invoiceLine = buildInvoiceLine({
      productName: normalizeEmpty(productName) ?? `PRODUCT-${line.productId}`,
      batchNo: normalizeEmpty(line.batchNo),
      expiryDate: toIso(line.expiryDate),
      quantity: toNumber(line.qty),
      mrp: toNumber(line.mrp),
      sellingPrice: toNumber(line.saleRate),
      discountAmount: toNumber(line.discountAmount),
      gstRate: toNumber(line.gstRate),
      hsnCode: normalizeEmpty(line.hsnCode) ?? normalizeEmpty(productHsnCode),
    });
    return {
      productId: line.productId ?? null,
      productName: invoiceLine.productName,
      batchNo: invoiceLine.batchNo ?? null,
      expiry: invoiceLine.expiryDate ?? null,
      hsnCode: invoiceLine.hsnCode ?? null,
      gstRate: invoiceLine.gstRate,
      mrp: r2(invoiceLine.mrp),
      sellingPrice: r2(invoiceLine.sellingPrice),
      discount: invoiceLine.discountAmount,
      qty: invoiceLine.quantity,
      taxableValue: invoiceLine.taxableValue,
      cgst: invoiceLine.cgst,
      sgst: invoiceLine.sgst,
      igst: invoiceLine.igst,
      gstTotal: invoiceLine.totalGst,
      lineTotal: invoiceLine.lineTotal,
    };
  });
  const totals = computeInvoiceTotals(lineItems as any);
  const payload: AnyRecord = {
    type: "sale_invoice_snapshot",
    billNo: sale.billNo,
    invoiceDate: sale.confirmedAt
      ? new Date(Number(sale.confirmedAt)).toISOString()
      : generatedAt.toISOString(),
    storeId: sale.storeId,
    storeName: normalizeEmpty(input.store?.name) ?? `STORE-${sale.storeId}`,
    storeAddress: normalizeEmpty(input.store?.address),
    storeGSTIN: normalizeEmpty(
      input.store?.gstin ?? input.store?.gstIn ?? input.store?.gstNumber
    ),
    storeDrugLicense: normalizeEmpty(
      input.store?.drugLicense ??
        input.store?.drugLicenseNo ??
        input.store?.licenseNo
    ),
    pharmacistName: normalizeEmpty(sale.pharmacistName),
    pharmacistLicense: normalizeEmpty(
      sale.pharmacistRegNo ?? sale.pharmacistCode
    ),
    customerId: sale.customerId ?? null,
    customerName: normalizeEmpty(sale.customerName),
    customerPhone: normalizeEmpty(sale.customerMobile),
    customerAddress: normalizeEmpty(sale.customerAddress),
    lineItems,
    subtotal: r2(toNumber(sale.subtotal)),
    totalDiscount: r2(toNumber(sale.discountAmount)),
    taxableTotal: totals.taxableAmount,
    gstTotal: totals.totalGst,
    grandTotal: r2(toNumber(sale.total) || totals.netTotal),
    paymentReference: input.payment
      ? {
          mode: input.payment.paymentMode ?? sale.paymentMode ?? null,
          paymentRef: input.payment.paymentRef ?? sale.paymentRef ?? null,
          gatewayRef: input.payment.gatewayRef ?? null,
          status: input.payment.status ?? null,
          amount: input.payment.amount ?? sale.total ?? null,
        }
      : {
          mode: sale.paymentMode ?? null,
          paymentRef: sale.paymentRef ?? null,
          gatewayRef: null,
          status: null,
          amount: sale.total ?? null,
        },
    prescriptionReference: sale.prescriptionId
      ? { prescriptionId: sale.prescriptionId }
      : null,
    orderReference: null,
    saleReference: {
      saleId: sale.id,
      status: sale.status,
      createdBy: sale.createdBy ?? null,
    },
    generatedAt: generatedAt.toISOString(),
  };
  payload.statutoryCompleteness = evaluateStatutoryCompleteness(payload);
  return payload;
}

export function buildInsurerReadyInvoicePackage(snapshot: AnyRecord) {
  const payload = snapshot.snapshotJson ?? snapshot;
  return {
    invoiceSnapshot: payload,
    prescriptionReference: payload.prescriptionReference ?? null,
    paymentReference: payload.paymentReference ?? null,
    orderReference: payload.orderReference ?? null,
    saleReference: payload.saleReference ?? null,
    medicineSummary: (payload.lineItems ?? []).map((line: AnyRecord) => ({
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

export async function createSaleInvoiceSnapshot(
  db: any,
  saleId: string,
  opts: {
    generatedBy?: string | number | null;
    pdfFileKey?: string | null;
    pdfFileUrl?: string | null;
    failureReason?: string | null;
  } = {}
) {
  const existing = await db
    .select()
    .from(invoiceSnapshots)
    .where(
      and(
        eq(invoiceSnapshots.saleId, saleId),
        eq(invoiceSnapshots.status, "generated" as any)
      )
    )
    .orderBy(desc(invoiceSnapshots.generatedAt))
    .limit(1);
  if (existing[0]) return existing[0];
  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  if (!sale) throw new Error("sale_not_found");
  const lineRows = await db
    .select({
      line: saleLines,
      productName: products.name,
      productHsnCode: products.hsnCode,
    })
    .from(saleLines)
    .leftJoin(products, eq(saleLines.productId as any, products.id as any))
    .where(eq(saleLines.saleId, saleId));
  const [store] = await db
    .select()
    .from(stores)
    .where(eq(stores.id as any, Number(sale.storeId) as any))
    .limit(1);
  const [payment] = await db
    .select()
    .from(counterPayments)
    .where(eq(counterPayments.saleId, saleId))
    .orderBy(desc(counterPayments.createdAt))
    .limit(1);
  const snapshotJson = buildSaleInvoiceSnapshotPayload({
    sale,
    lines: lineRows,
    store,
    payment,
  });
  const status: InvoiceSnapshotStatus = opts.failureReason
    ? "failed"
    : opts.pdfFileKey && opts.pdfFileUrl
      ? "pdf_generated"
      : "generated";
  const [inserted] = await db.insert(invoiceSnapshots).values({
    saleId,
    orderId: null,
    billNo: sale.billNo,
    storeId: sale.storeId,
    customerId: sale.customerId ?? null,
    snapshotJson,
    snapshotHash: computeSnapshotHash(snapshotJson),
    pdfFileKey: opts.pdfFileKey ?? null,
    pdfFileUrl: opts.pdfFileUrl ?? null,
    status,
    failureReason: opts.failureReason ?? null,
    generatedBy:
      opts.generatedBy === null || opts.generatedBy === undefined
        ? null
        : String(opts.generatedBy),
    generatedAt: new Date(),
  });
  const insertId = inserted?.insertId;
  if (!insertId)
    return {
      saleId,
      billNo: sale.billNo,
      snapshotJson,
      snapshotHash: computeSnapshotHash(snapshotJson),
      status,
    };
  const [row] = await db
    .select()
    .from(invoiceSnapshots)
    .where(eq(invoiceSnapshots.id, insertId))
    .limit(1);
  return row;
}

export function assertCustomerCanAccessInvoiceSnapshot(
  snapshot: AnyRecord,
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
  if (String(snapshot.customerId ?? payload.customerId ?? "") === uid)
    return true;
  if (String(payload.saleReference?.createdBy ?? "") === uid) return true;
  return false;
}

export async function getInvoiceSnapshotPackageForSale(
  db: any,
  saleId: string,
  user: { id: number | string; role?: string | null }
) {
  const rows = await db
    .select()
    .from(invoiceSnapshots)
    .where(eq(invoiceSnapshots.saleId, saleId))
    .orderBy(desc(invoiceSnapshots.generatedAt))
    .limit(1);
  const snapshot = rows[0];
  if (!snapshot) return null;
  if (!assertCustomerCanAccessInvoiceSnapshot(snapshot, user)) {
    const error = new Error("invoice_snapshot_forbidden");
    (error as any).code = "FORBIDDEN";
    throw error;
  }
  return buildInsurerReadyInvoicePackage(snapshot);
}

export function buildOrderInvoiceSnapshotPayload(input: {
  order: AnyRecord;
  items: AnyRecord[];
  store?: AnyRecord | null;
  customer?: AnyRecord | null;
  generatedAt?: Date;
}) {
  const order = input.order;
  const generatedAt = input.generatedAt ?? new Date();
  const lineItems = input.items.map(item => {
    const unitPrice =
      toNumber(item.unitPrice ?? item.sellingPrice ?? item.lineTotal) /
      Math.max(1, toNumber(item.quantity) || 1);
    const invoiceLine = buildInvoiceLine({
      productName:
        normalizeEmpty(item.name ?? item.productName) ??
        `PRODUCT-${item.productId}`,
      batchNo: normalizeEmpty(item.batchNo),
      expiryDate: toIso(item.expiryDate),
      quantity: toNumber(item.quantity),
      mrp: toNumber(item.mrp ?? unitPrice),
      sellingPrice: unitPrice,
      discountAmount: toNumber(item.discountAmount),
      gstRate: toNumber(item.gstRate),
      hsnCode: normalizeEmpty(item.hsnCode),
    });
    return {
      productId: item.productId ?? null,
      productName: invoiceLine.productName,
      batchNo: invoiceLine.batchNo ?? null,
      expiry: invoiceLine.expiryDate ?? null,
      hsnCode: invoiceLine.hsnCode ?? null,
      gstRate: invoiceLine.gstRate,
      mrp: r2(invoiceLine.mrp),
      sellingPrice: r2(invoiceLine.sellingPrice),
      discount: invoiceLine.discountAmount,
      qty: invoiceLine.quantity,
      taxableValue: invoiceLine.taxableValue,
      cgst: invoiceLine.cgst,
      sgst: invoiceLine.sgst,
      igst: invoiceLine.igst,
      gstTotal: invoiceLine.totalGst,
      lineTotal: invoiceLine.lineTotal,
    };
  });
  const totals = computeInvoiceTotals(lineItems as any);
  const payload: AnyRecord = {
    type: "order_invoice_snapshot",
    billNo: `ORDER-${order.id}`,
    invoiceDate: order.deliveredAt
      ? new Date(order.deliveredAt).toISOString()
      : generatedAt.toISOString(),
    storeId: String(order.storeId),
    storeName: normalizeEmpty(input.store?.name) ?? `STORE-${order.storeId}`,
    storeAddress: normalizeEmpty(input.store?.address),
    storeGSTIN: normalizeEmpty(
      input.store?.gstin ?? input.store?.gstIn ?? input.store?.gstNumber
    ),
    storeDrugLicense: normalizeEmpty(
      input.store?.drugLicense ??
        input.store?.drugLicenseNo ??
        input.store?.licenseNo
    ),
    pharmacistName: null,
    pharmacistLicense: null,
    customerId: String(order.userId),
    customerName: normalizeEmpty(input.customer?.name),
    customerPhone: normalizeEmpty(input.customer?.phone),
    customerAddress: normalizeEmpty(
      order.deliveryAddress ?? input.customer?.userAddress
    ),
    lineItems,
    subtotal: r2(toNumber(order.subtotal)),
    totalDiscount: 0,
    taxableTotal: totals.taxableAmount,
    gstTotal: totals.totalGst,
    grandTotal: r2(toNumber(order.total) || totals.netTotal),
    paymentReference: null,
    prescriptionReference: order.prescriptionId
      ? { prescriptionId: order.prescriptionId }
      : null,
    orderReference: { orderId: order.id, status: order.status },
    saleReference: null,
    generatedAt: generatedAt.toISOString(),
  };
  payload.statutoryCompleteness = evaluateStatutoryCompleteness(payload);
  return payload;
}

export async function createOrderInvoiceSnapshot(
  db: any,
  orderId: number,
  opts: {
    generatedBy?: string | number | null;
    pdfFileKey?: string | null;
    pdfFileUrl?: string | null;
    failureReason?: string | null;
  } = {}
) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new Error("order_not_found");
  const itemRows = await db
    .select({
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      lineTotal: orderItems.lineTotal,
      name: products.name,
      hsnCode: products.hsnCode,
      gstRate: products.gstRate,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId as any, products.id as any))
    .where(eq(orderItems.orderId, orderId));
  const [store] = await db
    .select()
    .from(stores)
    .where(eq(stores.id as any, Number(order.storeId) as any))
    .limit(1);
  const [customer] = await db
    .select()
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1);
  const snapshotJson = buildOrderInvoiceSnapshotPayload({
    order,
    items: itemRows,
    store,
    customer,
  });
  const status: InvoiceSnapshotStatus = opts.failureReason
    ? "failed"
    : opts.pdfFileKey && opts.pdfFileUrl
      ? "pdf_generated"
      : "generated";
  const [inserted] = await db.insert(invoiceSnapshots).values({
    saleId: null,
    orderId,
    billNo: snapshotJson.billNo,
    storeId: String(order.storeId),
    customerId: String(order.userId),
    snapshotJson,
    snapshotHash: computeSnapshotHash(snapshotJson),
    pdfFileKey: opts.pdfFileKey ?? null,
    pdfFileUrl: opts.pdfFileUrl ?? null,
    status,
    failureReason: opts.failureReason ?? null,
    generatedBy:
      opts.generatedBy === null || opts.generatedBy === undefined
        ? null
        : String(opts.generatedBy),
    generatedAt: new Date(),
  });
  const insertId = inserted?.insertId;
  if (!insertId)
    return {
      orderId,
      billNo: snapshotJson.billNo,
      snapshotJson,
      snapshotHash: computeSnapshotHash(snapshotJson),
      status,
    };
  const [row] = await db
    .select()
    .from(invoiceSnapshots)
    .where(eq(invoiceSnapshots.id, insertId))
    .limit(1);
  return row;
}
