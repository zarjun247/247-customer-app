/**
 * deliveryTaskPodRouter.ts — POD (Proof of Delivery) + exception procedures
 *
 * Extracted from deliveryTaskRouter.ts to keep files under the 600-line limit.
 * These procedures are merged into deliveryTaskRouter as flat keys:
 *   task.deliverWithOtp
 *   task.deliverWithPhoto
 *   task.recordFailed
 *   task.recordReturned
 */

import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  orders,
  riders,
  deliveryTasks,
  deliveryEvents,
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { recordOrderTimestamp } from "../routingEngine";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { assertRegulatedDeliveryAllowed } from "./deliveryHelpers";

// ─── POD + exception procedures (spread into deliveryTaskRouter) ──────────────

export const taskPodProcedures = {
  deliverWithOtp: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int(),
        otp: z.string().length(6),
        lat: z.number().optional(),
        lng: z.number().optional(),
        note: z.string().optional(),
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

      // Verify OTP against delivery_otps table
      const { deliveryOtps } = await import("../../drizzle/schema");
      const [otpRow] = await db
        .select()
        .from(deliveryOtps)
        .where(
          and(
            eq(deliveryOtps.orderId, task.orderId),
            eq(deliveryOtps.isUsed, false)
          )
        )
        .limit(1);

      if (!otpRow)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active OTP found for this order",
        });
      if (otpRow.otp !== input.otp)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid OTP" });
      if (new Date(otpRow.expiresAt) < new Date())
        throw new TRPCError({ code: "BAD_REQUEST", message: "OTP expired" });

      const now = new Date();

      // Mark OTP used
      await db
        .update(deliveryOtps)
        .set({ isUsed: true, usedAt: now })
        .where(eq(deliveryOtps.id, otpRow.id));

      // Mark task delivered
      await db
        .update(deliveryTasks)
        .set({
          status: "delivered",
          deliveredAt: now,
          podType: "otp",
          podOtp: input.otp,
          podOtpVerifiedAt: now,
          podNote: input.note ?? null,
          deliveryLat: input.lat ? String(input.lat) : null,
          deliveryLng: input.lng ? String(input.lng) : null,
        })
        .where(eq(deliveryTasks.id, input.taskId));

      // Mark order delivered
      await db
        .update(orders)
        .set({
          status: "delivered",
          deliveredAt: now,
          statusChangedAt: now,
          statusChangedBy: ctx.user.id,
        })
        .where(eq(orders.id, task.orderId));

      // Mark rider available
      await db
        .update(riders)
        .set({ status: "available" })
        .where(eq(riders.id, task.riderId));

      // Close SLA event
      const { closeSlaEvent } = await import("../payment");
      await closeSlaEvent(task.orderId);

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "otp_verified",
        lat: input.lat ? String(input.lat) : null,
        lng: input.lng ? String(input.lng) : null,
        note: "OTP verified — delivered",
      });

      await recordOrderTimestamp(
        task.orderId,
        "delivered",
        task.riderId,
        "rider"
      );
      return { ok: true };
    }),

  deliverWithPhoto: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int(),
        photoUrl: z.string().url(),
        photoKey: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        note: z.string().optional(),
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

      const now = new Date();

      await db
        .update(deliveryTasks)
        .set({
          status: "delivered",
          deliveredAt: now,
          podType: "photo",
          podPhotoUrl: input.photoUrl,
          podPhotoKey: input.photoKey ?? null,
          podNote: input.note ?? null,
          deliveryLat: input.lat ? String(input.lat) : null,
          deliveryLng: input.lng ? String(input.lng) : null,
        })
        .where(eq(deliveryTasks.id, input.taskId));

      await db
        .update(orders)
        .set({
          status: "delivered",
          deliveredAt: now,
          statusChangedAt: now,
          statusChangedBy: ctx.user.id,
        })
        .where(eq(orders.id, task.orderId));

      await db
        .update(riders)
        .set({ status: "available" })
        .where(eq(riders.id, task.riderId));

      const { closeSlaEvent } = await import("../payment");
      await closeSlaEvent(task.orderId);

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "delivered",
        lat: input.lat ? String(input.lat) : null,
        lng: input.lng ? String(input.lng) : null,
        note: "Photo POD",
      });

      await recordOrderTimestamp(
        task.orderId,
        "delivered",
        task.riderId,
        "rider"
      );
      return { ok: true };
    }),

  recordFailed: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int(),
        failedReason: z.enum([
          "customer_unavailable",
          "wrong_address",
          "customer_refused",
          "payment_issue",
          "damaged_package",
          "other",
        ]),
        failedNote: z.string().min(5).max(500).optional(),
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

      const now = new Date();

      await db
        .update(deliveryTasks)
        .set({
          status: "failed_attempt",
          failedAt: now,
          failedReason: input.failedReason,
          failedNote: input.failedNote ?? null,
          failedLat: input.lat ? String(input.lat) : null,
          failedLng: input.lng ? String(input.lng) : null,
          attemptCount: sql`${deliveryTasks.attemptCount} + 1`,
        })
        .where(eq(deliveryTasks.id, input.taskId));

      await db
        .update(orders)
        .set({
          status: "delivery_exception",
          statusChangedAt: now,
          statusChangedBy: ctx.user.id,
          statusReason: input.failedReason,
        })
        .where(eq(orders.id, task.orderId));

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "failed_attempt",
        lat: input.lat ? String(input.lat) : null,
        lng: input.lng ? String(input.lng) : null,
        note: `${input.failedReason}: ${input.failedNote ?? ""}`,
      });

      await recordOrderTimestamp(
        task.orderId,
        "failed_attempt",
        task.riderId,
        "rider",
        input.failedNote
      );
      return { ok: true };
    }),

  recordReturned: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int(),
        note: z.string().optional(),
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

      const now = new Date();

      await db
        .update(deliveryTasks)
        .set({
          status: "returned",
          returnedAt: now,
        })
        .where(eq(deliveryTasks.id, input.taskId));

      await db
        .update(orders)
        .set({
          status: "returned",
          statusChangedAt: now,
          statusChangedBy: ctx.user.id,
        })
        .where(eq(orders.id, task.orderId));

      await db
        .update(riders)
        .set({ status: "available" })
        .where(eq(riders.id, task.riderId));

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "returned",
        note: input.note ?? "Returned to store",
      });

      await recordOrderTimestamp(
        task.orderId,
        "returned",
        task.riderId,
        "rider",
        input.note
      );
      return { ok: true };
    }),
};
