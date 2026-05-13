/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";

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
      !OPEN_PURCHASE_STATUSES.includes(invoice.status as any)
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

export async function recordSupplierPayable(
  db: any,
  input: {
    supplierId: number;
    purchaseInvoiceId: number;
    storeId: number;
    amount: number;
    actorId: number;
    actorRole: string;
    source: string;
  },
  ctx?: any
) {
  const { supplierPayments } = await import("../../drizzle/schema");
  const [existing] = await db
    .select()
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.purchaseInvoiceId, input.purchaseInvoiceId),
        eq(supplierPayments.paymentMode, "credit" as any)
      )
    )
    .limit(1);
  if (existing) return { idempotent: true, paymentId: existing.id };
  const [res] = await db.insert(supplierPayments).values({
    supplierId: input.supplierId,
    purchaseInvoiceId: input.purchaseInvoiceId,
    storeId: input.storeId,
    amount: String(input.amount),
    paymentMode: "credit",
    paymentDate: new Date(),
    notes: "Auto payable entry",
    createdBy: input.actorId,
  });
  const id = res.insertId;
  await logAudit(
    {
      action: "supplier.payable.created",
      entityType: "purchase_invoice",
      entityId: input.purchaseInvoiceId,
      afterJson: { amount: input.amount, paymentId: id },
    },
    ctx
  );
  return { success: true, paymentId: id };
}

export async function recordSupplierPayment(db: any, input: any, ctx?: any) {
  const { supplierPayments } = await import("../../drizzle/schema");
  const [res] = await db.insert(supplierPayments).values(input);
  const id = res.insertId;
  await logAudit(
    {
      action: "supplier.payment.recorded",
      entityType: "supplier_payment",
      entityId: id,
      afterJson: input,
    },
    ctx
  );
  return { id };
}

export async function allocatePaymentToInvoice(
  db: any,
  input: {
    supplierPaymentId: number;
    purchaseInvoiceId?: number;
    purchaseReturnId?: number;
    amount: number;
    allocationType: SupplierAllocationType;
    allocatedBy?: number;
    createdBy?: number;
  },
  ctx?: any
) {
  if (input.amount <= 0)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Allocation amount must be positive",
    });
  const { supplierPaymentAllocations } = await import("../../drizzle/schema");
  const actorId = input.allocatedBy ?? input.createdBy ?? null;
  const [existing] = await db
    .select()
    .from(supplierPaymentAllocations)
    .where(
      and(
        eq(
          supplierPaymentAllocations.supplierPaymentId,
          input.supplierPaymentId
        ),
        input.purchaseInvoiceId
          ? eq(
              supplierPaymentAllocations.purchaseInvoiceId,
              input.purchaseInvoiceId
            )
          : isNull(supplierPaymentAllocations.purchaseInvoiceId),
        eq(supplierPaymentAllocations.allocationType, input.allocationType)
      )
    )
    .limit(1);
  if (existing) return { idempotent: true, allocationId: existing.id };
  const values: any = {
    supplierPaymentId: input.supplierPaymentId,
    purchaseInvoiceId: input.purchaseInvoiceId ?? null,
    purchaseReturnId: input.purchaseReturnId ?? null,
    amount: String(input.amount),
    allocationType: input.allocationType,
    createdBy: actorId,
    allocatedBy: actorId,
  };
  const [res] = await db.insert(supplierPaymentAllocations).values(values);
  const id = res.insertId;
  await logAudit(
    {
      action: "supplier.payment.allocated",
      entityType: "supplier_payment",
      entityId: input.supplierPaymentId,
      afterJson: { ...input, allocatedBy: actorId, allocationId: id },
    },
    ctx
  );
  return { success: true, allocationId: id };
}

export async function allocateSupplierPayment(
  db: any,
  input: {
    supplierPaymentId: number;
    supplierId: number;
    invoiceIds?: number[];
    createdBy?: number;
  },
  ctx?: any
) {
  const { purchaseInvoices, supplierPayments } = await import(
    "../../drizzle/schema"
  );
  const [payment] = await db
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.id, input.supplierPaymentId))
    .limit(1);
  if (!payment)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Supplier payment not found",
    });
  if (payment.supplierId !== input.supplierId)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Payment supplier mismatch",
    });
  const invoices = input.invoiceIds?.length
    ? await db
        .select()
        .from(purchaseInvoices)
        .where(
          and(
            inArray(purchaseInvoices.id, input.invoiceIds),
            eq(purchaseInvoices.supplierId, input.supplierId),
            eq(purchaseInvoices.storeId, payment.storeId)
          )
        )
    : [];
  let remaining = await getUnallocatedPaymentAmount(
    db,
    input.supplierPaymentId
  );
  const allocations = [] as any[];
  for (const inv of invoices) {
    if (remaining <= 0) break;
    const out = await getInvoiceOutstanding(db, inv.id);
    if (out <= 0) continue;
    const applied = roundMoney(Math.min(remaining, out));
    const alloc = await allocatePaymentToInvoice(
      db,
      {
        supplierPaymentId: input.supplierPaymentId,
        purchaseInvoiceId: inv.id,
        amount: applied,
        allocationType:
          payment.paymentMode === "advance"
            ? "advance_applied"
            : "invoice_payment",
        allocatedBy: input.createdBy,
      },
      ctx
    );
    allocations.push({ invoiceId: inv.id, amount: applied, ...alloc });
    remaining = roundMoney(remaining - applied);
  }
  return { success: true, allocations, unallocated: remaining };
}

export async function recordSupplierAdvance(
  db: any,
  input: {
    supplierId: number;
    storeId: number;
    amount: number;
    createdBy: number;
    referenceNo?: string;
  },
  ctx?: any
) {
  const payment = await recordSupplierPayment(
    db,
    {
      supplierId: input.supplierId,
      storeId: input.storeId,
      purchaseInvoiceId: null,
      amount: String(input.amount),
      paymentMode: "advance",
      referenceNo: input.referenceNo ?? null,
      notes: "supplier advance",
      createdBy: input.createdBy,
    },
    ctx
  );
  return { ...payment, advance: true };
}

export async function applySupplierDebitNote(
  db: any,
  input: {
    supplierId: number;
    purchaseInvoiceId?: number;
    storeId: number;
    amount: number;
    createdBy: number;
    reason?: string;
  },
  ctx?: any
) {
  const payment = await recordSupplierPayment(
    db,
    {
      supplierId: input.supplierId,
      storeId: input.storeId,
      purchaseInvoiceId: input.purchaseInvoiceId ?? null,
      amount: String(input.amount),
      paymentMode: "debit_note",
      notes: input.reason ?? "debit note",
      createdBy: input.createdBy,
    },
    ctx
  );
  await allocatePaymentToInvoice(
    db,
    {
      supplierPaymentId: payment.id,
      purchaseInvoiceId: input.purchaseInvoiceId,
      amount: input.amount,
      allocationType: "debit_note",
      allocatedBy: input.createdBy,
    },
    ctx
  );
  return payment;
}

export async function applyPurchaseReturnCredit(
  db: any,
  input: {
    supplierId: number;
    purchaseInvoiceId: number;
    purchaseReturnId: number;
    storeId: number;
    amount: number;
    createdBy: number;
  },
  ctx?: any
) {
  const payment = await recordSupplierPayment(
    db,
    {
      supplierId: input.supplierId,
      storeId: input.storeId,
      purchaseInvoiceId: input.purchaseInvoiceId,
      amount: String(input.amount),
      paymentMode: "return_credit",
      notes: `purchase return credit:${input.purchaseReturnId}`,
      createdBy: input.createdBy,
    },
    ctx
  );
  await allocatePaymentToInvoice(
    db,
    {
      supplierPaymentId: payment.id,
      purchaseInvoiceId: input.purchaseInvoiceId,
      purchaseReturnId: input.purchaseReturnId,
      amount: input.amount,
      allocationType: "return_credit",
      allocatedBy: input.createdBy,
    },
    ctx
  );
  return payment;
}

export async function getUnallocatedPaymentAmount(
  db: any,
  supplierPaymentId: number
) {
  const { supplierPayments, supplierPaymentAllocations } = await import(
    "../../drizzle/schema"
  );
  const [p] = await db
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.id, supplierPaymentId));
  if (!p) throw new TRPCError({ code: "NOT_FOUND" });
  const [a] = await db
    .select({
      allocated: sql<number>`coalesce(sum(${supplierPaymentAllocations.amount}),0)`,
    })
    .from(supplierPaymentAllocations)
    .where(eq(supplierPaymentAllocations.supplierPaymentId, supplierPaymentId));
  return roundMoney(toMoney(p.amount) - toMoney(a?.allocated));
}

export async function getInvoiceOutstanding(
  db: any,
  purchaseInvoiceId: number
) {
  const { purchaseInvoices, supplierPaymentAllocations, purchaseReturns } =
    await import("../../drizzle/schema");
  const [inv] = await db
    .select()
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.id, purchaseInvoiceId));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
  const allocations = await db
    .select()
    .from(supplierPaymentAllocations)
    .where(eq(supplierPaymentAllocations.purchaseInvoiceId, purchaseInvoiceId));
  const [r] = await db
    .select({
      returned: sql<number>`coalesce(sum(${purchaseReturns.totalAmount}),0)`,
    })
    .from(purchaseReturns)
    .where(
      and(
        eq(purchaseReturns.purchaseInvoiceId, purchaseInvoiceId),
        eq(purchaseReturns.status, "committed" as any)
      )
    );
  const nonReturnAllocated = allocations
    .filter((allocation: any) => allocation.allocationType !== "return_credit")
    .reduce(
      (sum: number, allocation: any) => sum + toMoney(allocation.amount),
      0
    );
  const allocatedReturnCredit = allocations
    .filter((allocation: any) => allocation.allocationType === "return_credit")
    .reduce(
      (sum: number, allocation: any) => sum + toMoney(allocation.amount),
      0
    );
  const allocated = roundMoney(
    nonReturnAllocated + Math.max(allocatedReturnCredit, toMoney(r?.returned))
  );
  return roundMoney(Math.max(0, toMoney(inv.netAmount) - allocated));
}

export async function getSupplierOutstanding(
  db: any,
  supplierId: number,
  storeId?: number
) {
  const report = await getSupplierReconciliationReport(db, {
    supplierId,
    storeId,
  });
  return {
    supplierId,
    storeId: storeId ?? null,
    outstanding: report.totals.outstandingAmount,
    advances: report.totals.advances,
  };
}

export async function getSupplierLedger(db: any, supplierId: number) {
  const { supplierPayments } = await import("../../drizzle/schema");
  const rows = await db
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.supplierId, supplierId));
  return rows.map((r: any) => ({
    ...r,
    transactionType:
      r.paymentMode === "credit" ? "invoice_payable" : r.paymentMode,
  }));
}

async function loadSupplierReconciliationInputs(
  db: any,
  filters: SupplierReconciliationFilters
) {
  const {
    purchaseInvoices,
    supplierPaymentAllocations,
    supplierPayments,
    purchaseReturns,
    suppliers,
  } = await import("../../drizzle/schema");
  const invoiceConds: any[] = [
    inArray(purchaseInvoices.status, OPEN_PURCHASE_STATUSES as any),
  ];
  if (filters.supplierId)
    invoiceConds.push(eq(purchaseInvoices.supplierId, filters.supplierId));
  if (filters.storeId)
    invoiceConds.push(eq(purchaseInvoices.storeId, filters.storeId));

  const invoiceRows = await db
    .select({ invoice: purchaseInvoices, supplierName: suppliers.supplierName })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(and(...invoiceConds));

  const invoices: SupplierLedgerInvoiceInput[] = invoiceRows.map(
    (row: any) => ({ ...row.invoice, supplierName: row.supplierName ?? null })
  );
  const invoiceIds = invoices.map(invoice => invoice.id);
  if (!invoiceIds.length)
    return { invoices, allocations: [], purchaseReturns: [], advances: [] };

  const allocations = await db
    .select({ allocation: supplierPaymentAllocations })
    .from(supplierPaymentAllocations)
    .where(inArray(supplierPaymentAllocations.purchaseInvoiceId, invoiceIds));

  const returnConds: any[] = [
    inArray(purchaseReturns.purchaseInvoiceId, invoiceIds),
    eq(purchaseReturns.status, "committed" as any),
  ];
  if (filters.supplierId)
    returnConds.push(eq(purchaseReturns.supplierId, filters.supplierId));
  if (filters.storeId)
    returnConds.push(eq(purchaseReturns.storeId, filters.storeId));
  const returnRows = await db
    .select()
    .from(purchaseReturns)
    .where(and(...returnConds));

  const advanceConds: any[] = [
    eq(supplierPayments.paymentMode, "advance" as any),
  ];
  if (filters.supplierId)
    advanceConds.push(eq(supplierPayments.supplierId, filters.supplierId));
  if (filters.storeId)
    advanceConds.push(eq(supplierPayments.storeId, filters.storeId));
  const advanceRows = await db
    .select({
      payment: supplierPayments,
      allocatedAmount: sql<number>`coalesce(sum(${supplierPaymentAllocations.amount}),0)`,
    })
    .from(supplierPayments)
    .leftJoin(
      supplierPaymentAllocations,
      eq(supplierPaymentAllocations.supplierPaymentId, supplierPayments.id)
    )
    .where(and(...advanceConds))
    .groupBy(supplierPayments.id);

  return {
    invoices,
    allocations: allocations.map((row: any) => row.allocation),
    purchaseReturns: returnRows,
    advances: advanceRows.map((row: any) => ({
      ...row.payment,
      allocatedAmount: row.allocatedAmount,
    })),
  };
}

export async function getSupplierAgeing(
  db: any,
  filters: number | SupplierReconciliationFilters
) {
  const normalized =
    typeof filters === "number" ? { supplierId: filters } : filters;
  const report = await getSupplierReconciliationReport(db, normalized);
  return {
    rows: report.ageing,
    totals: {
      count: report.ageing.length,
      outstanding: report.totals.outstandingAmount,
    },
    csvData: report.csvData,
  };
}

export async function getSupplierReconciliationReport(
  db: any,
  filters: SupplierReconciliationFilters = {}
) {
  const loaded = await loadSupplierReconciliationInputs(db, filters);
  return buildSupplierReconciliationReport({
    ...loaded,
    asOfDate: filters.asOfDate,
  });
}

export async function reconcileSupplierBalance(
  db: any,
  supplierId: number,
  storeId?: number
) {
  return getSupplierReconciliationReport(db, { supplierId, storeId });
}

export async function markInvoicePaidIfSettled(
  db: any,
  purchaseInvoiceId: number
) {
  const { purchaseInvoices } = await import("../../drizzle/schema");
  const [inv] = await db
    .select()
    .from(purchaseInvoices)
    .where(eq(purchaseInvoices.id, purchaseInvoiceId));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
  const outstanding = await getInvoiceOutstanding(db, purchaseInvoiceId);
  return { settled: outstanding <= 0 };
}
