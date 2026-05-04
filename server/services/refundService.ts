import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { and, eq } from "drizzle-orm";
import { paymentRecords } from "../../drizzle/schema";
import { logAudit } from "./audit";

export type RefundProviderState = "pending_provider" | "provider_not_configured" | "manual_required" | "succeeded" | "failed";

async function getPaymentByGatewayOrderId(gatewayOrderId: string) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const [row] = await db.select().from(paymentRecords).where(eq(paymentRecords.gatewayOrderId, gatewayOrderId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment record not found" });
  return row;
}

export async function getRefundLedger(orderId: number) { const db = await getDb(); if (!db) throw new Error("DB unavailable"); return db.select().from(paymentRecords).where(eq(paymentRecords.orderId, orderId)); }

export async function assertRefundIdempotent(input:{gatewayOrderId:string; refundId:string; ctx?:any}) {
  const db = await getDb(); if (!db) throw new Error("DB unavailable");
  const [row]=await db.select().from(paymentRecords).where(and(eq(paymentRecords.gatewayOrderId,input.gatewayOrderId), eq(paymentRecords.refundId,input.refundId))).limit(1);
  if (row) { await logAudit({ action:"refund.duplicate_detected", entityType:"payment", entityId: row.id, afterJson:{ gatewayOrderId: input.gatewayOrderId, refundId: input.refundId } }, input.ctx); throw new TRPCError({ code:"CONFLICT", message:"Duplicate refund"}); }
}

export async function assertRefundAmountAllowed(input:{ gatewayOrderId:string; amountPaise:number }) {
  const payment = await getPaymentByGatewayOrderId(input.gatewayOrderId);
  const paidPaise = Number(payment.amount ?? 0);
  const alreadyRefundedPaise = payment.status === "refunded" ? paidPaise : 0;
  const available = Math.max(0, paidPaise - alreadyRefundedPaise);
  if (input.amountPaise > available) throw new TRPCError({ code: "BAD_REQUEST", message: "Refund exceeds available paid amount" });
  return { availablePaise: available, paidPaise, alreadyRefundedPaise };
}

export async function initiateRefund(input:{gatewayOrderId:string; refundId:string; amountPaise:number; ctx?:any}) {
  await assertRefundIdempotent(input);
  await assertRefundAmountAllowed(input);
  const providerConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  const providerState: RefundProviderState = providerConfigured ? "pending_provider" : "provider_not_configured";
  await recordRefund({ gatewayOrderId: input.gatewayOrderId, refundId: input.refundId, providerState });
  await logAudit({ action:"refund.initiated", entityType:"payment", entityId:null, afterJson:{ gatewayOrderId: input.gatewayOrderId, amountPaise: input.amountPaise, providerState } }, input.ctx);
  await logAudit({ action:"refund.provider_pending", entityType:"payment", entityId:null, afterJson:{ gatewayOrderId: input.gatewayOrderId, providerState } }, input.ctx);
  return { ok:true, providerState, status: "pending" as const };
}

export async function recordRefund(input:{gatewayOrderId:string; refundId:string; providerState: RefundProviderState}) {
  const db=await getDb(); if(!db) throw new Error("DB unavailable");
  await db.update(paymentRecords).set({ refundId: input.refundId, failureReason: `refund:${input.providerState}` }).where(eq(paymentRecords.gatewayOrderId,input.gatewayOrderId));
}

export async function markRefundSucceeded(input:{gatewayOrderId:string; refundId:string; ctx?:any}) { const db=await getDb(); if(!db) throw new Error("DB unavailable"); await db.update(paymentRecords).set({ refundId: input.refundId, refundedAt: new Date(), status:"refunded", failureReason: null }).where(eq(paymentRecords.gatewayOrderId,input.gatewayOrderId)); await logAudit({ action:"refund.succeeded", entityType:"payment", entityId:null, afterJson:input }, input.ctx); }
export async function markRefundFailed(input:{gatewayOrderId:string; reason:string; ctx?:any}) { await logAudit({ action:"refund.failed", entityType:"payment", entityId:null, afterJson:input }, input.ctx); return { ok:true, providerState: "manual_required" as RefundProviderState }; }
export async function verifyRefundStatus(input:{gatewayOrderId:string}) { const db=await getDb(); if(!db) throw new Error("DB unavailable"); const [row]=await db.select({ status: paymentRecords.status, refundId: paymentRecords.refundId, providerState: paymentRecords.failureReason }).from(paymentRecords).where(eq(paymentRecords.gatewayOrderId,input.gatewayOrderId)).limit(1); return row ?? null; }
