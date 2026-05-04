import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { paymentConnector } from "../connectors";
import { getOrderById } from "../db";
import { createPaymentRecord, getPaymentByGatewayOrderId, getPaymentByOrderId, confirmPaymentRecord, failPaymentRecord } from "../payment";
import { ENV, isProviderEnabled } from "../_core/env";
import { redactObject } from "../_core/redact";

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

export async function verifyGatewayPaymentSignature(input: { gatewayOrderId: string; gatewayPaymentId: string; signature: string }) {
  return paymentConnector.verifyPayment(input);
}

export function verifyGatewayWebhookSignature(rawBody: string, signature: string) {
  const enabled = isProviderEnabled("PAYMENT_WEBHOOK_ENABLED", false);
  if (!enabled) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Webhook disabled" });
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret && ENV.isProduction) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Webhook secret missing" });
  if (!secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature || ""));
}

export function normalizeGatewayPaymentEvent(event: any) { return { id: event?.id ?? null, type: event?.event ?? "unknown", payload: event?.payload ?? null }; }
export async function recordPaymentAttempt(_: any) { return { ok: true }; }
export async function markPaymentAuthorized(_: any) { return { ok: true }; }
export async function markPaymentCaptured(input: { gatewayOrderId: string; gatewayPaymentId: string; signature: string; method?: string }) { await confirmPaymentRecord({ gatewayOrderId: input.gatewayOrderId, gatewayPaymentId: input.gatewayPaymentId, gatewaySignature: input.signature, method: input.method }); return { ok: true }; }
export async function markPaymentFailed(input: { gatewayOrderId: string; reason?: string }) { await failPaymentRecord(input); return { ok: true }; }
export async function markPaymentRefunded(_: any) { return { ok: true }; }
export async function getPaymentStatus(input: { orderId: number }) { return getPaymentByOrderId(input.orderId); }
export async function assertPaymentCanRelease(input: { orderId: number; allowCod?: boolean }) {
  const payment = await getPaymentByOrderId(input.orderId);
  if (!payment) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment not found" });
  if (payment.status === "paid") return { ok: true, reason: "paid" };
  if (input.allowCod) return { ok: true, reason: "cod_allowed" };
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Payment not captured" });
}
export async function getPaymentByGatewayOrder(orderId: string) { return getPaymentByGatewayOrderId(orderId); }
