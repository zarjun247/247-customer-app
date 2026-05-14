import crypto from "crypto";
import { redactObject } from "../_core/redact";

export type ProviderWebhookProcessingStatus =
  | "received"
  | "verified"
  | "ignored_duplicate"
  | "processed"
  | "failed"
  | "retry_scheduled"
  | "dead_letter"
  | "rejected_signature"
  | "unsupported_event";

export type PaymentLifecycleTransition =
  | "attempt_created"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "cancelled"
  | "expired";

export type ProviderWebhookResult = {
  ok: boolean;
  status: ProviderWebhookProcessingStatus;
  eventType: string;
  providerEventId: string | null;
  idempotent?: boolean;
  paymentLifecycle?: PaymentLifecycleTransition;
  message?: string;
};

const SIGNATURE_FIELDS = new Set([
  "signature",
  "x-razorpay-signature",
  "razorpay_signature",
  "token",
  "secret",
  "authorization",
]);

export function hashRawPayload(rawBody: string | Buffer) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

export function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

export function deepRedact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepRedact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>
    )) {
      const lowered = key.toLowerCase();
      if (
        SIGNATURE_FIELDS.has(lowered) ||
        lowered.includes("signature") ||
        lowered.includes("token") ||
        lowered.includes("secret")
      ) {
        out[key] = "[REDACTED]";
      } else if (
        [
          "card",
          "bank_account",
          "vpa",
          "contact",
          "email",
          "notes",
          "prescription",
        ].includes(lowered)
      ) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = deepRedact(child);
      }
    }
    return redactObject(out);
  }
  return value;
}

export function sanitizeProviderWebhookPayload(payload: unknown) {
  return deepRedact(payload) as Record<string, unknown> | null;
}

export function getNested(
  payload: Record<string, unknown>,
  path: string[]
): unknown {
  return path.reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === "object"
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    payload
  );
}

export function extractProviderWebhookRefs(payload: Record<string, unknown>) {
  const eventType =
    safeString(payload.event) ?? safeString(payload.type) ?? "unknown";
  const providerEventId =
    safeString(payload.id) ??
    safeString(payload.event_id) ??
    safeString(payload.eventId);
  const asObj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const paymentEntity = asObj(
    getNested(payload, ["payload", "payment", "entity"]) ?? payload.payment
  );
  const orderEntity = asObj(
    getNested(payload, ["payload", "order", "entity"]) ?? payload.order
  );
  const refundEntity = asObj(
    getNested(payload, ["payload", "refund", "entity"]) ?? payload.refund
  );
  const gatewayOrderId =
    safeString(paymentEntity.order_id) ??
    safeString(orderEntity.id) ??
    safeString(payload.gatewayOrderId) ??
    safeString(payload.order_id);
  const gatewayPaymentId =
    safeString(paymentEntity.id) ??
    safeString(payload.gatewayPaymentId) ??
    safeString(payload.payment_id);
  const providerRefundId =
    safeString(refundEntity.id) ??
    safeString(payload.refundId) ??
    safeString(payload.refund_id);
  const refundAmountPaise =
    safeNumber(refundEntity.amount) ??
    safeNumber(payload.amountPaise) ??
    safeNumber(payload.amount);
  const paymentNotes = asObj(paymentEntity.notes);
  const orderNotes = asObj(orderEntity.notes);
  const orderId =
    safeNumber(paymentNotes.orderId) ??
    safeNumber(orderNotes.orderId) ??
    safeNumber(payload.orderId);
  return {
    eventType,
    providerEventId,
    gatewayOrderId,
    gatewayPaymentId,
    providerRefundId,
    refundAmountPaise,
    orderId,
  };
}
