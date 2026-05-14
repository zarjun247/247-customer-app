import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getOrderById } from "../db";
import {
  createOrderRating,
  updateOrderRating,
  getOrderRating,
} from "../services/orderRating";

export const ratingRouter = router({
  /** Submits a new rating for a delivered or completed order, including optional dimension scores and comments. */
  create: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        overall: z.number().min(1).max(5),
        delivery: z.number().min(1).max(5).optional(),
        packaging: z.number().min(1).max(5).optional(),
        pharmacistSupport: z.number().min(1).max(5).optional(),
        availability: z.number().min(1).max(5).optional(),
        issueTags: z.array(z.string()).optional(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await getOrderById(input.orderId);
      if (!order || order.userId !== ctx.user.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (!["delivered", "completed"].includes(order.status))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Order not eligible for rating",
        });
      return await createOrderRating({ ...input, customerId: ctx.user.id });
    }),
  /** Updates one or more fields on an existing order rating submitted by the authenticated user. */
  update: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        updates: z.object({
          overall: z.number().min(1).max(5).optional(),
          delivery: z.number().min(1).max(5).optional(),
          packaging: z.number().min(1).max(5).optional(),
          pharmacistSupport: z.number().min(1).max(5).optional(),
          availability: z.number().min(1).max(5).optional(),
          issueTags: z.array(z.string()).optional(),
          comment: z.string().optional(),
        }),
      })
    )
    .mutation(
      async ({ ctx, input }) =>
        await updateOrderRating(input.orderId, ctx.user.id, input.updates)
    ),
  /** Retrieves the rating the authenticated user submitted for a given order, if one exists. */
  get: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(
      async ({ ctx, input }) => await getOrderRating(input.orderId, ctx.user.id)
    ),
});
