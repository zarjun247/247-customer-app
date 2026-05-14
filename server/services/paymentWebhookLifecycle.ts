import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "../db";
import { getOrderById, getOrderItems, updateOrderStatus } from "../db";
import { createSlaEvent, getPaymentByGatewayOrderId } from "../payment";
import {
  paymentRecords,
  providerWebhookEvents,
  refunds,
} from "../../drizzle/schema";
import {
  verifyGatewayWebhookSignature,
  markPaymentCaptured,
  markPaymentFailed,
  type PaymentVerificationStatus,
} from "./paymentGateway";
import { releaseReservationOnPaymentFailure } from "./reservationService";
import {
  markRefundFailedRecord,
  markRefundSuccess as _markRefundSuccess,
} from "./refundService";
import { settleProviderRefundExactlyOnce } from "./commercialTruthSeams";
import { scheduleProviderEventRetry } from "./providerEventsService";
import { logAudit } from "./audit";
import { redactObject } from "../_core/redact";
export type {
  ProviderWebhookProcessingStatus,
  PaymentLifecycleTransition,
  ProviderWebhookResult,
} from "./paymentWebhookHelpers";
export {
  hashRawPayload,
  sanitizeProviderWebhookPayload,
  extractProviderWebhookRefs,
} from "./paymentWebhookHelpers";
import {
  extractProviderWebhookRefs,
  hashRawPayload,
  sanitizeProviderWebhookPayload,
} from "./paymentWebhookHelpers";
import type {
  ProviderWebhookProcessingStatus,
  PaymentLifecycleTransition,
  ProviderWebhookResult,
} from "./paymentWebhookHelpers";

const PROVIDER = "razorpay";
const PAYMENT_CAPTURED_EVENTS = new Set(["payment.captured", "order.paid"]);
const PAYMENT_FAILED_EVENTS = new Set(["payment.failed"]);
const PAYMENT_CANCELLED_EVENTS = new Set([
  "payment.cancelled",
  "order.cancelled",
]);
const PAYMENT_EXPIRED_EVENTS = new Set(["payment.expired", "order.expired"]);
const REFUND_SUCCESS_EVENTS = new Set([
  "refund.processed",
  "refund.succeeded",
  "refund.success",
]);
const REFUND_FAILED_EVENTS = new Set(["refund.failed"]);
const PAYMENT_RELEASE_REASON_BY_LIFECYCLE: Record<
  "failed" | "cancelled" | "expired",
  string
> = {
  failed: "payment_failed",
  cancelled: "payment_cancelled",
  expired: "payment_expired",
};

function runtimeIsProduction() {
  return process.env.NODE_ENV === "production";
}

function parseRawWebhookBody(
  rawBody: string | Buffer
): Record<string, unknown> {
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Webhook payload must be a JSON object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Malformed webhook payload",
    });
  }
}

function idempotencyKeyFor(
  providerEventId: string | null,
  rawPayloadHash: string
) {
  return providerEventId
    ? `event:${providerEventId}`
    : `payload:${rawPayloadHash}`;
}

async function appendLifecycleAudit(
  action: string,
  input: Record<string, unknown>
) {
  await logAudit(
    {
      action,
      entityType: "payment_webhook",
      entityId: null,
      source: "webhook",
      afterJson: redactObject(input),
    },
    undefined
  ).catch(() => undefined);
}

async function findExistingEvent(
  provider: string,
  providerEventId: string | null,
  rawPayloadHash: string
) {
  const db = await getDb();
  if (!db) return null;
  const predicates = providerEventId
    ? or(
        eq(providerWebhookEvents.providerEventId, providerEventId),
        eq(providerWebhookEvents.rawPayloadHash, rawPayloadHash)
      )
    : eq(providerWebhookEvents.rawPayloadHash, rawPayloadHash);
  const rows = await db
    .select()
    .from(providerWebhookEvents)
    .where(and(eq(providerWebhookEvents.provider, provider), predicates))
    .limit(1);
  return rows[0] ?? null;
}

async function recordWebhookEvent(input: {
  provider: string;
  providerEventId: string | null;
  eventType: string;
  paymentId?: number | null;
  orderId?: number | null;
  refundId?: string | null;
  rawPayloadHash: string;
  payloadJson: unknown;
  signatureVerified: boolean;
  processingStatus: ProviderWebhookProcessingStatus;
  failureReason?: string | null;
}) {
  const db = await getDb();
  if (!db) return null;
  try {
    const [row] = await db.insert(providerWebhookEvents).values({
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      paymentId: input.paymentId ?? null,
      orderId: input.orderId ?? null,
      refundId: input.refundId ?? null,
      rawPayloadHash: input.rawPayloadHash,
      payloadJson: input.payloadJson,
      signatureVerified: input.signatureVerified,
      processingStatus: input.processingStatus,
      failureReason: input.failureReason ?? null,
      idempotencyKey: idempotencyKeyFor(
        input.providerEventId,
        input.rawPayloadHash
      ),
    });
    return {
      id: (row as { insertId?: number }).insertId ?? null,
      duplicate: false,
    };
  } catch (error) {
    const e = error as {
      code?: string;
      errno?: number;
      message?: string;
      cause?: { code?: string; errno?: number; message?: string };
    };
    if (
      e?.code === "ER_DUP_ENTRY" ||
      e?.errno === 1062 ||
      e?.cause?.code === "ER_DUP_ENTRY" ||
      e?.cause?.errno === 1062 ||
      /duplicate/i.test(String(e?.message ?? e?.cause?.message ?? ""))
    ) {
      const existing = await findExistingEvent(
        input.provider,
        input.providerEventId,
        input.rawPayloadHash
      );
      return { id: existing?.id ?? null, duplicate: true };
    }
    throw error;
  }
}

async function updateWebhookEventStatus(
  id: number | null,
  status: ProviderWebhookProcessingStatus,
  failureReason?: string | null
) {
  if (!id) return;
  const db = await getDb();
  if (!db) return;
  await db
    .update(providerWebhookEvents)
    .set({
      processingStatus: status,
      failureReason: failureReason ?? null,
      processedAt: new Date(),
    })
    .where(eq(providerWebhookEvents.id, id));
}

export async function advanceOrderAfterPaymentCaptured(input: {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
  method?: string;
}) {
  const payment = await getPaymentByGatewayOrderId(input.gatewayOrderId);
  if (!payment)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Payment record not found",
    });
  if (payment.status === "paid")
    return { ok: true, orderId: payment.orderId, idempotent: true };

  await markPaymentCaptured(input);
  const order = await getOrderById(payment.orderId);
  if (order) {
    const items = await getOrderItems(payment.orderId);
    const needsRx = items.some(
      i => (i as { requiresPrescription?: boolean }).requiresPrescription
    );
    const nextStatus = needsRx ? "pharmacist_reviewing" : "picking";
    await updateOrderStatus(payment.orderId, nextStatus);
    await createSlaEvent({
      orderId: payment.orderId,
      storeId: order.storeId,
      promisedSlaMins: order.promisedSlaMins,
    });
  }
  await appendLifecycleAudit("payment_captured", {
    gatewayOrderId: input.gatewayOrderId,
    gatewayPaymentId: input.gatewayPaymentId,
    orderId: payment.orderId,
  });
  return { ok: true, orderId: payment.orderId, idempotent: false };
}

async function releaseReservationForFailedPayment(
  orderId: number,
  reason: "failed" | "cancelled" | "expired"
) {
  await releaseReservationOnPaymentFailure({
    orderId,
    releaseReason: PAYMENT_RELEASE_REASON_BY_LIFECYCLE[reason],
  });
}

export async function handleRazorpayWebhook(input: {
  rawBody?: string | Buffer | null;
  signature?: string | null;
}): Promise<ProviderWebhookResult> {
  if (!input.rawBody) {
    if (runtimeIsProduction())
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Raw webhook body is required for signature verification",
      });
    return {
      ok: false,
      status: "rejected_signature",
      eventType: "unknown",
      providerEventId: null,
      message: "Raw webhook body unavailable",
    };
  }

  const rawPayloadHash = hashRawPayload(input.rawBody);
  const payload = parseRawWebhookBody(input.rawBody);
  const refs = extractProviderWebhookRefs(payload);
  const sanitized = sanitizeProviderWebhookPayload(payload);
  await appendLifecycleAudit(
    refs.eventType.startsWith("refund.")
      ? "refund_webhook_received"
      : "payment_webhook_received",
    {
      eventType: refs.eventType,
      providerEventId: refs.providerEventId,
      rawPayloadHash,
    }
  );

  const verified = verifyGatewayWebhookSignature(
    Buffer.isBuffer(input.rawBody)
      ? input.rawBody.toString("utf8")
      : input.rawBody,
    input.signature
  );
  if (!verified) {
    await recordWebhookEvent({
      provider: PROVIDER,
      providerEventId: refs.providerEventId,
      eventType: refs.eventType,
      orderId: refs.orderId,
      refundId: refs.providerRefundId,
      rawPayloadHash,
      payloadJson: sanitized,
      signatureVerified: false,
      processingStatus: "rejected_signature",
      failureReason: "signature verification failed",
    });
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Webhook signature verification failed",
    });
  }

  await appendLifecycleAudit("payment_signature_verified", {
    eventType: refs.eventType,
    providerEventId: refs.providerEventId,
    rawPayloadHash,
  });
  const payment = refs.gatewayOrderId
    ? await getPaymentByGatewayOrderId(refs.gatewayOrderId)
    : null;
  const existing = await findExistingEvent(
    PROVIDER,
    refs.providerEventId,
    rawPayloadHash
  );
  if (
    existing &&
    ["processed", "ignored_duplicate", "unsupported_event"].includes(
      existing.processingStatus
    )
  ) {
    await appendLifecycleAudit("payment_duplicate_event_ignored", {
      eventType: refs.eventType,
      providerEventId: refs.providerEventId,
      rawPayloadHash,
    });
    return {
      ok: true,
      status: "ignored_duplicate",
      eventType: refs.eventType,
      providerEventId: refs.providerEventId,
      idempotent: true,
    };
  }

  const eventRecord = await recordWebhookEvent({
    provider: PROVIDER,
    providerEventId: refs.providerEventId,
    eventType: refs.eventType,
    paymentId: payment?.id ?? null,
    orderId: payment?.orderId ?? refs.orderId,
    refundId: refs.providerRefundId,
    rawPayloadHash,
    payloadJson: sanitized,
    signatureVerified: true,
    processingStatus: "verified",
  });
  const eventRowId = eventRecord?.id ?? null;
  if (eventRecord?.duplicate) {
    await appendLifecycleAudit("payment_duplicate_event_ignored", {
      eventType: refs.eventType,
      providerEventId: refs.providerEventId,
      rawPayloadHash,
    });
    return {
      ok: true,
      status: "ignored_duplicate",
      eventType: refs.eventType,
      providerEventId: refs.providerEventId,
      idempotent: true,
    };
  }

  try {
    if (PAYMENT_CAPTURED_EVENTS.has(refs.eventType)) {
      if (!refs.gatewayOrderId || !refs.gatewayPaymentId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Captured webhook missing payment references",
        });
      const result = await advanceOrderAfterPaymentCaptured({
        gatewayOrderId: refs.gatewayOrderId,
        gatewayPaymentId: refs.gatewayPaymentId,
        signature: "webhook_verified",
        method: "webhook",
      });
      await updateWebhookEventStatus(eventRowId, "processed");
      return {
        ok: true,
        status: "processed",
        eventType: refs.eventType,
        providerEventId: refs.providerEventId,
        idempotent: result.idempotent,
        paymentLifecycle: "captured",
      };
    }

    if (
      PAYMENT_FAILED_EVENTS.has(refs.eventType) ||
      PAYMENT_CANCELLED_EVENTS.has(refs.eventType) ||
      PAYMENT_EXPIRED_EVENTS.has(refs.eventType)
    ) {
      const lifecycle: PaymentLifecycleTransition = PAYMENT_FAILED_EVENTS.has(
        refs.eventType
      )
        ? "failed"
        : PAYMENT_CANCELLED_EVENTS.has(refs.eventType)
          ? "cancelled"
          : "expired";
      if (refs.gatewayOrderId)
        await markPaymentFailed({
          gatewayOrderId: refs.gatewayOrderId,
          reason: `webhook_${lifecycle}`,
        });
      const orderId = payment?.orderId ?? refs.orderId;
      if (orderId) await releaseReservationForFailedPayment(orderId, lifecycle);
      await appendLifecycleAudit("payment_failed", {
        eventType: refs.eventType,
        gatewayOrderId: refs.gatewayOrderId,
        orderId,
        lifecycle,
      });
      await updateWebhookEventStatus(eventRowId, "processed");
      return {
        ok: true,
        status: "processed",
        eventType: refs.eventType,
        providerEventId: refs.providerEventId,
        paymentLifecycle: lifecycle,
      };
    }

    if (
      REFUND_SUCCESS_EVENTS.has(refs.eventType) ||
      REFUND_FAILED_EVENTS.has(refs.eventType)
    ) {
      const db = await getDb();
      if (!db || !refs.providerRefundId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Refund webhook missing refund reference",
        });
      const [refund] = await db
        .select()
        .from(refunds)
        .where(eq(refunds.providerRefundId, refs.providerRefundId))
        .limit(1);
      if (!refund)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Refund ledger record not found",
        });
      if (refund.status === "success" || refund.status === "failed") {
        await updateWebhookEventStatus(eventRowId, "processed");
        return {
          ok: true,
          status: "processed",
          eventType: refs.eventType,
          providerEventId: refs.providerEventId,
          idempotent: true,
          paymentLifecycle:
            refund.status === "success" ? "refunded" : undefined,
        };
      }
      if (REFUND_SUCCESS_EVENTS.has(refs.eventType)) {
        const [refundPayment] = await db
          .select()
          .from(paymentRecords)
          .where(eq(paymentRecords.id, refund.paymentId))
          .limit(1);
        const gatewayOrderId =
          refs.gatewayOrderId ?? refundPayment?.gatewayOrderId;
        if (!gatewayOrderId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Refund webhook missing payment order reference",
          });
        await settleProviderRefundExactlyOnce({
          gatewayOrderId,
          providerRefundId: refs.providerRefundId,
          amountPaise: Number(
            refs.refundAmountPaise ?? refund.amountPaise ?? 0
          ),
          idempotencyKey: idempotencyKeyFor(
            refs.providerEventId,
            rawPayloadHash
          ),
          actorId: null,
        });
        await appendLifecycleAudit("refund_completed", {
          providerRefundId: refs.providerRefundId,
          refundId: refund.id,
        });
      } else {
        await markRefundFailedRecord({
          refundId: refund.id,
          providerRefundId: refs.providerRefundId,
          provider: PROVIDER,
          reason: "provider_refund_failed",
        });
      }
      await updateWebhookEventStatus(eventRowId, "processed");
      return {
        ok: true,
        status: "processed",
        eventType: refs.eventType,
        providerEventId: refs.providerEventId,
        paymentLifecycle: REFUND_SUCCESS_EVENTS.has(refs.eventType)
          ? "refunded"
          : undefined,
      };
    }

    await updateWebhookEventStatus(
      eventRowId,
      "unsupported_event",
      "unsupported provider webhook event"
    );
    return {
      ok: true,
      status: "unsupported_event",
      eventType: refs.eventType,
      providerEventId: refs.providerEventId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed";
    const dbForRetry = await getDb();
    if (eventRowId && dbForRetry) {
      await scheduleProviderEventRetry(dbForRetry, {
        providerEventRowId: eventRowId,
        reason: message,
      });
    } else {
      await updateWebhookEventStatus(eventRowId, "failed", message);
    }
    throw error;
  }
}

export function verificationStatusIsCommerciallySafe(
  status: PaymentVerificationStatus
) {
  return status === "verified";
}
