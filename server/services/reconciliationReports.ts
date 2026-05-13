import { redactObject } from "../_core/redact";

export type ReportEnvelope<Row, Totals extends Record<string, unknown>> = {
  rows: Row[];
  totals: Totals;
  csvData: Row[];
  mismatchCount?: number;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isMissing(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    Number.isNaN(value)
  );
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumBy<Row>(rows: Row[], selector: (row: Row) => number): number {
  return rows.reduce((total, row) => total + selector(row), 0);
}

export type StockReconciliationInputRow = {
  productId: number;
  storeId: number;
  productName?: string | null;
  storeName?: string | null;
  ledgerOnHand?: unknown;
  ledgerReserved?: unknown;
  ledgerQuarantined?: unknown;
  ledgerExpired?: unknown;
  activeReservationQty?: unknown;
  storeSkuStock?: unknown;
  storeSkuSoftLocked?: unknown;
  movementProjectedOnHand?: unknown;
  canonicalAvailable?: unknown;
  batchCount?: unknown;
};

export type StockReconciliationRow = {
  productId: number;
  storeId: number;
  productName: string | null;
  storeName: string | null;
  ledgerOnHand: number;
  ledgerReserved: number;
  activeReservationQty: number;
  ledgerQuarantined: number;
  ledgerExpired: number;
  storeSkuStock: number;
  storeSkuSoftLocked: number;
  movementProjectedOnHand: number;
  canonicalAvailable: number;
  expectedCanonicalAvailable: number;
  batchCount: number;
  mismatches: string[];
};

export function buildStockReconciliationReport(
  inputRows: StockReconciliationInputRow[]
): ReportEnvelope<
  StockReconciliationRow,
  {
    rowCount: number;
    ledgerOnHand: number;
    canonicalAvailable: number;
    activeReservationQty: number;
    mismatchCount: number;
  }
> {
  const rows = inputRows.map(row => {
    const ledgerOnHand = toNumber(row.ledgerOnHand);
    const ledgerReserved = toNumber(row.ledgerReserved);
    const activeReservationQty = toNumber(row.activeReservationQty);
    const ledgerQuarantined = toNumber(row.ledgerQuarantined);
    const ledgerExpired = toNumber(row.ledgerExpired);
    const storeSkuStock = toNumber(row.storeSkuStock);
    const storeSkuSoftLocked = toNumber(row.storeSkuSoftLocked);
    const movementProjectedOnHand = toNumber(row.movementProjectedOnHand);
    const canonicalAvailable = toNumber(row.canonicalAvailable);
    const expectedCanonicalAvailable =
      ledgerOnHand -
      ledgerReserved -
      activeReservationQty -
      ledgerQuarantined -
      ledgerExpired;
    const mismatches: string[] = [];

    if (canonicalAvailable !== expectedCanonicalAvailable)
      mismatches.push("canonicalAvailability");
    if (storeSkuStock !== ledgerOnHand) mismatches.push("storeSkuStock");
    if (storeSkuSoftLocked !== activeReservationQty)
      mismatches.push("storeSkuSoftLocked");
    if (
      movementProjectedOnHand !== 0 &&
      movementProjectedOnHand !== ledgerOnHand
    )
      mismatches.push("stockMovements");

    return {
      productId: row.productId,
      storeId: row.storeId,
      productName: row.productName ?? null,
      storeName: row.storeName ?? null,
      ledgerOnHand,
      ledgerReserved,
      activeReservationQty,
      ledgerQuarantined,
      ledgerExpired,
      storeSkuStock,
      storeSkuSoftLocked,
      movementProjectedOnHand,
      canonicalAvailable,
      expectedCanonicalAvailable,
      batchCount: toNumber(row.batchCount),
      mismatches,
    };
  });
  const mismatchCount = rows.filter(row => row.mismatches.length > 0).length;
  return {
    rows,
    totals: {
      rowCount: rows.length,
      ledgerOnHand: sumBy(rows, row => row.ledgerOnHand),
      canonicalAvailable: sumBy(rows, row => row.canonicalAvailable),
      activeReservationQty: sumBy(rows, row => row.activeReservationQty),
      mismatchCount,
    },
    csvData: rows,
    mismatchCount,
  };
}

export type H1CompletenessInputRow = Record<string, unknown> & {
  id: number;
  storeId?: number | null;
};
export type H1CompletenessRow = H1CompletenessInputRow & {
  missingFlags: string[];
  missingCount: number;
  saleRef: unknown;
  saleLineRef: unknown;
  doctorName: unknown;
};

export const H1_COMPLETENESS_FIELDS = [
  "billNo",
  "patientName",
  "patientPhone",
  "drugName",
  "batchNo",
  "qty",
  "pharmacistId",
  "prescriptionRef",
  "saleRef",
  "saleLineRef",
  "doctorName",
] as const;

export function buildH1CompletenessReport(
  inputRows: H1CompletenessInputRow[]
): ReportEnvelope<
  H1CompletenessRow,
  {
    rowCount: number;
    incompleteCount: number;
    missingFieldCounts: Record<string, number>;
  }
> {
  const missingFieldCounts: Record<string, number> = {};
  const rows = inputRows.map(raw => {
    const saleRef = raw.saleRef ?? raw.saleId ?? raw.orderId ?? null;
    const saleLineRef = raw.saleLineRef ?? raw.prescriptionLineId ?? null;
    const doctorName = raw.doctorName ?? raw.prescribingDoctor ?? null;
    const enriched: H1CompletenessRow = {
      ...raw,
      saleRef,
      saleLineRef,
      doctorName,
      missingFlags: [],
      missingCount: 0,
    };

    for (const field of H1_COMPLETENESS_FIELDS) {
      if (isMissing(enriched[field])) {
        enriched.missingFlags.push(field);
        missingFieldCounts[field] = (missingFieldCounts[field] ?? 0) + 1;
      }
    }
    enriched.missingCount = enriched.missingFlags.length;
    return enriched;
  });

  return {
    rows,
    totals: {
      rowCount: rows.length,
      incompleteCount: rows.filter(row => row.missingCount > 0).length,
      missingFieldCounts,
    },
    csvData: rows,
  };
}

export type PaymentConsistencyInputRow = {
  orderId: number;
  storeId: number;
  status?: string | null;
  orderTotal?: unknown;
  paidAmountPaise?: unknown;
  paidRecordCount?: unknown;
  paymentRecordCount?: unknown;
  refundedAmountPaise?: unknown;
  refundRecordCount?: unknown;
  invoiceUrl?: string | null;
  invoiceKey?: string | null;
  billNoCount?: unknown;
  distinctBillNoCount?: unknown;
};

export type PaymentConsistencyRow = {
  orderId: number;
  storeId: number;
  status: string | null;
  orderTotal: number;
  paidAmount: number;
  paidRecordCount: number;
  paymentRecordCount: number;
  refundedAmount: number;
  refundRecordCount: number;
  hasInvoiceReference: boolean;
  billNoCount: number;
  distinctBillNoCount: number;
  currentRefundSource: string;
  mismatches: string[];
};

export function buildPaymentConsistencyReport(
  inputRows: PaymentConsistencyInputRow[]
): ReportEnvelope<
  PaymentConsistencyRow,
  {
    rowCount: number;
    orderTotal: number;
    paidAmount: number;
    refundedAmount: number;
    mismatchCount: number;
    currentRefundSource: string;
  }
> {
  const rows = inputRows.map(row => {
    const orderTotal = round2(toNumber(row.orderTotal));
    const paidAmount = round2(toNumber(row.paidAmountPaise) / 100);
    const refundedAmount = round2(toNumber(row.refundedAmountPaise) / 100);
    const paidRecordCount = toNumber(row.paidRecordCount);
    const paymentRecordCount = toNumber(row.paymentRecordCount);
    const billNoCount = toNumber(row.billNoCount);
    const distinctBillNoCount = toNumber(row.distinctBillNoCount);
    const hasInvoiceReference =
      !isMissing(row.invoiceUrl) ||
      !isMissing(row.invoiceKey) ||
      distinctBillNoCount > 0;
    const mismatches: string[] = [];

    if (
      ["delivered", "closed"].includes(row.status ?? "") &&
      paidAmount + refundedAmount < orderTotal
    )
      mismatches.push("paidLessThanOrderTotal");
    if (
      ["delivered", "closed"].includes(row.status ?? "") &&
      paymentRecordCount === 0
    )
      mismatches.push("missingPaymentRecord");
    if (
      ["delivered", "closed"].includes(row.status ?? "") &&
      !hasInvoiceReference
    )
      mismatches.push("missingInvoiceReference");
    if (billNoCount !== distinctBillNoCount)
      mismatches.push("duplicateBillNoReferences");

    return {
      orderId: row.orderId,
      storeId: row.storeId,
      status: row.status ?? null,
      orderTotal,
      paidAmount,
      paidRecordCount,
      paymentRecordCount,
      refundedAmount,
      refundRecordCount: toNumber(row.refundRecordCount),
      hasInvoiceReference,
      billNoCount,
      distinctBillNoCount,
      currentRefundSource: "payment_records.refundId/refundedAt/status",
      mismatches,
    };
  });
  const mismatchCount = rows.filter(row => row.mismatches.length > 0).length;
  return {
    rows,
    totals: {
      rowCount: rows.length,
      orderTotal: round2(sumBy(rows, row => row.orderTotal)),
      paidAmount: round2(sumBy(rows, row => row.paidAmount)),
      refundedAmount: round2(sumBy(rows, row => row.refundedAmount)),
      mismatchCount,
      currentRefundSource:
        "payment_records.refundId/refundedAt/status until refund ledger branch lands",
    },
    csvData: rows,
    mismatchCount,
  };
}

export type SupplierOutstandingInputRow = {
  supplierId: number;
  supplierName?: string | null;
  storeId: number;
  invoiceTotal?: unknown;
  committedInvoiceCount?: unknown;
  paymentTotal?: unknown;
  returnCreditTotal?: unknown;
};

export type SupplierOutstandingRow = {
  supplierId: number;
  supplierName: string | null;
  storeId: number;
  invoiceTotal: number;
  committedInvoiceCount: number;
  paymentTotal: number;
  returnCreditTotal: number;
  outstandingAmount: number;
  mismatches: string[];
};

export function buildSupplierOutstandingReport(
  inputRows: SupplierOutstandingInputRow[]
): ReportEnvelope<
  SupplierOutstandingRow,
  {
    rowCount: number;
    invoiceTotal: number;
    paymentTotal: number;
    returnCreditTotal: number;
    outstandingAmount: number;
    mismatchCount: number;
  }
> {
  const rows = inputRows.map(row => {
    const invoiceTotal = round2(toNumber(row.invoiceTotal));
    const paymentTotal = round2(toNumber(row.paymentTotal));
    const returnCreditTotal = round2(toNumber(row.returnCreditTotal));
    const outstandingAmount = round2(
      invoiceTotal - paymentTotal - returnCreditTotal
    );
    const mismatches = outstandingAmount < 0 ? ["overpaidOrOverCredited"] : [];
    return {
      supplierId: row.supplierId,
      supplierName: row.supplierName ?? null,
      storeId: row.storeId,
      invoiceTotal,
      committedInvoiceCount: toNumber(row.committedInvoiceCount),
      paymentTotal,
      returnCreditTotal,
      outstandingAmount,
      mismatches,
    };
  });
  const mismatchCount = rows.filter(row => row.mismatches.length > 0).length;
  return {
    rows,
    totals: {
      rowCount: rows.length,
      invoiceTotal: round2(sumBy(rows, row => row.invoiceTotal)),
      paymentTotal: round2(sumBy(rows, row => row.paymentTotal)),
      returnCreditTotal: round2(sumBy(rows, row => row.returnCreditTotal)),
      outstandingAmount: round2(sumBy(rows, row => row.outstandingAmount)),
      mismatchCount,
    },
    csvData: rows,
    mismatchCount,
  };
}

export type DailyGstInputRow = {
  date: string;
  storeId: number;
  taxableValue?: unknown;
  gstAmount?: unknown;
  grossSales?: unknown;
  discounts?: unknown;
  refundsOrReturns?: unknown;
  invoiceCount?: unknown;
};

export type DailyGstRow = {
  date: string;
  storeId: number;
  taxableValue: number;
  gstAmount: number;
  grossSales: number;
  discounts: number;
  refundsOrReturns: number;
  invoiceCount: number;
};

export function buildDailyGstReport(
  inputRows: DailyGstInputRow[]
): ReportEnvelope<
  DailyGstRow,
  {
    rowCount: number;
    taxableValue: number;
    gstAmount: number;
    grossSales: number;
    discounts: number;
    refundsOrReturns: number;
    invoiceCount: number;
  }
> {
  const rows = inputRows.map(row => ({
    date: row.date,
    storeId: row.storeId,
    taxableValue: round2(toNumber(row.taxableValue)),
    gstAmount: round2(toNumber(row.gstAmount)),
    grossSales: round2(toNumber(row.grossSales)),
    discounts: round2(toNumber(row.discounts)),
    refundsOrReturns: round2(toNumber(row.refundsOrReturns)),
    invoiceCount: toNumber(row.invoiceCount),
  }));
  return {
    rows,
    totals: {
      rowCount: rows.length,
      taxableValue: round2(sumBy(rows, row => row.taxableValue)),
      gstAmount: round2(sumBy(rows, row => row.gstAmount)),
      grossSales: round2(sumBy(rows, row => row.grossSales)),
      discounts: round2(sumBy(rows, row => row.discounts)),
      refundsOrReturns: round2(sumBy(rows, row => row.refundsOrReturns)),
      invoiceCount: sumBy(rows, row => row.invoiceCount),
    },
    csvData: rows,
  };
}

export function redactReportPayload<T>(payload: T): T {
  return redactObject(payload);
}
