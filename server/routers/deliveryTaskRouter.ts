/**
 * deliveryTaskRouter.ts — Delivery Task sub-router
 *
 * Extracted from deliveryRouter.ts to keep files under the 600-line limit.
 * POD + exception procedures (deliverWithOtp, deliverWithPhoto, recordFailed,
 * recordReturned) live in deliveryTaskPodRouter.ts and are merged here.
 *
 * Procedures (all under the `task.*` namespace in deliveryRouter):
 *   task.assign
 *   task.confirmPickup
 *   task.outForDelivery
 *   task.deliverWithOtp        — see deliveryTaskPodRouter.ts
 *   task.deliverWithPhoto      — see deliveryTaskPodRouter.ts
 *   task.recordFailed          — see deliveryTaskPodRouter.ts
 *   task.recordReturned        — see deliveryTaskPodRouter.ts
 *   task.collectCod
 *   task.reconcileCod
 *   task.list
 *   task.get
 *   task.stats
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import type { ResultSetHeader } from "mysql2";
import {
  orders,
  riders,
  deliveryTasks,
  deliveryEvents,
} from "../../drizzle/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { recordOrderTimestamp } from "../routingEngine";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import {
  assertRole,
  getStoreId,
  assertRegulatedDeliveryAllowed,
  DELIVERY_ROLES,
  MANAGER_ROLES,
} from "./deliveryHelpers";
import { taskPodProcedures } from "./deliveryTaskPodRouter";

// ─── Task sub-router ──────────────────────────────────────────────────────────

export const deliveryTaskRouter = router({
  assign: protectedProcedure
    .input(
      z.object({
        orderId: z.number().int(),
        riderId: z.number().int(),
        isCod: z.boolean().default(false),
        codAmount: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const storeId = getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);

      // Create delivery task
      const taskInsert = await db.insert(deliveryTasks).values({
        orderId: input.orderId,
        riderId: input.riderId,
        storeId,
        status: "assigned",
        isCod: input.isCod,
        codAmount: input.codAmount ?? null,
      });
      const [taskHeader] = taskInsert as unknown as [ResultSetHeader];
      const taskId = taskHeader.insertId;

      // Update order status + riderId
      await db
        .update(orders)
        .set({
          status: "assigned_to_rider",
          riderId: input.riderId,
          statusChangedBy: ctx.user.id,
          statusChangedAt: new Date(),
        })
        .where(eq(orders.id, input.orderId));

      // Update rider status
      await db
        .update(riders)
        .set({ status: "on_delivery" })
        .where(eq(riders.id, input.riderId));

      // Record delivery event
      await db.insert(deliveryEvents).values({
        orderId: input.orderId,
        riderId: input.riderId,
        eventType: "assigned",
        note: `Assigned by ${ctx.user.id}`,
      });

      // Record order timestamp
      await recordOrderTimestamp(
        input.orderId,
        "rider_assigned",
        ctx.user.id,
        "admin"
      );

      return { taskId, ok: true };
    }),

  confirmPickup: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [task] = await db
        .select()
        .from(deliveryTasks)
        .where(eq(deliveryTasks.id, input.taskId))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, task.storeId);
      if (task.status === "delivered") return { ok: true, idempotent: true };
      await assertRegulatedDeliveryAllowed(task.orderId, ctx);

      await db
        .update(deliveryTasks)
        .set({
          status: "pickup_confirmed",
          pickupConfirmedAt: new Date(),
        })
        .where(eq(deliveryTasks.id, input.taskId));

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "picked_up",
        lat: input.lat ? String(input.lat) : null,
        lng: input.lng ? String(input.lng) : null,
      });

      await recordOrderTimestamp(
        task.orderId,
        "pickup_confirmed",
        task.riderId,
        "rider"
      );
      return { ok: true };
    }),

  outForDelivery: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [task] = await db
        .select()
        .from(deliveryTasks)
        .where(eq(deliveryTasks.id, input.taskId))
        .limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, task.storeId);
      await assertRegulatedDeliveryAllowed(task.orderId, ctx);
      if (task.status === "delivered") return { ok: true, idempotent: true };

      await db
        .update(deliveryTasks)
        .set({
          status: "out_for_delivery",
          outForDeliveryAt: new Date(),
        })
        .where(eq(deliveryTasks.id, input.taskId));

      await db
        .update(orders)
        .set({
          status: "out_for_delivery",
          statusChangedAt: new Date(),
        })
        .where(eq(orders.id, task.orderId));

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "arrived",
        lat: input.lat ? String(input.lat) : null,
        lng: input.lng ? String(input.lng) : null,
      });

      await recordOrderTimestamp(
        task.orderId,
        "out_for_delivery",
        task.riderId,
        "rider"
      );
      return { ok: true };
    }),

  // POD + exception procedures from deliveryTaskPodRouter.ts
  ...taskPodProcedures,

  collectCod: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int(),
        collectedAmount: z.string(),
      })
    )
    .mutation(async ({ ctx: _ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(deliveryTasks)
        .set({
          codCollectedAt: new Date(),
          codCollectedAmount: input.collectedAmount,
        })
        .where(eq(deliveryTasks.id, input.taskId));

      return { ok: true };
    }),

  reconcileCod: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(deliveryTasks)
        .set({
          codReconciled: true,
          codReconciledAt: new Date(),
          codReconciledBy: ctx.user.id,
        })
        .where(eq(deliveryTasks.id, input.taskId));

      return { ok: true };
    }),

  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().int().optional(),
        riderId: z.number().int().optional(),
        status: z
          .enum([
            "assigned",
            "pickup_confirmed",
            "out_for_delivery",
            "delivered",
            "failed_attempt",
            "returned",
            "cancelled",
          ])
          .optional(),
        codPending: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      const storeId = input.storeId ?? getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);
      conditions.push(eq(deliveryTasks.storeId, storeId));
      if (input.riderId)
        conditions.push(eq(deliveryTasks.riderId, input.riderId));
      if (input.status) conditions.push(eq(deliveryTasks.status, input.status));
      if (input.codPending) {
        conditions.push(eq(deliveryTasks.isCod, true));
        conditions.push(eq(deliveryTasks.codReconciled, false));
      }

      return db
        .select()
        .from(deliveryTasks)
        .where(and(...conditions))
        .orderBy(desc(deliveryTasks.assignedAt))
        .limit(input.limit);
    }),

  get: protectedProcedure
    .input(z.object({ taskId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) return null;
      const [task] = await db
        .select()
        .from(deliveryTasks)
        .where(eq(deliveryTasks.id, input.taskId))
        .limit(1);
      return task ?? null;
    }),

  stats: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(7) }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) return null;
      const storeId = getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);
      const since = new Date(Date.now() - input.days * 86400000);

      const [total] = await db
        .select({ count: sql<number>`count(*)` })
        .from(deliveryTasks)
        .where(
          and(
            eq(deliveryTasks.storeId, storeId),
            gte(deliveryTasks.assignedAt, since)
          )
        );
      const [delivered] = await db
        .select({ count: sql<number>`count(*)` })
        .from(deliveryTasks)
        .where(
          and(
            eq(deliveryTasks.storeId, storeId),
            eq(deliveryTasks.status, "delivered"),
            gte(deliveryTasks.assignedAt, since)
          )
        );
      const [failed] = await db
        .select({ count: sql<number>`count(*)` })
        .from(deliveryTasks)
        .where(
          and(
            eq(deliveryTasks.storeId, storeId),
            eq(deliveryTasks.status, "failed_attempt"),
            gte(deliveryTasks.assignedAt, since)
          )
        );
      const [codPending] = await db
        .select({ count: sql<number>`count(*)` })
        .from(deliveryTasks)
        .where(
          and(
            eq(deliveryTasks.storeId, storeId),
            eq(deliveryTasks.isCod, true),
            eq(deliveryTasks.codReconciled, false)
          )
        );

      return {
        total: Number(total?.count ?? 0),
        delivered: Number(delivered?.count ?? 0),
        failed: Number(failed?.count ?? 0),
        codPending: Number(codPending?.count ?? 0),
      };
    }),
});
