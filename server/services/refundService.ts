import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { paymentRecords, refunds } from "../../drizzle/schema";
import { paymentConnector } from "../connectors";
import { logAudit } from "./audit";
import { appendCommercialEventBestEffort } from "./commercialLifecycle";

export type RefundProviderState = "pending_provider" | "provider_not_configured" | "manual_required" | "succeeded" | "failed";
export type RefundLedgerStatus = "pending" | "success" | "failed" | "cancelled";

const REFUND_CONSUMING_STATUSES: RefundLedgerStatus[] = ["pending", "success"];
const DEFAULT_REFUND_PROVIDER = "razorpay";

async function getPaymentByGatewayOrderId(gatewayOrderId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db.select().from(paymentRecords).where(eq(paymentRecords.gatewayOrderId, gatewayOrderId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment record not found" });
  return row;
}

function normalizeAmountPaise(amountPaise: number) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Refund amount must be a positive paise integer" });
  }
  return amountPaise;
}

export function calculateRefundAvailability(input: {
  paidPaise: number;
  amountPaise?: number;
  existingRefunds: Array<{ amountPaise: number | string | null; status: RefundLedgerStatus | string }>;
}) {
  const paidPaise = Number(input.paidPaise ?? 0);
  const consumedPaise = input.existingRefunds
    .filter((refund) => REFUND_CONSUMING_STATUSES.includes(refund.status as RefundLedgerStatus))
    .reduce((total, refund) => total + Number(refund.amountPaise ?? 0), 0);
  const availablePaise = Math.max(0, paidPaise - consumedPaise);
  if (input.amountPaise !== undefined && normalizeAmountPaise(input.amountPaise) > availablePaise) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Refund exceeds available paid amount" });
  }
  return { availablePaise, paidPaise, alreadyRefundedPaise: consumedPaise };
}

export async function getRefundLedger(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.select().from(refunds).where(eq(refunds.orderId, orderId));
}

export async function getRefundsForPayment(paymentId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.select().from(refunds).where(eq(refunds.paymentId, paymentId));
}

export async function getRefundTotalByPayment(paymentId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db
    .select({ totalPaise: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, paymentId), inArray(refunds.status, REFUND_CONSUMING_STATUSES)));
  return Number(row?.totalPaise ?? 0);
}


async function getSuccessfulRefundTotalByPayment(paymentId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db
    .select({ totalPaise: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)` })
    .from(refunds)
    .where(and(eq(refunds.paymentId, paymentId), eq(refunds.status, "success")));
  return Number(row?.totalPaise ?? 0);
}

export async function assertRefundIdempotent(input: { gatewayOrderId: string; refundId: string; provider?: string; ctx?: any }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const provider = input.provider ?? DEFAULT_REFUND_PROVIDER;
  const [row] = await db
    .select()
    .from(refunds)
    .where(and(eq(refunds.provider, provider), eq(refunds.providerRefundId, input.refundId)))
    .limit(1);
  if (row) {
    await logAudit({ action: "refund.duplicate_detected", entityType: "refund", entityId: row.id, afterJson: { gatewayOrderId: input.gatewayOrderId, refundId: input.refundId, provider } }, input.ctx);
    throw new TRPCError({ code: "CONFLICT", message: "Duplicate refund" });
  }
}

export async function assertProviderRefundIdAvailable(input: { provider: string; providerRefundId: string; refundId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const predicates = [eq(refunds.provider, input.provider), eq(refunds.providerRefundId, input.providerRefundId)];
  if (input.refundId) predicates.push(ne(refunds.id, input.refundId));
  const [existing] = await db.select().from(refunds).where(and(...predicates)).limit(1);
  if (existing) throw new TRPCError({ code: "CONFLICT", message: "Duplicate provider refund" });
}

export async function assertRefundAmountAllowed(input: { gatewayOrderId: string; amountPaise: number }) {
  const payment = await getPaymentByGatewayOrderId(input.gatewayOrderId);
  const existingRefunds = await getRefundsForPayment(payment.id);
  return calculateRefundAvailability({ paidPaise: Number(payment.amount ?? 0), amountPaise: input.amountPaise, existingRefunds });
}

export async function createRefundRecord(input: {
  gatewayOrderId: string;
  amountPaise: number;
  provider?: string;
  providerRefundId?: string | null;
  reason?: string | null;
  creditNoteId?: number | null;
  initiatedBy?: number | null;
  saleId?: number | null;
  status?: RefundLedgerStatus;
  ctx?: any;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const payment = await getPaymentByGatewayOrderId(input.gatewayOrderId);
  const provider = input.provider ?? DEFAULT_REFUND_PROVIDER;
  if (input.providerRefundId) await assertProviderRefundIdAvailable({ provider, providerRefundId: input.providerRefundId });
  const [result] = await db.insert(refunds).values({
    paymentId: payment.id,
    orderId: payment.orderId,
    saleId: input.saleId ?? null,
    provider,
    providerRefundId: input.providerRefundId ?? null,
    amountPaise: normalizeAmountPaise(input.amountPaise),
    status: input.status ?? "pending",
    reason: input.reason ?? null,
    creditNoteId: input.creditNoteId ?? null,
    initiatedBy: input.initiatedBy ?? null,
  });
  return { refundId: (result as { insertId: number }).insertId, payment };
}

export async function initiateRefundRecord(input: {
  gatewayOrderId: string;
  amountPaise: number;
  provider?: string;
  providerRefundId?: string | null;
  reason?: string | null;
  creditNoteId?: number | null;
  initiatedBy?: number | null;
  saleId?: number | null;
  ctx?: any;
}) {
  await assertRefundAmountAllowed({ gatewayOrderId: input.gatewayOrderId, amountPaise: input.amountPaise });
  const created = await createRefundRecord(input);
  await logAudit({ action: "refund.initiated", entityType: "refund", entityId: created.refundId, afterJson: { gatewayOrderId: input.gatewayOrderId, amountPaise: input.amountPaise, provider: input.provider ?? DEFAULT_REFUND_PROVIDER } }, input.ctx);
  await appendCommercialEventBestEffort({
    aggregateType: "refund",
    aggregateId: created.refundId,
    eventType: "refund_initiated",
    actorType: input.ctx?.user ? "staff" : "system",
    actorId: input.ctx?.user?.id ?? input.initiatedBy ?? null,
    orderId: created.payment.orderId,
    paymentId: created.payment.id,
    refundId: created.refundId,
    eventPayload: { gatewayOrderId: input.gatewayOrderId, amountPaise: input.amountPaise, provider: input.provider ?? DEFAULT_REFUND_PROVIDER, providerRefundId: input.providerRefundId ?? null },
    idempotencyKey: input.providerRefundId ? `refund_initiated:${input.providerRefundId}` : `refund:${created.refundId}:initiated`,
    correlationId: input.gatewayOrderId,
  });
  return created;
}

export async function markRefundSuccess(input: { refundId: number; providerRefundId?: string | null; provider?: string; ctx?: any }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const provider = input.provider ?? DEFAULT_REFUND_PROVIDER;
  if (input.providerRefundId) await assertProviderRefundIdAvailable({ provider, providerRefundId: input.providerRefundId, refundId: input.refundId });
  const [refund] = await db.select().from(refunds).where(eq(refunds.id, input.refundId)).limit(1);
  if (!refund) throw new TRPCError({ code: "NOT_FOUND", message: "Refund record not found" });
  await db.update(refunds).set({ status: "success", providerRefundId: input.providerRefundId ?? refund.providerRefundId, failureReason: null }).where(eq(refunds.id, input.refundId));
  const successfulTotal = await getSuccessfulRefundTotalByPayment(refund.paymentId);
  const [payment] = await db.select().from(paymentRecords).where(eq(paymentRecords.id, refund.paymentId)).limit(1);
  const fullyRefunded = payment ? successfulTotal >= Number(payment.amount ?? 0) : false;
  await db.update(paymentRecords).set({ refundId: input.providerRefundId ?? refund.providerRefundId, refundedAt: fullyRefunded ? new Date() : payment?.refundedAt ?? null, status: fullyRefunded ? "refunded" : payment?.status }).where(eq(paymentRecords.id, refund.paymentId));
  await logAudit({ action: "refund.succeeded", entityType: "refund", entityId: input.refundId, afterJson: input }, input.ctx);
  await appendCommercialEventBestEffort({
    aggregateType: "refund",
    aggregateId: input.refundId,
    eventType: "refund_completed",
    actorType: input.ctx?.user ? "staff" : "provider",
    actorId: input.ctx?.user?.id ?? null,
    orderId: refund.orderId ?? payment?.orderId ?? null,
    saleId: refund.saleId ?? null,
    paymentId: refund.paymentId,
    refundId: input.refundId,
    eventPayload: { amountPaise: refund.amountPaise, providerRefundId: input.providerRefundId ?? refund.providerRefundId ?? null, fullyRefunded },
    idempotencyKey: input.providerRefundId ? `refund_completed:${input.providerRefundId}` : `refund:${input.refundId}:completed`,
    correlationId: payment?.gatewayOrderId ?? null,
  });

  // --- Accounting reversal: post a balanced refund journal batch exactly-once ---
  try {
    const dbCheck = await getDb();
    if (dbCheck) {
      const { accountingJournalBatches } = await import("../../drizzle/schema");
      const { postBalancedJournalBatch, createRefundJournalBatch } = await import("./accountingLedger");
      // Check for an existing posted batch for this refund (idempotency guard)
      const [existingBatch] = await dbCheck.select().from(accountingJournalBatches).where(and(eq(accountingJournalBatches.sourceType, "refund"), eq(accountingJournalBatches.sourceRef, String(refund.id)), eq(accountingJournalBatches.status, "posted"))).limit(1);
      if (!existingBatch) {
        const batchInput = createRefundJournalBatch({ refundId: refund.id, storeId: null, amount: Number(refund.amountPaise ?? 0) / 100, gstAmount: 0, postedBy: input.ctx?.user?.id ?? null });
        await postBalancedJournalBatch(dbCheck, batchInput);
        await logAudit({ action: "refund.journal_posted", entityType: "refund", entityId: input.refundId, afterJson: { refundId: input.refundId, journalForRefundId: refund.id } }, input.ctx);
      }
    }
  } catch (err: any) {
    // Do not revert refund success on journal failures; surface audit and continue.
    await logAudit({ action: "refund.journal_failed", entityType: "refund", entityId: input.refundId, afterJson: { error: err?.message ?? String(err) } }, input.ctx);
  }
}

export async function markRefundFailedRecord(input: { refundId: number; reason: string; providerRefundId?: string | null; provider?: string; ctx?: any }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const provider = input.provider ?? DEFAULT_REFUND_PROVIDER;
  if (input.providerRefundId) await assertProviderRefundIdAvailable({ provider, providerRefundId: input.providerRefundId, refundId: input.refundId });
  await db.update(refunds).set({ status: "failed", failureReason: input.reason, providerRefundId: input.providerRefundId ?? null }).where(eq(refunds.id, input.refundId));
  await logAudit({ action: "refund.failed", entityType: "refund", entityId: input.refundId, afterJson: input }, input.ctx);
  return { ok: true, providerState: "manual_required" as RefundProviderState };
}

export async function initiateRefund(input: { gatewayOrderId: string; refundId?: string; amountPaise: number; reason?: string; creditNoteId?: number; ctx?: any }) {
  if (input.refundId) await assertRefundIdempotent({ gatewayOrderId: input.gatewayOrderId, refundId: input.refundId, ctx: input.ctx });
  const created = await initiateRefundRecord({
    gatewayOrderId: input.gatewayOrderId,
    amountPaise: input.amountPaise,
    providerRefundId: input.refundId ?? null,
    reason: input.reason ?? null,
    creditNoteId: input.creditNoteId ?? null,
    initiatedBy: input.ctx?.user?.id ?? null,
    ctx: input.ctx,
  });
  const providerConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  if (!providerConfigured) {
    await logAudit({ action: "refund.provider_pending", entityType: "refund", entityId: created.refundId, afterJson: { gatewayOrderId: input.gatewayOrderId, providerState: "provider_not_configured" } }, input.ctx);
    return { ok: true, refundId: created.refundId, status: "pending" as const, amountPaise: input.amountPaise, providerRefundId: input.refundId ?? null, providerState: "provider_not_configured" as RefundProviderState };
  }

  const gatewayPaymentId = created.payment.gatewayPaymentId;
  if (!gatewayPaymentId) {
    await markRefundFailedRecord({ refundId: created.refundId, reason: "Payment gateway payment id missing", ctx: input.ctx });
    return { ok: false, refundId: created.refundId, status: "failed" as const, amountPaise: input.amountPaise, providerRefundId: input.refundId ?? null, providerState: "manual_required" as RefundProviderState };
  }

  try {
    const providerRefund = await paymentConnector.refund({ gatewayPaymentId, amount: input.amountPaise, reason: input.reason });
    const providerStatus = providerRefund.status?.toLowerCase();
    if (["processed", "succeeded", "success"].includes(providerStatus)) {
      await markRefundSuccess({ refundId: created.refundId, providerRefundId: providerRefund.refundId, ctx: input.ctx });
      return { ok: true, refundId: created.refundId, status: "success" as const, amountPaise: input.amountPaise, providerRefundId: providerRefund.refundId, providerState: "succeeded" as RefundProviderState };
    }
    await logAudit({ action: "refund.provider_pending", entityType: "refund", entityId: created.refundId, afterJson: { gatewayOrderId: input.gatewayOrderId, providerState: "pending_provider", providerStatus } }, input.ctx);
    return { ok: true, refundId: created.refundId, status: "pending" as const, amountPaise: input.amountPaise, providerRefundId: providerRefund.refundId, providerState: "pending_provider" as RefundProviderState };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Refund provider call failed";
    await markRefundFailedRecord({ refundId: created.refundId, reason, ctx: input.ctx });
    return { ok: false, refundId: created.refundId, status: "failed" as const, amountPaise: input.amountPaise, providerRefundId: input.refundId ?? null, providerState: "failed" as RefundProviderState, failureReason: reason };
  }
}

export async function recordRefund(input: { gatewayOrderId: string; refundId: string; providerState: RefundProviderState }) {
  const status: RefundLedgerStatus = input.providerState === "failed" || input.providerState === "manual_required" ? "failed" : input.providerState === "succeeded" ? "success" : "pending";
  const payment = await getPaymentByGatewayOrderId(input.gatewayOrderId);
  const amountPaise = Math.max(1, Number(payment.amount ?? 0));
  return createRefundRecord({ gatewayOrderId: input.gatewayOrderId, providerRefundId: input.refundId, amountPaise, status });
}

export async function markRefundSucceeded(input: { gatewayOrderId: string; refundId: string; ctx?: any }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const provider = DEFAULT_REFUND_PROVIDER;
  const [refund] = await db.select().from(refunds).where(and(eq(refunds.provider, provider), eq(refunds.providerRefundId, input.refundId))).limit(1);
  const refundRecord = refund ?? (await createRefundRecord({ gatewayOrderId: input.gatewayOrderId, providerRefundId: input.refundId, amountPaise: (await getPaymentByGatewayOrderId(input.gatewayOrderId)).amount, status: "pending" })).refundId;
  await markRefundSuccess({ refundId: typeof refundRecord === "number" ? refundRecord : refundRecord.id, providerRefundId: input.refundId, ctx: input.ctx });
}

export async function markRefundFailed(input: { gatewayOrderId: string; reason: string; refundId?: string; ctx?: any }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  let refundRecordId: number | null = null;
  if (input.refundId) {
    const [existing] = await db.select().from(refunds).where(and(eq(refunds.provider, DEFAULT_REFUND_PROVIDER), eq(refunds.providerRefundId, input.refundId))).limit(1);
    refundRecordId = existing?.id ?? null;
  }
  if (!refundRecordId) {
    const payment = await getPaymentByGatewayOrderId(input.gatewayOrderId);
    const created = await createRefundRecord({ gatewayOrderId: input.gatewayOrderId, amountPaise: Math.max(1, Number(payment.amount ?? 0)), providerRefundId: input.refundId ?? null, status: "pending" });
    refundRecordId = created.refundId;
  }
  return markRefundFailedRecord({ refundId: refundRecordId, reason: input.reason, ctx: input.ctx });
}

export async function verifyRefundStatus(input: { gatewayOrderId: string }) {
  const payment = await getPaymentByGatewayOrderId(input.gatewayOrderId);
  const ledger = await getRefundsForPayment(payment.id);
  const refundTotalPaise = await getRefundTotalByPayment(payment.id);
  return {
    paymentStatus: payment.status,
    paymentId: payment.id,
    refundTotalPaise,
    refunds: ledger.map((refund) => ({
      refundId: refund.id,
      status: refund.status,
      amountPaise: refund.amountPaise,
      providerRefundId: refund.providerRefundId,
      failureReason: refund.failureReason,
    })),
  };
}
