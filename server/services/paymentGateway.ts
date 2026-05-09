import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { paymentConnector } from "../connectors";
import { getOrderById } from "../db";
import { createPaymentRecord, getPaymentByGatewayOrderId, getPaymentByOrderId, confirmPaymentRecord, failPaymentRecord } from "../payment";
import { isProviderEnabled } from "../_core/env";
import { redactObject } from "../_core/redact";
import { markProviderFailure, markProviderNotConfigured, markProviderSuccess } from "./providerRuntime";

export type PaymentVerificationStatus = "verified" | "failed" | "provider_unconfigured" | "demo_skipped";
export type PaymentLifecycleStatus = "persisted" | "demo_skipped" | "not_implemented";

export type PaymentVerificationResult = {
  verified: boolean;
  status: PaymentVerificationStatus;
  message?: string;
};

export type PaymentLifecycleResult = {
  ok: boolean;
  status: PaymentLifecycleStatus;
  message?: string;
};

function runtimeIsProduction() {
  return process.env.NODE_ENV === "production";
}

function isExplicitPaymentDemoMode() {
  const demoFlag = String(process.env.PAYMENT_DEMO_MODE ?? process.env.LOCAL_DEMO_MODE ?? "").toLowerCase();
  return ["1", "true", "yes", "on"].includes(demoFlag) || process.env.NODE_ENV === "test";
}

function notImplementedLifecycleResult(helperName: string): PaymentLifecycleResult {
  if (isExplicitPaymentDemoMode() && !runtimeIsProduction()) {
    return { ok: false, status: "demo_skipped", message: `${helperName} skipped in explicit demo/test mode` };
  }
  throw new TRPCError({ code: "NOT_IMPLEMENTED", message: `${helperName} is not wired to durable payment state` });
}

export function buildPaymentAuditPayload(payload: Record<string, unknown>) { return redactObject(payload); }

export async function createGatewayOrder(input: { orderId: number; userId: number }) {
  if (!isProviderEnabled("PAYMENT_PROVIDER_ENABLED", false)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment provider disabled" });
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment provider not configured" });
  const order = await getOrderById(input.orderId);
  if (!order || order.userId !== input.userId) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
  const amountPaise = Math.round(Number(order.total ?? 0) * 100);
  const receipt = `ORD-${String(input.orderId).padStart(6, "0")}`;
  const gatewayOrder = await paymentConnector.createOrder({ amount: amountPaise, currency: "INR", receipt, notes: { orderId: String(input.orderId), userId: String(input.userId) } });
  await createPaymentRecord({ orderId: input.orderId, userId: input.userId, gatewayOrderId: gatewayOrder.gatewayOrderId, amount: amountPaise, currency: "INR" });
  return { gatewayOrderId: gatewayOrder.gatewayOrderId, amountPaise, receipt, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID };
}

export async function verifyGatewayPaymentSignature(input: { gatewayOrderId: string; gatewayPaymentId: string; signature: string }): Promise<PaymentVerificationResult> {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    if (isExplicitPaymentDemoMode() && !runtimeIsProduction()) {
      await markProviderNotConfigured({ providerType: "payment", operationType: "verify", entityType: "razorpay_payment", entityRef: input.gatewayPaymentId, idempotencyKey: `payment:verify:${input.gatewayOrderId}:${input.gatewayPaymentId}`, error: "demo_skipped" });
      return { verified: false, status: "demo_skipped", message: "Razorpay payment verification skipped in explicit demo/test mode" };
    }
    await markProviderNotConfigured({ providerType: "payment", operationType: "verify", entityType: "razorpay_payment", entityRef: input.gatewayPaymentId, idempotencyKey: `payment:verify:${input.gatewayOrderId}:${input.gatewayPaymentId}`, error: "Razorpay key secret missing" });
    return { verified: false, status: "provider_unconfigured", message: "Razorpay key secret missing" };
  }

  const verified = await paymentConnector.verifyPayment(input);
  if (verified) {
    await markProviderSuccess({ providerType: "payment", operationType: "verify", entityType: "razorpay_payment", entityRef: input.gatewayPaymentId, idempotencyKey: `payment:verify:${input.gatewayOrderId}:${input.gatewayPaymentId}`, status: "verified", providerRef: input.gatewayPaymentId, responsePayload: { signatureVerified: true } });
    return { verified: true, status: "verified" };
  }
  await markProviderFailure({ providerType: "payment", operationType: "verify", entityType: "razorpay_payment", entityRef: input.gatewayPaymentId, idempotencyKey: `payment:verify:${input.gatewayOrderId}:${input.gatewayPaymentId}`, error: "Payment signature mismatch" });
  return { verified: false, status: "failed", message: "Payment signature mismatch" };
}

export function verifyGatewayWebhookSignature(rawBody: string, signature?: string | null) {
  const enabled = isProviderEnabled("PAYMENT_WEBHOOK_ENABLED", false);
  if (!enabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Webhook disabled" });
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret && runtimeIsProduction()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Webhook secret missing" });
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function normalizeGatewayPaymentEvent(event: any) { return { id: event?.id ?? null, type: event?.event ?? "unknown", payload: event?.payload ?? null }; }
export async function recordPaymentAttempt(_: any): Promise<PaymentLifecycleResult> { return notImplementedLifecycleResult("recordPaymentAttempt"); }
export async function markPaymentAuthorized(_: any): Promise<PaymentLifecycleResult> { return notImplementedLifecycleResult("markPaymentAuthorized"); }
export async function markPaymentCaptured(input: { gatewayOrderId: string; gatewayPaymentId: string; signature: string; method?: string }): Promise<PaymentLifecycleResult> { await confirmPaymentRecord({ gatewayOrderId: input.gatewayOrderId, gatewayPaymentId: input.gatewayPaymentId, gatewaySignature: input.signature, method: input.method }); return { ok: true, status: "persisted" }; }
export async function markPaymentFailed(input: { gatewayOrderId: string; reason?: string }): Promise<PaymentLifecycleResult> { await failPaymentRecord(input); return { ok: true, status: "persisted" }; }
export async function markPaymentRefunded(_: any): Promise<PaymentLifecycleResult> { return notImplementedLifecycleResult("markPaymentRefunded"); }
export async function getPaymentStatus(input: { orderId: number }) { return getPaymentByOrderId(input.orderId); }
export async function assertPaymentCanRelease(input: { orderId: number; allowCod?: boolean }) {
  const payment = await getPaymentByOrderId(input.orderId);
  if (!payment) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment not found" });
  if (payment.status === "paid") return { ok: true, reason: "paid" };
  if (input.allowCod) return { ok: true, reason: "cod_allowed" };
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment not captured" });
}
export async function getPaymentByGatewayOrder(orderId: string) { return getPaymentByGatewayOrderId(orderId); }
