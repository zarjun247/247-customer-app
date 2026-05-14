import { z } from "zod";
import { ONBOARDING_REQUIRED_MSG } from "@shared/const";
import {
  router,
  customerMutationProcedure,
  protectedProcedure,
  requireOrderOwnershipOrStaff,
  isStaffRole,
} from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getUserById,
  getStoreById,
  getSkuById,
  getCart,
  upsertCartItem,
  clearCart,
  softLockCart,
  releaseCartLock,
  applySoftLockToSkus,
  releaseSoftLock,
  createOrder,
  getOrdersByUser,
  getOrderById,
  getOrderItems,
  updateOrderStatus,
  writeAuditLog,
  computeRefillIntervalFromHistory,
  getOrderItemsForReorder,
  upsertRefillReminder,
  getPrescriptionById,
  generateAndStoreInvoice,
} from "../db";
import {
  reserveStockForOrder,
  releaseReservationOnOrderCancel,
} from "../services/reservationService";
import { storagePut } from "../storage";
import { tplOrderReceived, alertNewOrder } from "../notifications";

export const orderRouter = router({
  /** Converts the current cart into a placed order, reserving stock and sending notifications; requires completed onboarding. */
  checkout: customerMutationProcedure
    .input(z.object({ prescriptionId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(ctx.user.id);
      if (!user?.onboardingComplete || !user?.assignedStoreId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: ONBOARDING_REQUIRED_MSG,
        });
      }
      const cartData = await getCart(ctx.user.id);
      if (cartData.length === 0) throw new Error("Cart is empty");

      const store = await getStoreById(user.assignedStoreId);
      const slaMins = store?.slaMins ?? 20;

      const lockItems = cartData.map(i => ({
        skuId: i.skuId,
        qty: i.quantity,
      }));
      for (const item of cartData) {
        const sku = await getSkuById(item.skuId);
        if (
          !sku ||
          !sku.isActive ||
          sku.storeId !== user.assignedStoreId ||
          sku.productId !== item.productId ||
          Number(sku.availableQty ?? 0) < item.quantity
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cart contains unavailable items",
          });
        }
      }

      const subtotal = cartData.reduce(
        (s, i) => s + parseFloat(String(i.sellingPrice)) * i.quantity,
        0
      );
      const total = subtotal;

      const needsRx = cartData.some(i => i.requiresPrescription);
      if (needsRx) {
        if (!input.prescriptionId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A valid prescription is required for one or more items in your cart. Please upload your prescription before checkout.",
          });
        }
        const rx = await getPrescriptionById(input.prescriptionId);
        if (!rx || rx.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Prescription does not belong to this account",
          });
        }
        if (rx.status === "rejected") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This prescription has been rejected. Please upload a new prescription.",
          });
        }
      }
      const initialStatus = needsRx
        ? "awaiting_pharmacist_review"
        : "awaiting_allocation";
      let orderId: number | null = null;
      await softLockCart(ctx.user.id);
      await applySoftLockToSkus(lockItems);
      try {
        orderId = await createOrder({
          userId: ctx.user.id,
          storeId: user.assignedStoreId,
          prescriptionId: input.prescriptionId,
          subtotal: subtotal.toFixed(2),
          total: total.toFixed(2),
          promisedSlaMins: slaMins,
          deliveryAddress: user.flatNumber
            ? `Flat ${user.flatNumber}`
            : undefined,
          flatNumber: user.flatNumber ?? undefined,
          buildingId: user.buildingId ?? undefined,
          source: "app",
          items: cartData.map(i => ({
            productId: i.productId,
            variantId: i.variantId ?? undefined,
            storeSkuId: i.skuId,
            quantity: i.quantity,
            unitPrice: String(i.sellingPrice),
            lineTotal: (
              parseFloat(String(i.sellingPrice)) * i.quantity
            ).toFixed(2),
          })),
        });

        await releaseSoftLock(lockItems);
        await releaseCartLock(ctx.user.id);
        for (const item of cartData) {
          await reserveStockForOrder({
            orderId,
            storeId: user.assignedStoreId,
            productId: item.productId,
            variantId: item.variantId ?? null,
            skuId: item.skuId,
            qty: item.quantity,
            ctx,
          });
        }

        await updateOrderStatus(orderId, initialStatus);
        await clearCart(ctx.user.id);
        await writeAuditLog(ctx.user.id, "order_created", "order", orderId, {
          source: "app",
        });

        const notifPayload = tplOrderReceived({
          orderId,
          customerName: user.name ?? "Customer",
          itemCount: cartData.length,
          totalAmount: total.toFixed(2),
          storeName: store?.name ?? "24/7 Pharmacy",
        });
        alertNewOrder({
          orderId,
          storeName: store?.name ?? "24/7 Pharmacy",
          totalAmount: total.toFixed(2),
          itemCount: cartData.length,
        }).catch(() => {});
        console.log(
          `[Notification] ${notifPayload.title}: ${notifPayload.content}`
        );

        for (const item of cartData) {
          if (item.isChronicMedication) {
            const avgIntervalDays = await computeRefillIntervalFromHistory(
              ctx.user.id,
              item.productId
            );
            await upsertRefillReminder(
              ctx.user.id,
              item.productId,
              new Date(),
              avgIntervalDays
            );
          }
        }

        return { orderId, status: initialStatus, promisedSlaMins: slaMins };
      } catch (error) {
        if (orderId)
          await releaseReservationOnOrderCancel({
            orderId,
            ctx,
            releaseReason: "checkout_failed",
          });
        await releaseSoftLock(lockItems);
        await releaseCartLock(ctx.user.id);
        throw error;
      }
    }),

  /** Returns all orders placed by the current user, ordered by most recent. */
  list: protectedProcedure.query(async ({ ctx }) =>
    getOrdersByUser(ctx.user.id)
  ),

  /** Returns full detail for a single order including line items; enforces ownership. */
  detail: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order || order.userId !== ctx.user.id)
        throw new Error("Order not found");
      const items = await getOrderItems(input.orderId);
      return { ...order, items };
    }),

  /** Clears the cart and repopulates it with the items from a previous order, ready for re-checkout. */
  reorder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order || order.userId !== ctx.user.id)
        throw new Error("Order not found");
      const items = await getOrderItemsForReorder(input.orderId);
      await clearCart(ctx.user.id);
      for (const item of items) {
        await upsertCartItem(
          ctx.user.id,
          item.storeSkuId,
          item.productId,
          item.quantity
        );
      }
      await writeAuditLog(
        ctx.user.id,
        "order_reorder",
        "order",
        input.orderId,
        {}
      );
      return { success: true, itemCount: items.length };
    }),

  /** Updates an order's lifecycle status; customers may only cancel, all other transitions are staff-only. */
  advanceStatus: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        status: z.enum([
          "draft",
          "awaiting_prescription",
          "awaiting_pharmacist_review",
          "clarification_needed",
          "rejected",
          "awaiting_allocation",
          "backorder_review",
          "reserved",
          "picking",
          "packed",
          "assigned_to_rider",
          "out_for_delivery",
          "delivery_exception",
          "returned",
          "delivered",
          "closed",
          "cancelled",
          "pharmacist_reviewing",
          "return_to_stock",
        ]),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order)
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const userRole = ctx.user.role;
      const staffOnlyStatuses = [
        "awaiting_pharmacist_review",
        "clarification_needed",
        "rejected",
        "awaiting_allocation",
        "backorder_review",
        "reserved",
        "picking",
        "packed",
        "assigned_to_rider",
        "out_for_delivery",
        "delivery_exception",
        "returned",
        "delivered",
        "closed",
        "pharmacist_reviewing",
        "return_to_stock",
      ];
      if (staffOnlyStatuses.includes(input.status) && !isStaffRole(userRole)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only staff can advance to this status",
        });
      }
      if (!isStaffRole(userRole) && input.status !== "cancelled") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Customers can only cancel orders",
        });
      }
      requireOrderOwnershipOrStaff(ctx.user.id, order.userId, userRole);
      const before = { status: order.status };
      await updateOrderStatus(input.orderId, input.status, {
        reason: input.reason,
        changedBy: ctx.user.id,
      });
      await writeAuditLog(
        ctx.user.id,
        "order_status_changed",
        "order",
        input.orderId,
        undefined,
        {
          actorRole: userRole,
          beforeJson: before,
          afterJson: { status: input.status },
          reason: input.reason,
          channel: "admin",
        }
      );
      if (input.status === "delivered") {
        try {
          await generateAndStoreInvoice(
            input.orderId,
            async (key, data, mime) => {
              return storagePut(key, data, mime);
            }
          );
        } catch (e) {
          console.error(
            "[Invoice] Failed to generate invoice for order",
            input.orderId,
            e
          );
        }
      }
      return { success: true };
    }),
});
