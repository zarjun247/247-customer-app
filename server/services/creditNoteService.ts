import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "../db";
import { creditNotes, orders, saleReturns, sales } from "../../drizzle/schema";
import type { Sale, SaleReturn } from "../../drizzle/schema";
import type { Order } from "../../drizzle/schema";
import type { MySqlDatabase } from "drizzle-orm/mysql-core";
import type {
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
} from "drizzle-orm/mysql2";
type DrizzleDb = MySqlDatabase<
  MySql2QueryResultHKT,
  MySql2PreparedQueryHKT,
  Record<string, unknown>
>;
import { appendCommercialEventBestEffort } from "./commercialLifecycle";

export type CreditNoteStatus = "draft" | "issued" | "cancelled" | "failed";
export type CreditNoteLineSplit = {
  saleLineId?: string | null;
  productId?: string | null;
  taxableAmountPaise: number;
  gstAmountPaise: number;
  grossAmountPaise: number;
  gstRate?: number | null;
};

export type CreditNoteDraftInput = {
  creditNoteNo?: string;
  originalInvoiceNo?: string;
  saleId?: string | null;
  orderId?: number | null;
  saleReturnId?: string | null;
  refundId?: string | null;
  storeId?: string | null;
  customerId?: string | null;
  amountPaise: number;
  taxableAmountPaise: number;
  gstAmountPaise: number;
  reason: string;
  issuedBy?: string | null;
  lineSplits?: CreditNoteLineSplit[] | null;
};

export type CreditNoteInvoiceTruth = {
  sale?: Sale | null;
  order?: Order | null;
  saleReturn?: SaleReturn | null;
};

const paise = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const nowMs = () => Date.now();

export function buildDraftCreditNoteNumber(
  storeId: string | number | null | undefined,
  at = nowMs()
) {
  return `CN-DRAFT-${storeId ?? "UNKNOWN"}-${at}-${randomUUID().slice(0, 8)}`;
}

export function assertCreditNoteSplitPreserved(input: {
  amountPaise: number;
  taxableAmountPaise: number;
  gstAmountPaise: number;
  lineSplits?: CreditNoteLineSplit[] | null;
}) {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Credit note amount must be positive paise",
    });
  }
  if (
    !Number.isInteger(input.taxableAmountPaise) ||
    input.taxableAmountPaise < 0
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Credit note taxable amount must be non-negative paise",
    });
  }
  if (!Number.isInteger(input.gstAmountPaise) || input.gstAmountPaise < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Credit note GST amount must be non-negative paise",
    });
  }
  if (input.taxableAmountPaise + input.gstAmountPaise !== input.amountPaise) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Credit note taxable plus GST must equal gross amount",
    });
  }
  const splitGross = (input.lineSplits ?? []).reduce(
    (sum, line) => sum + line.grossAmountPaise,
    0
  );
  if ((input.lineSplits?.length ?? 0) > 0 && splitGross !== input.amountPaise) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Credit note line split must reconcile to gross amount",
    });
  }
}

export function assertCreditNoteAmountAllowed(input: {
  invoiceAmountPaise: number;
  requestedAmountPaise: number;
  existingIssuedCreditNotePaise?: number;
}) {
  const invoiceAmountPaise = Math.max(0, Math.trunc(input.invoiceAmountPaise));
  const existingIssuedCreditNotePaise = Math.max(
    0,
    Math.trunc(input.existingIssuedCreditNotePaise ?? 0)
  );
  const refundablePaise = Math.max(
    0,
    invoiceAmountPaise - existingIssuedCreditNotePaise
  );
  if (input.requestedAmountPaise > refundablePaise) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Credit note exceeds refundable invoice amount",
    });
  }
  return { invoiceAmountPaise, existingIssuedCreditNotePaise, refundablePaise };
}

export function deriveCreditNoteSummaryFromReturn(
  ret: SaleReturn | null | undefined,
  lines: {
    saleLineId?: string | number | null;
    productId?: string | number | null;
    gstReversal?: string | number | null;
    refundAmount?: string | number | null;
  }[] = []
) {
  const gstAmountPaise = paise(ret?.gstReversal);
  const amountPaise = paise(ret?.totalRefund);
  const taxableAmountPaise = Math.max(0, amountPaise - gstAmountPaise);
  const lineSplits: CreditNoteLineSplit[] = lines.map(line => {
    const lineGst = paise(line.gstReversal);
    const lineGross = paise(line.refundAmount);
    return {
      saleLineId: line.saleLineId != null ? String(line.saleLineId) : null,
      productId: line.productId != null ? String(line.productId) : null,
      taxableAmountPaise: Math.max(0, lineGross - lineGst),
      gstAmountPaise: lineGst,
      grossAmountPaise: lineGross,
      gstRate: null,
    };
  });
  return { amountPaise, taxableAmountPaise, gstAmountPaise, lineSplits };
}

export function assertNoFakeRefundLedgerLink(refundId?: string | null) {
  if (refundId && refundId.startsWith("refund-ledger-pending")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Do not fake refund ledger linkage",
    });
  }
}

async function getDbOrThrow(dbOverride?: DrizzleDb) {
  if (dbOverride) return dbOverride;
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

async function loadInvoiceTruth(
  db: DrizzleDb,
  input: Pick<CreditNoteDraftInput, "saleId" | "orderId" | "saleReturnId">
): Promise<CreditNoteInvoiceTruth> {
  const truth: CreditNoteInvoiceTruth = {};
  if (input.saleId) {
    const [sale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, input.saleId))
      .limit(1);
    truth.sale = sale ?? null;
  }
  if (input.orderId) {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    truth.order = order ?? null;
  }
  if (input.saleReturnId) {
    const [saleReturn] = await db
      .select()
      .from(saleReturns)
      .where(eq(saleReturns.id, input.saleReturnId))
      .limit(1);
    truth.saleReturn = saleReturn ?? null;
  }
  return truth;
}

export function assertValidOriginalInvoice(
  input: CreditNoteDraftInput,
  truth: CreditNoteInvoiceTruth
) {
  if (!input.saleId && !input.orderId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Credit note requires a sale or order invoice source",
    });
  }
  if (input.saleId && !truth.sale)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Original sale invoice not found",
    });
  if (input.orderId && !truth.order)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Original order invoice not found",
    });
  if (
    truth.sale &&
    !["confirmed", "returned"].includes(String(truth.sale.status))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Credit note can only be issued against confirmed or returned sales",
    });
  }
  if (
    truth.order &&
    !["delivered", "returned", "closed"].includes(String(truth.order.status))
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Credit note can only be issued against delivered, returned, or closed orders",
    });
  }
  if (input.saleReturnId && !truth.saleReturn)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Sale return not found",
    });
  if (
    truth.saleReturn &&
    input.saleId &&
    truth.saleReturn.saleId !== input.saleId
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Sale return does not belong to original sale",
    });
  }
}

async function sumIssuedCreditNotes(
  db: DrizzleDb,
  input: Pick<CreditNoteDraftInput, "saleId" | "orderId" | "originalInvoiceNo">
) {
  const filters: SQL<unknown>[] = [eq(creditNotes.status, "issued")];
  if (input.saleId) filters.push(eq(creditNotes.saleId, input.saleId));
  else if (input.orderId) filters.push(eq(creditNotes.orderId, input.orderId));
  else if (input.originalInvoiceNo)
    filters.push(eq(creditNotes.originalInvoiceNo, input.originalInvoiceNo));
  else return 0;
  const rows = await db
    .select()
    .from(creditNotes)
    .where(and(...filters));
  return rows
    .filter(row => row.status === "issued")
    .filter(row => !input.saleId || row.saleId === input.saleId)
    .filter(row => !input.orderId || row.orderId === input.orderId)
    .filter(
      row =>
        !input.originalInvoiceNo ||
        row.originalInvoiceNo === input.originalInvoiceNo
    )
    .reduce((sum: number, row) => sum + Number(row.amountPaise ?? 0), 0);
}

async function assertUniqueCreditNoteNo(
  db: DrizzleDb,
  creditNoteNo: string,
  exceptId?: string
) {
  const rows = await db
    .select()
    .from(creditNotes)
    .where(eq(creditNotes.creditNoteNo, creditNoteNo))
    .limit(2);
  const duplicate = rows.find(row => row.id !== exceptId);
  if (duplicate)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Duplicate credit note number",
    });
}

function invoiceAmountFromTruth(truth: CreditNoteInvoiceTruth) {
  if (truth.sale) return paise(truth.sale.total);
  if (truth.order) return paise(truth.order.total);
  return 0;
}

function resolveStoreId(
  input: CreditNoteDraftInput,
  truth: CreditNoteInvoiceTruth
) {
  return (
    input.storeId ??
    truth.sale?.storeId ??
    (truth.order?.storeId != null ? String(truth.order.storeId) : null)
  );
}

function resolveCustomerId(
  input: CreditNoteDraftInput,
  truth: CreditNoteInvoiceTruth
) {
  return (
    input.customerId ??
    truth.sale?.customerId ??
    (truth.order?.userId != null ? String(truth.order.userId) : null) ??
    null
  );
}

function resolveOriginalInvoiceNo(
  input: CreditNoteDraftInput,
  truth: CreditNoteInvoiceTruth
) {
  return (
    input.originalInvoiceNo ??
    truth.sale?.billNo ??
    (truth.order?.id != null ? `ORDER-${truth.order.id}` : null)
  );
}

export async function createCreditNoteDraft(
  input: CreditNoteDraftInput,
  dbOverride?: DrizzleDb
) {
  assertNoFakeRefundLedgerLink(input.refundId);
  assertCreditNoteSplitPreserved(input);
  const db = await getDbOrThrow(dbOverride);
  const truth = await loadInvoiceTruth(db, input);
  assertValidOriginalInvoice(input, truth);
  const originalInvoiceNo = resolveOriginalInvoiceNo(input, truth);
  const storeId = resolveStoreId(input, truth);
  if (!originalInvoiceNo || !storeId)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Credit note requires invoice and store identity",
    });
  const existingIssuedCreditNotePaise = await sumIssuedCreditNotes(db, {
    ...input,
    originalInvoiceNo,
  });
  assertCreditNoteAmountAllowed({
    invoiceAmountPaise: invoiceAmountFromTruth(truth),
    requestedAmountPaise: input.amountPaise,
    existingIssuedCreditNotePaise,
  });
  const creditNoteNo =
    input.creditNoteNo ?? buildDraftCreditNoteNumber(storeId);
  await assertUniqueCreditNoteNo(db, creditNoteNo);
  const at = nowMs();
  const id = randomUUID();
  const row = {
    id,
    creditNoteNo,
    originalInvoiceNo,
    billNo: truth.sale?.billNo ?? null,
    saleId: input.saleId ?? null,
    orderId: input.orderId ?? null,
    saleReturnId: input.saleReturnId ?? null,
    refundId: input.refundId ?? null,
    storeId: String(storeId),
    customerId: resolveCustomerId(input, truth),
    amountPaise: input.amountPaise,
    taxableAmountPaise: input.taxableAmountPaise,
    gstAmountPaise: input.gstAmountPaise,
    reason: input.reason,
    status: "draft" as CreditNoteStatus,
    issuedBy: null,
    issuedAt: null,
    lineSplitsJson: input.lineSplits ? JSON.stringify(input.lineSplits) : null,
    createdAt: at,
    updatedAt: at,
  };
  await db.insert(creditNotes).values(row);
  return row;
}

export async function issueCreditNote(
  input: { creditNoteId: string; creditNoteNo?: string; issuedBy: string },
  dbOverride?: DrizzleDb
) {
  const db = await getDbOrThrow(dbOverride);
  const [draft] = await db
    .select()
    .from(creditNotes)
    .where(eq(creditNotes.id, input.creditNoteId))
    .limit(1);
  if (!draft)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Credit note not found",
    });
  if (draft.status !== "draft")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only draft credit notes can be issued",
    });
  const finalNo = input.creditNoteNo ?? draft.creditNoteNo;
  await assertUniqueCreditNoteNo(db, finalNo, draft.id);
  const truth = await loadInvoiceTruth(db, {
    saleId: draft.saleId,
    orderId: draft.orderId,
    saleReturnId: draft.saleReturnId,
  });
  assertValidOriginalInvoice(
    { ...draft, creditNoteNo: finalNo, reason: draft.reason },
    truth
  );
  const existingIssuedCreditNotePaise = await sumIssuedCreditNotes(db, {
    saleId: draft.saleId,
    orderId: draft.orderId,
    originalInvoiceNo: draft.originalInvoiceNo,
  });
  assertCreditNoteAmountAllowed({
    invoiceAmountPaise: invoiceAmountFromTruth(truth),
    requestedAmountPaise: Number(draft.amountPaise),
    existingIssuedCreditNotePaise,
  });
  const at = nowMs();
  await db
    .update(creditNotes)
    .set({
      creditNoteNo: finalNo,
      status: "issued",
      issuedBy: input.issuedBy,
      issuedAt: at,
      updatedAt: at,
    })
    .where(eq(creditNotes.id, input.creditNoteId));
  await appendCommercialEventBestEffort({
    aggregateType: "credit_note",
    aggregateId: input.creditNoteId,
    eventType: "credit_note_generated",
    actorType: "staff",
    actorId: input.issuedBy,
    storeId: draft.storeId,
    orderId: draft.orderId ?? null,
    saleId: draft.saleId ?? null,
    invoiceId: draft.originalInvoiceNo,
    refundId: draft.refundId ?? null,
    eventPayload: {
      creditNoteNo: finalNo,
      originalInvoiceNo: draft.originalInvoiceNo,
      amountPaise: draft.amountPaise,
      taxableAmountPaise: draft.taxableAmountPaise,
      gstAmountPaise: draft.gstAmountPaise,
    },
    idempotencyKey: `credit_note:${finalNo}:generated`,
    correlationId:
      draft.saleId ?? (draft.orderId != null ? String(draft.orderId) : null),
  });
  return {
    ...draft,
    creditNoteNo: finalNo,
    status: "issued" as CreditNoteStatus,
    issuedBy: input.issuedBy,
    issuedAt: at,
    updatedAt: at,
  };
}

export async function cancelCreditNote(
  input: { creditNoteId: string; reason: string; actorId: string },
  dbOverride?: DrizzleDb
) {
  const db = await getDbOrThrow(dbOverride);
  const [note] = await db
    .select()
    .from(creditNotes)
    .where(eq(creditNotes.id, input.creditNoteId))
    .limit(1);
  if (!note)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Credit note not found",
    });
  if (!["draft", "issued"].includes(String(note.status))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Credit note cannot be cancelled from current status",
    });
  }
  const at = nowMs();
  await db
    .update(creditNotes)
    .set({ status: "cancelled", updatedAt: at })
    .where(eq(creditNotes.id, input.creditNoteId));
  await appendCommercialEventBestEffort({
    aggregateType: "cancellation",
    aggregateId: input.creditNoteId,
    eventType: "cancellation_completed",
    actorType: "staff",
    actorId: input.actorId,
    storeId: note.storeId,
    orderId: note.orderId ?? null,
    saleId: note.saleId ?? null,
    invoiceId: note.originalInvoiceNo,
    refundId: note.refundId ?? null,
    eventPayload: {
      entityType: "credit_note",
      creditNoteNo: note.creditNoteNo,
      reason: input.reason,
    },
    idempotencyKey: `credit_note:${input.creditNoteId}:cancelled`,
    correlationId:
      note.saleId ?? (note.orderId != null ? String(note.orderId) : null),
  });
  return {
    ...note,
    status: "cancelled" as CreditNoteStatus,
    cancellationReason: input.reason,
    cancelledBy: input.actorId,
    updatedAt: at,
  };
}

export async function getCreditNotesForSale(
  saleId: string,
  dbOverride?: DrizzleDb
) {
  const db = await getDbOrThrow(dbOverride);
  return db.select().from(creditNotes).where(eq(creditNotes.saleId, saleId));
}

export async function getCreditNotesForOrder(
  orderId: number,
  dbOverride?: DrizzleDb
) {
  const db = await getDbOrThrow(dbOverride);
  return db.select().from(creditNotes).where(eq(creditNotes.orderId, orderId));
}
