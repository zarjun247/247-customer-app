import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, staffProcedure } from "../_core/trpc";
import * as ledger from "../services/reservationLedger";
import type { CommandContext } from "../services/executeCommand";

function requireCtxUser(ctx: {
  user?: { id?: number; role?: string; staffStoreId?: number | null } | null;
}) {
  if (!ctx.user)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  return ctx.user;
}

function toCommandContext(ctx: {
  user?: { id?: number; role?: string; staffStoreId?: number | null } | null;
  requestId?: string;
}): CommandContext {
  const user = ctx.user;
  return {
    actorUserId: user?.id != null ? String(user.id) : null,
    actorRole: user?.role ?? null,
    storeId: user?.staffStoreId != null ? String(user.staffStoreId) : null,
    traceId: ctx.requestId ?? null,
  };
}

export const reservationRouter = router({
  // Customer: reserve stock against a cart
  reserve: protectedProcedure
    .input(
      z.object({
        storeId: z.number().int().positive(),
        cartId: z.number().int().positive().optional(),
        lines: z
          .array(
            z.object({
              productId: z.number().int().positive(),
              variantId: z.number().int().positive().optional().nullable(),
              quantity: z.number().int().positive(),
            })
          )
          .min(1),
        ttlSeconds: z.number().int().positive().optional(),
        idempotencyKey: z.string().min(1).max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = requireCtxUser(ctx);
      const context = toCommandContext(ctx);
      return ledger.reserve(
        {
          storeId: input.storeId,
          customerId: (user as { id?: number }).id,
          cartId: input.cartId ?? null,
          lines: input.lines,
          ttlSeconds: input.ttlSeconds,
          idempotencyKey: input.idempotencyKey,
        },
        context
      );
    }),

  // Staff: confirm a reservation (converts to sale stock consumption)
  confirm: staffProcedure
    .input(
      z.object({
        reservationId: z.string().uuid(),
        saleId: z.string().optional(),
        idempotencyKey: z.string().min(1).max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const context = toCommandContext(ctx);
      return ledger.confirm(
        {
          reservationId: input.reservationId,
          saleId: input.saleId,
          idempotencyKey: input.idempotencyKey,
        },
        context
      );
    }),

  // Customer: release own active reservation
  release: protectedProcedure
    .input(
      z.object({
        reservationId: z.string().uuid(),
        reason: z.string().optional(),
        idempotencyKey: z.string().min(1).max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const context = toCommandContext(ctx);
      return ledger.release(
        {
          reservationId: input.reservationId,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
        context
      );
    }),

  // Customer: list own active reservations
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const user = requireCtxUser(ctx);
    return ledger.listByCustomer((user as { id?: number }).id ?? 0);
  }),

  // Staff: list reservations by store
  listByStore: staffProcedure
    .input(
      z.object({
        storeId: z.number().int().positive(),
        limit: z.number().int().positive().max(200).default(100),
      })
    )
    .query(async ({ input }) => {
      return ledger.listActive(input.storeId, input.limit);
    }),
});
