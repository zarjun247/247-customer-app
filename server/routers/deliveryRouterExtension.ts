/**
 * deliveryRouterExtension.ts — second half of deliveryRouter sub-routers
 * Covers: slaRouter, timestampsRouter
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { slaEvents, orderTimestamps } from "../../drizzle/schema";
import { eq, and, desc, lte, isNull } from "drizzle-orm";
import { recordOrderTimestamp } from "../routingEngine";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess, requireStaffStore } from "../_core/rbac";

const MANAGER_ROLES = ["store_manager", "admin"] as const;

function assertRole(role: string, allowed: readonly string[], label: string) {
  if (!allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${label} access required`,
    });
}

function getStoreId(user: any): number {
  return requireStaffStore(user);
}

// ─── SLA sub-router ───────────────────────────────────────────────────────────

const slaRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().int().optional(),
        breached: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) return [];
      const storeId = input.storeId ?? getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);
      const conditions = [eq(slaEvents.storeId, storeId)];
      if (input.breached !== undefined)
        conditions.push(eq(slaEvents.breached, input.breached));
      return db
        .select()
        .from(slaEvents)
        .where(and(...conditions))
        .orderBy(desc(slaEvents.createdAt))
        .limit(input.limit);
    }),

  checkBreaches: protectedProcedure.mutation(async ({ ctx }) => {
    assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
    const db = await getDb();
    if (!db) return { breachesFound: 0 };
    const now = new Date();

    // Find undelivered SLA events past deadline
    const overdue = await db
      .select()
      .from(slaEvents)
      .where(
        and(
          isNull(slaEvents.deliveredAt),
          eq(slaEvents.breached, false),
          lte(slaEvents.slaDeadline, now)
        )
      );

    for (const event of overdue) {
      await db
        .update(slaEvents)
        .set({
          breached: true,
          breachDetectedAt: now,
        })
        .where(eq(slaEvents.id, event.id));

      // Record breach timestamp on order
      await recordOrderTimestamp(
        event.orderId,
        "sla_breached",
        null,
        "system",
        undefined,
        "SLA deadline exceeded",
        Math.round(
          (now.getTime() - new Date(event.slaDeadline).getTime()) / 60000
        )
      );
    }

    return { breachesFound: overdue.length };
  }),
});

// ─── Timestamps sub-router ────────────────────────────────────────────────────

const timestampsRouter = router({
  list: protectedProcedure
    .input(z.object({ orderId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(orderTimestamps)
        .where(eq(orderTimestamps.orderId, input.orderId))
        .orderBy(orderTimestamps.occurredAt);
    }),
});

export const deliveryRouterExtension = {
  sla: slaRouter,
  timestamps: timestampsRouter,
};
