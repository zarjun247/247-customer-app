export type SupplierAllocationType =
  | "invoice_payment"
  | "advance_applied"
  | "debit_note"
  | "return_credit"
  | "adjustment";

export type SupplierLedgerInvoiceInput = {
  id: number;
  supplierId: number;
  supplierName?: string | null;
  storeId: number;
  invoiceNo?: string | null;
  invoiceDate: Date | string;
  dueDate?: Date | string | null;
  netAmount?: string | number | null;
  totalAmount?: string | number | null;
  status?: string | null;
};

export type SupplierLedgerAllocationInput = {
  purchaseInvoiceId?: number | null;
  supplierPaymentId?: number | null;
  amount: string | number;
  allocationType: SupplierAllocationType;
};

export type SupplierLedgerReturnInput = {
  id?: number;
  purchaseInvoiceId: number;
  supplierId?: number;
  storeId?: number;
  totalAmount?: string | number | null;
  status?: string | null;
};

export type SupplierAdvanceInput = {
  id?: number;
  supplierId: number;
  storeId: number;
  amount: string | number;
  allocatedAmount?: string | number | null;
  paymentMode?: string | null;
};

export type SupplierReconciliationFilters = {
  supplierId?: number;
  storeId?: number;
  asOfDate?: Date;
};

export type SupplierInvoiceReconciliationRow = {
  supplierId: number;
  supplierName: string | null;
  storeId: number;
  purchaseInvoiceId: number;
  invoiceNo: string | null;
  invoiceDate: Date | string;
  dueDate: Date | string | null;
  invoiceAmount: number;
  paidAmount: number;
  allocatedAmount: number;
  debitNotes: number;
  purchaseReturns: number;
  adjustments: number;
  advances: number;
  outstandingAmount: number;
  ageingDays: number;
  ageingBucket:
    | "bucket0To30"
    | "bucket31To60"
    | "bucket61To90"
    | "bucket90Plus";
  reconciliationStatus: "internal_open" | "internal_settled";
};

export type SupplierAgeingRow = {
  supplierId: number;
  supplierName: string | null;
  totalOutstanding: number;
  bucket0To30: number;
  bucket31To60: number;
  bucket61To90: number;
  bucket90Plus: number;
  invoiceCount: number;
};

const OPEN_PURCHASE_STATUSES = ["committed", "partially_returned"] as const;
const PAYMENT_ALLOCATION_TYPES: SupplierAllocationType[] = [
  "invoice_payment",
  "advance_applied",
];

function toMoney(value: string | number | null | undefined): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateOnly(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function ageingDaysFor(
  invoice: SupplierLedgerInvoiceInput,
  asOfDate: Date
): number {
  const basis = invoice.dueDate ?? invoice.invoiceDate;
  const diff = dateOnly(asOfDate).getTime() - dateOnly(basis).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function ageingBucketFor(
  days: number
): SupplierInvoiceReconciliationRow["ageingBucket"] {
  if (days <= 30) return "bucket0To30";
  if (days <= 60) return "bucket31To60";
  if (days <= 90) return "bucket61To90";
  return "bucket90Plus";
}

function csvEscape(value: unknown): string {
  let raw: string;
  if (value == null) {
    raw = "";
  } else if (typeof value === "object") {
    raw = JSON.stringify(value);
  } else {
    const prim = value as string | number | boolean | bigint;
    raw = String(prim);
  }
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function buildSupplierReconciliationReport(input: {
  invoices: SupplierLedgerInvoiceInput[];
  allocations?: SupplierLedgerAllocationInput[];
  purchaseReturns?: SupplierLedgerReturnInput[];
  advances?: SupplierAdvanceInput[];
  asOfDate?: Date;
}) {
  const asOfDate = input.asOfDate ?? new Date();
  const allocationsByInvoice = new Map<
    number,
    SupplierLedgerAllocationInput[]
  >();
  for (const allocation of input.allocations ?? []) {
    if (!allocation.purchaseInvoiceId) continue;
    const list = allocationsByInvoice.get(allocation.purchaseInvoiceId) ?? [];
    list.push(allocation);
    allocationsByInvoice.set(allocation.purchaseInvoiceId, list);
  }

  const returnsByInvoice = new Map<number, number>();
  for (const purchaseReturn of input.purchaseReturns ?? []) {
    if (purchaseReturn.status && purchaseReturn.status !== "committed")
      continue;
    returnsByInvoice.set(
      purchaseReturn.purchaseInvoiceId,
      roundMoney(
        (returnsByInvoice.get(purchaseReturn.purchaseInvoiceId) ?? 0) +
          toMoney(purchaseReturn.totalAmount)
      )
    );
  }

  const advancesBySupplierStore = new Map<string, number>();
  for (const advance of input.advances ?? []) {
    if (advance.paymentMode && advance.paymentMode !== "advance") continue;
    const unallocated = Math.max(
      0,
      toMoney(advance.amount) - toMoney(advance.allocatedAmount)
    );
    const key = `${advance.supplierId}:${advance.storeId}`;
    advancesBySupplierStore.set(
      key,
      roundMoney((advancesBySupplierStore.get(key) ?? 0) + unallocated)
    );
  }

  const rows: SupplierInvoiceReconciliationRow[] = [];
  for (const invoice of input.invoices) {
    if (
      invoice.status &&
      !(OPEN_PURCHASE_STATUSES as readonly string[]).includes(
        invoice.status ?? ""
      )
    )
      continue;
    const invoiceAllocations = allocationsByInvoice.get(invoice.id) ?? [];
    const paidAmount = roundMoney(
      invoiceAllocations
        .filter(a => PAYMENT_ALLOCATION_TYPES.includes(a.allocationType))
        .reduce((sum, a) => sum + toMoney(a.amount), 0)
    );
    const debitNotes = roundMoney(
      invoiceAllocations
        .filter(a => a.allocationType === "debit_note")
        .reduce((sum, a) => sum + toMoney(a.amount), 0)
    );
    const allocatedReturnCredit = roundMoney(
      invoiceAllocations
        .filter(a => a.allocationType === "return_credit")
        .reduce((sum, a) => sum + toMoney(a.amount), 0)
    );
    const purchaseReturns = Math.max(
      returnsByInvoice.get(invoice.id) ?? 0,
      allocatedReturnCredit
    );
    const adjustments = roundMoney(
      invoiceAllocations
        .filter(a => a.allocationType === "adjustment")
        .reduce((sum, a) => sum + toMoney(a.amount), 0)
    );
    const allocatedAmount = roundMoney(
      paidAmount + debitNotes + purchaseReturns + adjustments
    );
    const invoiceAmount = toMoney(invoice.netAmount ?? invoice.totalAmount);
    const outstandingAmount = roundMoney(
      Math.max(0, invoiceAmount - allocatedAmount)
    );
    const ageingDays = ageingDaysFor(invoice, asOfDate);
    rows.push({
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName ?? null,
      storeId: invoice.storeId,
      purchaseInvoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo ?? null,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate ?? null,
      invoiceAmount,
      paidAmount,
      allocatedAmount,
      debitNotes,
      purchaseReturns,
      adjustments,
      advances:
        advancesBySupplierStore.get(
          `${invoice.supplierId}:${invoice.storeId}`
        ) ?? 0,
      outstandingAmount,
      ageingDays,
      ageingBucket: ageingBucketFor(ageingDays),
      reconciliationStatus:
        outstandingAmount <= 0 ? "internal_settled" : "internal_open",
    });
  }

  const ageingBySupplier = new Map<number, SupplierAgeingRow>();
  for (const row of rows) {
    if (row.outstandingAmount <= 0) continue;
    const current = ageingBySupplier.get(row.supplierId) ?? {
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      totalOutstanding: 0,
      bucket0To30: 0,
      bucket31To60: 0,
      bucket61To90: 0,
      bucket90Plus: 0,
      invoiceCount: 0,
    };
    current.totalOutstanding = roundMoney(
      current.totalOutstanding + row.outstandingAmount
    );
    current[row.ageingBucket] = roundMoney(
      current[row.ageingBucket] + row.outstandingAmount
    );
    current.invoiceCount += 1;
    ageingBySupplier.set(row.supplierId, current);
  }

  const totals = rows.reduce(
    (acc, row) => ({
      invoiceAmount: roundMoney(acc.invoiceAmount + row.invoiceAmount),
      paidAmount: roundMoney(acc.paidAmount + row.paidAmount),
      allocatedAmount: roundMoney(acc.allocatedAmount + row.allocatedAmount),
      debitNotes: roundMoney(acc.debitNotes + row.debitNotes),
      purchaseReturns: roundMoney(acc.purchaseReturns + row.purchaseReturns),
      adjustments: roundMoney(acc.adjustments + row.adjustments),
      advances: roundMoney(acc.advances + row.advances),
      outstandingAmount: roundMoney(
        acc.outstandingAmount + row.outstandingAmount
      ),
    }),
    {
      invoiceAmount: 0,
      paidAmount: 0,
      allocatedAmount: 0,
      debitNotes: 0,
      purchaseReturns: 0,
      adjustments: 0,
      advances: 0,
      outstandingAmount: 0,
    }
  );

  const csvRows = [
    [
      "supplierId",
      "supplierName",
      "storeId",
      "purchaseInvoiceId",
      "invoiceNo",
      "invoiceAmount",
      "paidAmount",
      "allocatedAmount",
      "debitNotes",
      "purchaseReturns",
      "advances",
      "outstandingAmount",
      "ageingDays",
      "ageingBucket",
      "reconciliationStatus",
    ],
    ...rows.map(row => [
      row.supplierId,
      row.supplierName,
      row.storeId,
      row.purchaseInvoiceId,
      row.invoiceNo,
      row.invoiceAmount,
      row.paidAmount,
      row.allocatedAmount,
      row.debitNotes,
      row.purchaseReturns,
      row.advances,
      row.outstandingAmount,
      row.ageingDays,
      row.ageingBucket,
      row.reconciliationStatus,
    ]),
  ];

  return {
    rows,
    ageing: Array.from(ageingBySupplier.values()),
    totals,
    csvData: csvRows.map(row => row.map(csvEscape).join(",")).join("\n"),
  };
}
