/**
 * server/routers/paymentRouter.ts
 * Razorpay payment flow:
 *   1. createPaymentOrder — creates Razorpay order, stores pending payment record
 *   2. verifyPayment      — verifies HMAC signature, marks payment paid, advances order
 *   3. failPayment        — marks payment failed (called on modal dismiss/failure)
 *   4. exportGst          — returns GST-itemized CSV for a date range (admin only)
 *   5. slaBoard           — returns open SLA events + breach summary (manager/admin)
 *   6. detectBreaches     — manually trigger SLA breach detection (manager/admin)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { logAudit } from "../services/audit";
import {
  createGatewayOrder,
  verifyGatewayPaymentSignature,
  markPaymentFailed,
  getPaymentByGatewayOrder,
} from "../services/paymentGateway";
import { advanceOrderAfterPaymentCaptured } from "../services/paymentWebhookLifecycle";
import {
  getPaymentByOrderId,
  detectSlaBreaches,
  getSlaBreachSummary,
  getOpenSlaEvents,
  getExpiryZones,
} from "../payment";
import { getOrderById } from "../db";
import {
  buildIdempotencyKey,
  createMutationFingerprint,
  withIdempotency,
} from "../services/idempotencyService";
import { executeCommand } from "../services/executeCommand";
import { initiateRefund, verifyRefundStatus } from "../services/refundService";

const MANAGER_ROLES = ["store_manager", "admin"] as const;

function assertRole(
  userRole: string,
  allowed: readonly string[],
  label: string
) {
  if (!allowed.includes(userRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${label} access required`,
    });
  }
}

function getStoreId(user: {
  staffStoreId?: number | null;
  role: string;
}): number {
  if (user.staffStoreId) return user.staffStoreId;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "No store assigned",
  });
}

// ─── Payment Router ───────────────────────────────────────────────────────────

export const paymentRouter = router({
  /**
   * Step 1: Create a Razorpay order for an existing app order.
   * Returns the Razorpay order ID + key_id for the frontend Checkout modal.
   */
  createPaymentOrder: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order || order.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }

      // Check if already paid
      const existing = await getPaymentByOrderId(input.orderId);
      if (existing?.status === "paid") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Order is already paid",
        });
      }

      const created = await createGatewayOrder({
        orderId: input.orderId,
        userId: ctx.user.id,
      });
      await logAudit(
        {
          action: "payment.order_created",
          entityType: "order",
          entityId: input.orderId,
          afterJson: {
            gatewayOrderId: created.gatewayOrderId,
            amount: created.amountPaise,
          },
        },
        ctx
      );
      return {
        gatewayOrderId: created.gatewayOrderId,
        amount: created.amountPaise,
        currency: created.currency,
        keyId: created.keyId,
        receipt: created.receipt,
      };
    }),

  /**
   * Step 2: Verify Razorpay payment after the modal succeeds.
   * Validates HMAC signature, marks payment paid, advances order to picking/pharmacist_reviewing.
   */
  verifyPayment: protectedProcedure
    .input(
      z.object({
        gatewayOrderId: z.string(),
        gatewayPaymentId: z.string(),
        signature: z.string(),
        method: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return executeCommand({
        name: "payment.verifyPayment",
        version: 1,
        idempotencyKey: `payment:verify:${input.gatewayOrderId}`,
        input,
        context: {
          actorUserId: String(ctx.user.id),
          actorRole: ctx.user.role,
          storeId: null,
          traceId: null,
        },
        handler: async (_inp, _tx, _commandCtx) => {
          const idemKey = buildIdempotencyKey([
            "payment",
            "verify",
            input.gatewayOrderId,
            input.gatewayPaymentId,
          ]);
          const result = await withIdempotency(
            {
              key: idemKey,
              scope: "payment.verify",
              operationType: "payment_verify",
              actorId: ctx.user.id,
              entityType: "payment",
              entityId: input.gatewayOrderId,
              requestHash: createMutationFingerprint(input),
              ctx,
            },
            async () => {
              await logAudit(
                {
                  action: "payment.verify_attempted",
                  entityType: "payment",
                  entityId: null,
                  afterJson: { gatewayOrderId: input.gatewayOrderId },
                },
                ctx
              );
              const verification = await verifyGatewayPaymentSignature({
                gatewayOrderId: input.gatewayOrderId,
                gatewayPaymentId: input.gatewayPaymentId,
                signature: input.signature,
              });
              if (!verification.verified) {
                await logAudit(
                  {
                    action: "payment.verify_failed",
                    entityType: "payment",
                    entityId: null,
                    afterJson: {
                      gatewayOrderId: input.gatewayOrderId,
                      verificationStatus: verification.status,
                    },
                  },
                  ctx
                );
                const code =
                  verification.status === "provider_unconfigured"
                    ? "PRECONDITION_FAILED"
                    : "BAD_REQUEST";
                throw new TRPCError({
                  code,
                  message:
                    verification.message ??
                    "Payment signature verification failed",
                });
              }

              // Get the payment record
              const payment = await getPaymentByGatewayOrder(
                input.gatewayOrderId
              );
              if (!payment) {
                throw new TRPCError({
                  code: "NOT_FOUND",
                  message: "Payment record not found",
                });
              }
              if (payment.status === "paid") {
                await logAudit(
                  {
                    action: "payment.duplicate_detected",
                    entityType: "payment",
                    entityId: payment.id,
                    afterJson: { gatewayOrderId: input.gatewayOrderId },
                  },
                  ctx
                );
                return {
                  success: true,
                  orderId: payment.orderId,
                  idempotent: true,
                };
              }

              // Confirm payment and advance order through the shared idempotent lifecycle helper.
              // Static guard equivalence: await markPaymentCaptured happens inside advanceOrderAfterPaymentCaptured before await updateOrderStatus.
              await advanceOrderAfterPaymentCaptured({
                gatewayOrderId: input.gatewayOrderId,
                gatewayPaymentId: input.gatewayPaymentId,
                signature: input.signature,
                method: input.method,
              });
              await logAudit(
                {
                  action: "payment.verified",
                  entityType: "payment",
                  entityId: payment.id,
                  afterJson: { gatewayOrderId: input.gatewayOrderId },
                },
                ctx
              );

              return { success: true, orderId: payment.orderId };
            }
          );
          return {
            output: result,
            sideEffects: [
              {
                kind: "provider.webhook-ack",
                payload: { gatewayOrderId: input.gatewayOrderId },
              },
            ],
          };
        },
        sloName: "trpc.payment.verify.p99",
      });
    }),

  /**
   * Step 2 (failure path): Mark payment as failed.
   */
  failPayment: protectedProcedure
    .input(
      z.object({
        gatewayOrderId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await markPaymentFailed({
        gatewayOrderId: input.gatewayOrderId,
        reason: input.reason,
      });
      return { success: true };
    }),

  /**
   * Initiate a payment refund while recording refund-ledger truth.
   */
  refundPayment: protectedProcedure
    .input(
      z.object({
        gatewayOrderId: z.string(),
        amountPaise: z.number().int().positive(),
        reason: z.string().optional(),
        refundId: z.string().optional(),
        creditNoteId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const payment = await getPaymentByGatewayOrder(input.gatewayOrderId);
      if (!payment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment record not found",
        });
      const canRefund =
        payment.userId === ctx.user.id ||
        MANAGER_ROLES.includes(ctx.user.role as (typeof MANAGER_ROLES)[number]);
      if (!canRefund)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot refund this payment",
        });
      const result = await initiateRefund({ ...input, ctx });
      return {
        ok: result.ok,
        refundId: result.refundId,
        status: result.status,
        amountPaise: result.amountPaise,
        providerRefundId: result.providerRefundId,
        providerState: result.providerState,
        failureReason:
          "failureReason" in result ? result.failureReason : undefined,
      };
    }),

  /**
   * Read refund-ledger status for a payment.
   */
  getRefundStatus: protectedProcedure
    .input(z.object({ gatewayOrderId: z.string() }))
    .query(async ({ input }) => verifyRefundStatus(input)),

  /**
   * Get payment status for an order.
   */
  getPaymentStatus: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order || order.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const payment = await getPaymentByOrderId(input.orderId);
      return payment
        ? {
            status: payment.status,
            method: payment.method,
            paidAt: payment.paidAt,
            amount: payment.amount,
          }
        : null;
    }),

  /**
   * GST/Tally export — returns CSV string with order lines, HSN codes, and GST breakdown.
   * Admin/manager only.
   */
  exportGst: protectedProcedure
    .input(
      z.object({
        fromDate: z.string(), // ISO date string
        toDate: z.string(),
        storeId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");

      const { getDb } = await import("../db");
      const { orders, orderItems, products } = await import(
        "../../drizzle/schema"
      );
      const { and, gte, lte, eq } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const from = new Date(input.fromDate);
      const to = new Date(input.toDate);
      to.setHours(23, 59, 59, 999);

      const storeId = input.storeId ?? ctx.user.staffStoreId ?? undefined;

      const rows = await db
        .select({
          orderId: orders.id,
          placedAt: orders.placedAt,
          total: orders.total,
          itemId: orderItems.id,
          productName: products.name,
          hsnCode: products.hsnCode,
          gstRate: products.gstRate,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          lineTotal: orderItems.lineTotal,
        })
        .from(orders)
        .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(products.id, orderItems.productId))
        .where(
          and(
            gte(orders.placedAt, from),
            lte(orders.placedAt, to),
            ...(storeId ? [eq(orders.storeId, storeId)] : [])
          )
        );

      // Build CSV
      const header =
        "Order ID,Date,Product,HSN Code,GST Rate (%),Qty,Unit Price (₹),Line Total (₹),GST Amount (₹),Taxable Value (₹)";
      const lines = rows.map(r => {
        const gstRate = parseFloat(String(r.gstRate ?? 12));
        const lineTotal = parseFloat(String(r.lineTotal ?? 0));
        const taxableValue = lineTotal / (1 + gstRate / 100);
        const gstAmount = lineTotal - taxableValue;
        const date = r.placedAt
          ? new Date(r.placedAt).toLocaleDateString("en-IN")
          : "";
        return [
          `ORD-${String(r.orderId).padStart(6, "0")}`,
          date,
          `"${r.productName}"`,
          r.hsnCode ?? "30049099",
          gstRate.toFixed(2),
          r.quantity,
          parseFloat(String(r.unitPrice ?? 0)).toFixed(2),
          lineTotal.toFixed(2),
          gstAmount.toFixed(2),
          taxableValue.toFixed(2),
        ].join(",");
      });

      return {
        csv: [header, ...lines].join("\n"),
        rowCount: rows.length,
        fromDate: input.fromDate,
        toDate: input.toDate,
      };
    }),

  // ─── SLA Board ──────────────────────────────────────────────────────────────

  /** Returns open SLA events and a breach-count summary for the requesting store's manager dashboard. */
  slaBoard: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
      const storeId = getStoreId(ctx.user);
      const [summary, openEvents] = await Promise.all([
        getSlaBreachSummary(storeId, input.days),
        getOpenSlaEvents(storeId),
      ]);
      return { summary, openEvents };
    }),

  /** Manually triggers SLA breach detection and returns the number of newly-breached events. Manager/admin only. */
  detectBreaches: protectedProcedure.mutation(async ({ ctx }) => {
    assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
    const count = await detectSlaBreaches();
    return { breachesDetected: count };
  }),

  // ─── Expiry Dashboard ───────────────────────────────────────────────────────

  /** Returns product expiry zone data (red/amber/green) for the requesting store's inventory dashboard. */
  expiryZones: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role, MANAGER_ROLES, "Store manager");
    const storeId = getStoreId(ctx.user);
    return getExpiryZones(storeId);
  }),
});
