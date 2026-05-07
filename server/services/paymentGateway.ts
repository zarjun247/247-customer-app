import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { paymentConnector } from "../connectors";
import { getOrderById } from "../db";
import { createPaymentRecord, getPaymentByGatewayOrderId, getPaymentByOrderId, confirmPaymentRecord, failPaymentRecord } from "../payment";
import { isProviderEnabled } from "../_core/env";
import { redactObject } from "../_core/redact";

export type PaymentProviderStatus = "verified" | "failed" | "provider_unconfigured" | "demo_skipped" | "not_implemented";

export type PaymentVerificationResult = {
  verified: boolean;
  status: PaymentProviderStatus;
  realGatewayVerification: boolean;
  reason?: string;
};

function isExplicitPaymentDemoMode(): boolean {
  const mode = String(process.env.PAYMENT_PROVIDER_MODE ?? process.env.LOCAL_DEMO_MODE ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "demo", "local", "test"].includes(mode)
    || String(process.env.NODE_ENV ?? "").toLowerCase() === "test";
}

function providerUnconfigured(message: string): TRPCError {
  return new TRPCError({ code: "PRECONDITION_FAILED", message });
}

export function buildPaymentAuditPayload(payload: Record<string, unknown>) { return redactObject(payload); }

export async function createGatewayOrder(input: { orderId: number; userId: number }) {
  if (!isProviderEnabled("PAYMENT_PROVIDER_ENABLED", false)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment provider disabled" });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw providerUnconfigured("Payment provider_unconfigured: RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET missing");
  const order = await getOrderById(input.orderId);
  if (!order || order.userId !== input.userId) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
  const amountPaise = Math.round(Number(order.total ?? 0) * 100);
  const receipt = `ORD-${String(input.orderId).padStart(6, "0")}`;
  const gatewayOrder = await paymentConnector.createOrder({ amount: amountPaise, currency: "INR", receipt, notes: { orderId: String(input.orderId), userId: String(input.userId) } });
  await createPaymentRecord({ orderId: input.orderId, userId: input.userId, gatewayOrderId: gatewayOrder.gatewayOrderId, amount: amountPaise, currency: "INR" });
  return { gatewayOrderId: gatewayOrder.gatewayOrderId, amountPaise, receipt, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID };
}

export async function verifyGatewayPayment(input: { gatewayOrderId: string; gatewayPaymentId: string; signature: string }): Promise<PaymentVerificationResult> {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    if (isExplicitPaymentDemoMode()) {
      return { verified: false, status: "demo_skipped", realGatewayVerification: false, reason: "RAZORPAY_KEY_SECRET missing; demo/test mode does not verify real payments" };
    }
    return { verified: false, status: "provider_unconfigured", realGatewayVerification: false, reason: "RAZORPAY_KEY_SECRET missing" };
  }

  const verified = await paymentConnector.verifyPayment(input);
  return verified
    ? { verified: true, status: "verified", realGatewayVerification: true }
    : { verified: false, status: "failed", realGatewayVerification: false, reason: "gateway signature mismatch" };
}

export async function verifyGatewayPaymentSignature(input: { gatewayOrderId: string; gatewayPaymentId: string; signature: string }) {
  const result = await verifyGatewayPayment(input);
  return result.verified;
}

export function verifyGatewayWebhookSignature(rawBody: string, signature?: string | null) {
  const enabled = isProviderEnabled("PAYMENT_WEBHOOK_ENABLED", false);
  if (!enabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Webhook disabled" });
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const production = String(process.env.NODE_ENV ?? "").toLowerCase() === "production";
  if (!secret && production) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Webhook secret missing" });
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length || signature.length !== digest.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function normalizeGatewayPaymentEvent(event: any) { return { id: event?.id ?? null, type: event?.event ?? "unknown", payload: event?.payload ?? null }; }

function demoOrNotImplemented(helper: string) {
  if (isExplicitPaymentDemoMode()) return { ok: false, status: "demo_skipped" as const, helper };
  throw new TRPCError({ code: "NOT_IMPLEMENTED", message: `${helper} is not wired to durable payment state` });
}

export async function recordPaymentAttempt(_: any) { return demoOrNotImplemented("recordPaymentAttempt"); }
export async function markPaymentAuthorized(_: any) { return demoOrNotImplemented("markPaymentAuthorized"); }
export async function markPaymentCaptured(input: { gatewayOrderId: string; gatewayPaymentId: string; signature: string; method?: string }) { await confirmPaymentRecord({ gatewayOrderId: input.gatewayOrderId, gatewayPaymentId: input.gatewayPaymentId, gatewaySignature: input.signature, method: input.method }); return { ok: true, status: "verified" as const }; }
export async function markPaymentFailed(input: { gatewayOrderId: string; reason?: string }) { await failPaymentRecord(input); return { ok: true, status: "failed" as const }; }
export async function markPaymentRefunded(_: any) { return demoOrNotImplemented("markPaymentRefunded"); }
export async function getPaymentStatus(input: { orderId: number }) { return getPaymentByOrderId(input.orderId); }
export async function assertPaymentCanRelease(input: { orderId: number; allowCod?: boolean }) {
  const payment = await getPaymentByOrderId(input.orderId);
  if (!payment) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment not found" });
  if (payment.status === "paid") return { ok: true, reason: "paid" };
  if (input.allowCod) return { ok: true, reason: "cod_allowed" };
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment not captured" });
}
export async function getPaymentByGatewayOrder(orderId: string) { return getPaymentByGatewayOrderId(orderId); }
