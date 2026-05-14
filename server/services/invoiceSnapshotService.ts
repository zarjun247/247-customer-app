import { and, desc, eq, sql, type InferSelectModel } from "drizzle-orm";
import type { ResultSetHeader } from "mysql2";
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
import {
  r2,
  toNumber,
  toIso,
  normalizeEmpty,
  computeSnapshotHash,
  evaluateStatutoryCompleteness,
  buildInsurerReadyInvoicePackage,
  assertCustomerCanAccessInvoiceSnapshot,
  type InsurerSnapshotInput,
} from "./invoiceSnapshotHelpers";

export type {
  StatutoryPayload,
  InsurerSnapshotInput,
} from "./invoiceSnapshotHelpers";
export {
  stableSerialize,
  computeSnapshotHash,
  evaluateStatutoryCompleteness,
  buildInsurerReadyInvoicePackage,
  assertCustomerCanAccessInvoiceSnapshot,
} from "./invoiceSnapshotHelpers";

export type InvoiceSnapshotStatus =
  | "generated"
  | "pdf_generated"
  | "failed"
  | "cancelled";

type DrizzleDb = Awaited<ReturnType<typeof import("../db").getDb>>;

type SaleRecord = typeof sales.$inferSelect;
type SaleLineRecord = typeof saleLines.$inferSelect;
type StoreRecord = typeof stores.$inferSelect;
type CounterPaymentRecord = typeof counterPayments.$inferSelect;
type OrderRecord = typeof orders.$inferSelect;
type UserRecord = typeof users.$inferSelect;

export function buildSaleInvoiceSnapshotPayload(input: {
  sale: SaleRecord;
  lines: Array<{
    line: SaleLineRecord;
    productName?: string | null;
    productHsnCode?: string | null;
  }>;
  store?:
    | (StoreRecord & { gstin?: string | null; drugLicense?: string | null })
    | null;
  payment?: CounterPaymentRecord | null;
  generatedAt?: Date;
}) {
  const sale = input.sale;
  const generatedAt = input.generatedAt ?? new Date();
  const invoiceLines = input.lines.map(
    ({ line, productName, productHsnCode }) =>
      buildInvoiceLine({
        productName: normalizeEmpty(productName) ?? `PRODUCT-${line.productId}`,
        batchNo: normalizeEmpty(line.batchNo),
        expiryDate: toIso(line.expiryDate),
        quantity: toNumber(line.qty),
        mrp: toNumber(line.mrp),
        sellingPrice: toNumber(line.saleRate),
        discountAmount: toNumber(line.discountAmount),
        gstRate: toNumber(line.gstRate),
        hsnCode: normalizeEmpty(line.hsnCode) ?? normalizeEmpty(productHsnCode),
      })
  );
  const totals = computeInvoiceTotals(invoiceLines);
  const lineItems = input.lines.map(({ line }, idx) => {
    const invoiceLine = invoiceLines[idx];
    return {
      productId: line.productId,
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
  const payload = {
    type: "sale_invoice_snapshot",
    billNo: sale.billNo,
    invoiceDate: sale.confirmedAt
      ? new Date(Number(sale.confirmedAt)).toISOString()
      : generatedAt.toISOString(),
    storeId: sale.storeId,
    storeName: normalizeEmpty(input.store?.name) ?? `STORE-${sale.storeId}`,
    storeAddress: normalizeEmpty(input.store?.address),
    storeGSTIN: normalizeEmpty(input.store?.gstin),
    storeDrugLicense: normalizeEmpty(input.store?.drugLicense),
    pharmacistName: normalizeEmpty(sale.pharmacistName),
    pharmacistLicense: normalizeEmpty(
      sale.pharmacistRegNo ?? sale.pharmacistCode
    ),
    customerId: sale.customerId ?? null,
    customerName: normalizeEmpty(sale.customerName),
    customerPhone: normalizeEmpty(sale.customerMobile),
    customerAddress: null,
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
    statutoryCompleteness: null as ReturnType<
      typeof evaluateStatutoryCompleteness
    > | null,
  };
  payload.statutoryCompleteness = evaluateStatutoryCompleteness(payload);
  return payload;
}

export async function createSaleInvoiceSnapshot(
  db: NonNullable<DrizzleDb>,
  saleId: string,
  opts: {
    generatedBy?: string | number | null;
    pdfFileKey?: string | null;
    pdfFileUrl?: string | null;
    failureReason?: string | null;
  } = {}
) {
  const snapshotStatus: InferSelectModel<typeof invoiceSnapshots>["status"] =
    "generated";
  const existing = await db
    .select()
    .from(invoiceSnapshots)
    .where(
      and(
        eq(invoiceSnapshots.saleId, saleId),
        eq(invoiceSnapshots.status, snapshotStatus)
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
    .leftJoin(products, sql`${saleLines.productId} = ${products.id}`)
    .where(eq(saleLines.saleId, saleId));
  const [store] = await db
    .select()
    .from(stores)
    .where(eq(stores.id, Number(sale.storeId)))
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
    store: store ?? null,
    payment: payment ?? null,
  });
  const status: InvoiceSnapshotStatus = opts.failureReason
    ? "failed"
    : opts.pdfFileKey && opts.pdfFileUrl
      ? "pdf_generated"
      : "generated";
  const [inserted] = (await db.insert(invoiceSnapshots).values({
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
  })) as unknown as [ResultSetHeader];
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

export async function getInvoiceSnapshotPackageForSale(
  db: NonNullable<DrizzleDb>,
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
  if (
    !assertCustomerCanAccessInvoiceSnapshot(
      snapshot as unknown as InsurerSnapshotInput & {
        customerId?: string | null;
      },
      user
    )
  ) {
    const error: Error & { code?: string } = new Error(
      "invoice_snapshot_forbidden"
    );
    error.code = "FORBIDDEN";
    throw error;
  }
  return buildInsurerReadyInvoicePackage(
    snapshot as unknown as InsurerSnapshotInput
  );
}

type OrderItemRow = {
  productId: number | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  name: string | null;
  hsnCode: string | null;
  gstRate: string | null;
};

export function buildOrderInvoiceSnapshotPayload(input: {
  order: OrderRecord;
  items: OrderItemRow[];
  store?: StoreRecord | null;
  customer?: UserRecord | null;
  generatedAt?: Date;
}) {
  const order = input.order;
  const generatedAt = input.generatedAt ?? new Date();
  const invoiceLines = input.items.map(item => {
    const unitPrice =
      toNumber(item.unitPrice ?? item.lineTotal) /
      Math.max(1, toNumber(item.quantity) || 1);
    return buildInvoiceLine({
      productName:
        normalizeEmpty(item.name) ?? `PRODUCT-${item.productId ?? "?"}`,
      batchNo: null,
      expiryDate: null,
      quantity: toNumber(item.quantity),
      mrp: unitPrice,
      sellingPrice: unitPrice,
      discountAmount: 0,
      gstRate: toNumber(item.gstRate),
      hsnCode: normalizeEmpty(item.hsnCode),
    });
  });
  const totals = computeInvoiceTotals(invoiceLines);
  const lineItems = input.items.map((item, idx) => {
    const invoiceLine = invoiceLines[idx];
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
  const payload = {
    type: "order_invoice_snapshot",
    billNo: `ORDER-${order.id}`,
    invoiceDate: order.deliveredAt
      ? new Date(order.deliveredAt).toISOString()
      : generatedAt.toISOString(),
    storeId: String(order.storeId),
    storeName: normalizeEmpty(input.store?.name) ?? `STORE-${order.storeId}`,
    storeAddress: normalizeEmpty(input.store?.address),
    storeGSTIN: null,
    storeDrugLicense: null,
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
    statutoryCompleteness: null as ReturnType<
      typeof evaluateStatutoryCompleteness
    > | null,
  };
  payload.statutoryCompleteness = evaluateStatutoryCompleteness(payload);
  return payload;
}

export async function createOrderInvoiceSnapshot(
  db: NonNullable<DrizzleDb>,
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
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
  const [store] = await db
    .select()
    .from(stores)
    .where(eq(stores.id, Number(order.storeId)))
    .limit(1);
  const [customer] = await db
    .select()
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1);
  const snapshotJson = buildOrderInvoiceSnapshotPayload({
    order,
    items: itemRows,
    store: store ?? null,
    customer: customer ?? null,
  });
  const status: InvoiceSnapshotStatus = opts.failureReason
    ? "failed"
    : opts.pdfFileKey && opts.pdfFileUrl
      ? "pdf_generated"
      : "generated";
  const [inserted] = (await db.insert(invoiceSnapshots).values({
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
  })) as unknown as [ResultSetHeader];
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
