import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { logAudit } from "./audit";
import type { CtxLike } from "./audit";
import type { MySqlDatabase } from "drizzle-orm/mysql-core";
import type {
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
} from "drizzle-orm/mysql2";
import type { ResultSetHeader } from "mysql2";
import type { SupplierAllocationType } from "./supplierLedgerCore";
type DrizzleDb = MySqlDatabase<
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
  Record<string, unknown>
>;

function toMoney(value: string | number | null | undefined): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function recordSupplierPayment(
  db: DrizzleDb,
  input: Record<string, unknown>,
  ctx?: CtxLike
) {
  const { supplierPayments } = await import("../../drizzle/schema");
  type SupplierPaymentInsert = typeof supplierPayments.$inferInsert;
  const insertResult = await db
    .insert(supplierPayments)
    .values(input as unknown as SupplierPaymentInsert);
  const [header] = insertResult as unknown as [ResultSetHeader];
  const id = header.insertId;
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
  db: DrizzleDb,
  input: {
    supplierPaymentId: number;
    purchaseInvoiceId?: number;
    purchaseReturnId?: number;
    amount: number;
    allocationType: SupplierAllocationType;
    allocatedBy?: number;
    createdBy?: number;
  },
  ctx?: CtxLike
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
  const insertResult2 = await db.insert(supplierPaymentAllocations).values({
    supplierPaymentId: input.supplierPaymentId,
    purchaseInvoiceId: input.purchaseInvoiceId ?? null,
    purchaseReturnId: input.purchaseReturnId ?? null,
    amount: String(input.amount),
    allocationType: input.allocationType,
    createdBy: actorId,
    allocatedBy: actorId,
  });
  const [allocationHeader] = insertResult2 as unknown as [ResultSetHeader];
  const id = allocationHeader.insertId;
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

type AllocationResult = Awaited<ReturnType<typeof allocatePaymentToInvoice>>;

export async function allocateSupplierPayment(
  db: DrizzleDb,
  input: {
    supplierPaymentId: number;
    supplierId: number;
    invoiceIds?: number[];
    createdBy?: number;
  },
  ctx?: CtxLike
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
  const allocations: Array<
    { invoiceId: number; amount: number } & AllocationResult
  > = [];
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
  db: DrizzleDb,
  input: {
    supplierId: number;
    storeId: number;
    amount: number;
    createdBy: number;
    referenceNo?: string;
  },
  ctx?: CtxLike
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
  db: DrizzleDb,
  input: {
    supplierId: number;
    purchaseInvoiceId?: number;
    storeId: number;
    amount: number;
    createdBy: number;
    reason?: string;
  },
  ctx?: CtxLike
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
  db: DrizzleDb,
  input: {
    supplierId: number;
    purchaseInvoiceId: number;
    purchaseReturnId: number;
    storeId: number;
    amount: number;
    createdBy: number;
  },
  ctx?: CtxLike
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
  db: DrizzleDb,
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
  db: DrizzleDb,
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
        eq(purchaseReturns.status, "committed")
      )
    );
  const nonReturnAllocated = allocations
    .filter(allocation => allocation.allocationType !== "return_credit")
    .reduce((sum: number, allocation) => sum + toMoney(allocation.amount), 0);
  const allocatedReturnCredit = allocations
    .filter(allocation => allocation.allocationType === "return_credit")
    .reduce((sum: number, allocation) => sum + toMoney(allocation.amount), 0);
  const allocated = roundMoney(
    nonReturnAllocated + Math.max(allocatedReturnCredit, toMoney(r?.returned))
  );
  return roundMoney(Math.max(0, toMoney(inv.netAmount) - allocated));
}
