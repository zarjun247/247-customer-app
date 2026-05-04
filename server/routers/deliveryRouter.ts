/**
 * PART 11 — Delivery & Rider Router
 *
 * Procedures:
 *  delivery.resolveNode          — run 12-step routing for a building/pincode
 *  delivery.routingDecisions     — admin: list routing decisions
 *  delivery.storeCapabilities    — admin: get/upsert store capability record
 *
 *  rider.list                    — list riders for store
 *  rider.create                  — add new rider
 *  rider.update                  — update rider profile/status
 *  rider.locationHeartbeat       — rider app: push GPS ping
 *  rider.manualLocation          — admin: set rider location manually
 *
 *  task.assign                   — assign rider to order → creates delivery_task
 *  task.confirmPickup            — rider confirms pickup from store
 *  task.outForDelivery           — rider marks out for delivery
 *  task.deliverWithOtp           — verify OTP → mark delivered
 *  task.deliverWithPhoto         — photo POD → mark delivered
 *  task.recordFailed             — record failed attempt with reason
 *  task.recordReturned           — mark parcel returned to store
 *  task.collectCod               — record COD cash collected
 *  task.reconcileCod             — admin: mark COD reconciled
 *  task.list                     — list tasks (by store/rider/status)
 *  task.get                      — get single task with full detail
 *
 *  sla.list                      — list SLA events
 *  sla.checkBreaches             — system: scan for breached SLAs
 *
 *  timestamps.list               — list order lifecycle timestamps for an order
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  orders,
  riders,
  deliveryTasks,
  riderLocations,
  routingDecisions,
  slaEvents,
  orderTimestamps,
  storeCapabilities,
  deliveryEvents,
} from "../../drizzle/schema";
import { eq, and, desc, gte, lte, sql, inArray, isNull } from "drizzle-orm";
import { resolveNode, recordOrderTimestamp } from "../routingEngine";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess, requireStaffStore } from "../_core/rbac";
import { logAudit } from "../services/audit";

// ─── Role helpers ─────────────────────────────────────────────────────────────
const DELIVERY_ROLES = ["delivery_operator", "store_manager", "admin"] as const;
const MANAGER_ROLES = ["store_manager", "admin"] as const;

function assertRole(role: string, allowed: readonly string[], label: string) {
  if (!allowed.includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: `${label} access required` });
}

function getStoreId(user: any): number {
  return requireStaffStore(user as any);
}

async function assertRegulatedDeliveryAllowed(orderId: number, ctx: any) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const { orderItems, products, prescriptions } = await import("../../drizzle/schema");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND" });
  const lines = await db.select({ schedule: products.schedule, requiresPrescription: products.requiresPrescription, })
    .from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(eq(orderItems.orderId, orderId));
  const regulated = lines.some((l) => ["H","H1","X"].includes(String(l.schedule ?? "")) || Boolean(l.requiresPrescription));
  if (!regulated) return;
  const [rx] = order.prescriptionId ? await db.select({ status: prescriptions.status }).from(prescriptions).where(eq(prescriptions.id, order.prescriptionId)).limit(1) : [null];
  const rxOk = !!rx && ["approved", "on_file"].includes(String(rx.status));
  if (!rxOk || !["picking", "packed", "out_for_delivery"].includes(String(order.status))) {
    await logAudit({ action: "delivery.regulated_release_blocked", entityType: "order", entityId: orderId, afterJson: { rxOk, status: order.status } }, ctx);
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Regulated delivery requires approved prescription and pharmacist clearance" });
  }
  await logAudit({ action: "delivery.regulated_release_allowed", entityType: "order", entityId: orderId, afterJson: { rxOk, status: order.status } }, ctx);
}

// ─── Routing sub-router ───────────────────────────────────────────────────────

const routingRouter = router({
  resolveNode: protectedProcedure
    .input(z.object({
      buildingId: z.number().int().optional(),
      pincode: z.string().optional(),
      requiredSkuIds: z.array(z.number().int()).optional(),
      requiresColdChain: z.boolean().optional(),
      requiresControlledDrug: z.boolean().optional(),
      orderId: z.number().int().optional(),
      triggeredBy: z.enum(["checkout", "whatsapp", "admin_override", "reallocation", "system"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await resolveNode({
        ...input,
        triggeredByUserId: ctx.user.id,
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible store found for this order" });
      return result;
    }),

  decisions: protectedProcedure
    .input(z.object({
      orderId: z.number().int().optional(),
      buildingId: z.number().int().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.orderId) conditions.push(eq(routingDecisions.orderId, input.orderId));
      if (input.buildingId) conditions.push(eq(routingDecisions.buildingId, input.buildingId));
      return db.select().from(routingDecisions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(routingDecisions.createdAt))
        .limit(input.limit);
    }),

  getStoreCapabilities: protectedProcedure
    .input(z.object({ storeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) return null;
      const [cap] = await db.select().from(storeCapabilities).where(eq(storeCapabilities.storeId, input.storeId)).limit(1);
      return cap ?? null;
    }),

  upsertStoreCapabilities: protectedProcedure
    .input(z.object({
      storeId: z.number().int(),
      licenceNumber: z.string().optional(),
      licenceExpiryDate: z.string().optional(),
      licenceActive: z.boolean().optional(),
      serviceActive: z.boolean().optional(),
      serviceInactiveReason: z.string().optional(),
      pharmacistCoverage: z.boolean().optional(),
      pharmacistName: z.string().optional(),
      pharmacistRegNumber: z.string().optional(),
      coldChainCapable: z.boolean().optional(),
      controlledDrugCapable: z.boolean().optional(),
      maxRiderCapacity: z.number().int().min(1).max(50).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { storeId, licenceExpiryDate, ...rest } = input;
      const values: any = { storeId, ...rest };
      if (licenceExpiryDate) values.licenceExpiryDate = new Date(licenceExpiryDate);

      const [existing] = await db.select({ id: storeCapabilities.id }).from(storeCapabilities)
        .where(eq(storeCapabilities.storeId, storeId)).limit(1);

      if (existing) {
        await db.update(storeCapabilities).set(values).where(eq(storeCapabilities.storeId, storeId));
      } else {
        await db.insert(storeCapabilities).values(values);
      }
      return { ok: true };
    }),
});

// ─── Rider sub-router ─────────────────────────────────────────────────────────

const riderRouter = router({
  list: protectedProcedure
    .input(z.object({
      storeId: z.number().int().optional(),
      status: z.enum(["available", "on_delivery", "offline"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) return [];
      const storeId = input.storeId ?? getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);
      const conditions = [eq(riders.storeId, storeId)];
      if (input.status) conditions.push(eq(riders.status, input.status));
      if (input.isActive !== undefined) conditions.push(eq(riders.isActive, input.isActive));
      return db.select().from(riders).where(and(...conditions)).orderBy(riders.name);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(200),
      phone: z.string().min(10).max(20),
      storeId: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const storeId = input.storeId ?? getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);
      const r = await db.insert(riders).values({ name: input.name, phone: input.phone, storeId });
      return { id: (r as any).insertId, ok: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(2).max(200).optional(),
      phone: z.string().min(10).max(20).optional(),
      status: z.enum(["available", "on_delivery", "offline"]).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...values } = input;
      const [existing] = await db.select().from(riders).where(eq(riders.id, id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, existing.storeId);
      await db.update(riders).set(values).where(eq(riders.id, id));
      return { ok: true };
    }),

  locationHeartbeat: protectedProcedure
    .input(z.object({
      riderId: z.number().int(),
      lat: z.number(),
      lng: z.number(),
      accuracy: z.number().optional(),
      activeTaskId: z.number().int().optional(),
      source: z.enum(["gps", "manual", "network"]).default("gps"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Update rider current location
      await db.update(riders).set({
        currentLat: String(input.lat),
        currentLng: String(input.lng),
        lastLocationAt: new Date(),
      }).where(eq(riders.id, input.riderId));
      // Log to rider_locations history
      await db.insert(riderLocations).values({
        riderId: input.riderId,
        lat: String(input.lat),
        lng: String(input.lng),
        accuracy: input.accuracy ? String(input.accuracy) : null,
        source: input.source,
        activeTaskId: input.activeTaskId ?? null,
      });
      return { ok: true };
    }),

  locationHistory: protectedProcedure
    .input(z.object({
      riderId: z.number().int(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) return [];
      return db.select().from(riderLocations)
        .where(eq(riderLocations.riderId, input.riderId))
        .orderBy(desc(riderLocations.createdAt))
        .limit(input.limit);
    }),
});

// ─── Task sub-router ──────────────────────────────────────────────────────────

const taskRouter = router({
  assign: protectedProcedure
    .input(z.object({
      orderId: z.number().int(),
      riderId: z.number().int(),
      isCod: z.boolean().default(false),
      codAmount: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const storeId = getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);

      // Create delivery task
      const r = await db.insert(deliveryTasks).values({
        orderId: input.orderId,
        riderId: input.riderId,
        storeId,
        status: "assigned",
        isCod: input.isCod,
        codAmount: input.codAmount ?? null,
      });
      const taskId = (r as any).insertId as number;

      // Update order status + riderId
      await db.update(orders).set({
        status: "assigned_to_rider",
        riderId: input.riderId,
        statusChangedBy: ctx.user.id,
        statusChangedAt: new Date(),
      }).where(eq(orders.id, input.orderId));

      // Update rider status
      await db.update(riders).set({ status: "on_delivery" }).where(eq(riders.id, input.riderId));

      // Record delivery event
      await db.insert(deliveryEvents).values({
        orderId: input.orderId,
        riderId: input.riderId,
        eventType: "assigned",
        note: `Assigned by ${ctx.user.id}`,
      });

      // Record order timestamp
      await recordOrderTimestamp(input.orderId, "rider_assigned", ctx.user.id, "admin");

      return { taskId, ok: true };
    }),

  confirmPickup: protectedProcedure
    .input(z.object({
      taskId: z.number().int(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [task] = await db.select().from(deliveryTasks).where(eq(deliveryTasks.id, input.taskId)).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, task.storeId);
      if (task.status === "delivered") return { ok: true, idempotent: true };
      await assertRegulatedDeliveryAllowed(task.orderId, ctx);

      await db.update(deliveryTasks).set({
        status: "pickup_confirmed",
        pickupConfirmedAt: new Date(),
      }).where(eq(deliveryTasks.id, input.taskId));

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "picked_up",
        lat: input.lat ? String(input.lat) : null,
        lng: input.lng ? String(input.lng) : null,
      });

      await recordOrderTimestamp(task.orderId, "pickup_confirmed", task.riderId, "rider");
      return { ok: true };
    }),

  outForDelivery: protectedProcedure
    .input(z.object({
      taskId: z.number().int(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [task] = await db.select().from(deliveryTasks).where(eq(deliveryTasks.id, input.taskId)).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, task.storeId);
      await assertRegulatedDeliveryAllowed(task.orderId, ctx);
      if (task.status === "delivered") return { ok: true, idempotent: true };

      await db.update(deliveryTasks).set({
        status: "out_for_delivery",
        outForDeliveryAt: new Date(),
      }).where(eq(deliveryTasks.id, input.taskId));

      await db.update(orders).set({
        status: "out_for_delivery",
        statusChangedAt: new Date(),
      }).where(eq(orders.id, task.orderId));

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "arrived",
        lat: input.lat ? String(input.lat) : null,
        lng: input.lng ? String(input.lng) : null,
      });

      await recordOrderTimestamp(task.orderId, "out_for_delivery", task.riderId, "rider");
      return { ok: true };
    }),

  deliverWithOtp: protectedProcedure
    .input(z.object({
      taskId: z.number().int(),
      otp: z.string().length(6),
      lat: z.number().optional(),
      lng: z.number().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [task] = await db.select().from(deliveryTasks).where(eq(deliveryTasks.id, input.taskId)).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, task.storeId);
      await assertRegulatedDeliveryAllowed(task.orderId, ctx);

      // Verify OTP against delivery_otps table
      const { deliveryOtps } = await import("../../drizzle/schema");
      const [otpRow] = await db.select().from(deliveryOtps)
        .where(and(eq(deliveryOtps.orderId, task.orderId), eq(deliveryOtps.isUsed, false)))
        .limit(1);

      if (!otpRow) throw new TRPCError({ code: "BAD_REQUEST", message: "No active OTP found for this order" });
      if (otpRow.otp !== input.otp) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid OTP" });
      if (new Date(otpRow.expiresAt) < new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "OTP expired" });

      const now = new Date();

      // Mark OTP used
      await db.update(deliveryOtps).set({ isUsed: true, usedAt: now }).where(eq(deliveryOtps.id, otpRow.id));

      // Mark task delivered
      await db.update(deliveryTasks).set({
        status: "delivered",
        deliveredAt: now,
        podType: "otp",
        podOtp: input.otp,
        podOtpVerifiedAt: now,
        podNote: input.note ?? null,
        deliveryLat: input.lat ? String(input.lat) : null,
        deliveryLng: input.lng ? String(input.lng) : null,
      }).where(eq(deliveryTasks.id, input.taskId));

      // Mark order delivered
      await db.update(orders).set({
        status: "delivered",
        deliveredAt: now,
        statusChangedAt: now,
        statusChangedBy: ctx.user.id,
      }).where(eq(orders.id, task.orderId));

      // Mark rider available
      await db.update(riders).set({ status: "available" }).where(eq(riders.id, task.riderId));

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

      await recordOrderTimestamp(task.orderId, "delivered", task.riderId, "rider");
      return { ok: true };
    }),

  deliverWithPhoto: protectedProcedure
    .input(z.object({
      taskId: z.number().int(),
      photoUrl: z.string().url(),
      photoKey: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [task] = await db.select().from(deliveryTasks).where(eq(deliveryTasks.id, input.taskId)).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, task.storeId);

      const now = new Date();

      await db.update(deliveryTasks).set({
        status: "delivered",
        deliveredAt: now,
        podType: "photo",
        podPhotoUrl: input.photoUrl,
        podPhotoKey: input.photoKey ?? null,
        podNote: input.note ?? null,
        deliveryLat: input.lat ? String(input.lat) : null,
        deliveryLng: input.lng ? String(input.lng) : null,
      }).where(eq(deliveryTasks.id, input.taskId));

      await db.update(orders).set({
        status: "delivered",
        deliveredAt: now,
        statusChangedAt: now,
        statusChangedBy: ctx.user.id,
      }).where(eq(orders.id, task.orderId));

      await db.update(riders).set({ status: "available" }).where(eq(riders.id, task.riderId));

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

      await recordOrderTimestamp(task.orderId, "delivered", task.riderId, "rider");
      return { ok: true };
    }),

  recordFailed: protectedProcedure
    .input(z.object({
      taskId: z.number().int(),
      failedReason: z.enum(["customer_unavailable", "wrong_address", "customer_refused", "payment_issue", "damaged_package", "other"]),
      failedNote: z.string().min(5).max(500).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [task] = await db.select().from(deliveryTasks).where(eq(deliveryTasks.id, input.taskId)).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, task.storeId);

      const now = new Date();

      await db.update(deliveryTasks).set({
        status: "failed_attempt",
        failedAt: now,
        failedReason: input.failedReason,
        failedNote: input.failedNote ?? null,
        failedLat: input.lat ? String(input.lat) : null,
        failedLng: input.lng ? String(input.lng) : null,
        attemptCount: sql`${deliveryTasks.attemptCount} + 1`,
      }).where(eq(deliveryTasks.id, input.taskId));

      await db.update(orders).set({
        status: "delivery_exception",
        statusChangedAt: now,
        statusChangedBy: ctx.user.id,
        statusReason: input.failedReason,
      }).where(eq(orders.id, task.orderId));

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "failed_attempt",
        lat: input.lat ? String(input.lat) : null,
        lng: input.lng ? String(input.lng) : null,
        note: `${input.failedReason}: ${input.failedNote ?? ""}`,
      });

      await recordOrderTimestamp(task.orderId, "failed_attempt", task.riderId, "rider", input.failedNote);
      return { ok: true };
    }),

  recordReturned: protectedProcedure
    .input(z.object({
      taskId: z.number().int(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [task] = await db.select().from(deliveryTasks).where(eq(deliveryTasks.id, input.taskId)).limit(1);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, task.storeId);

      const now = new Date();

      await db.update(deliveryTasks).set({
        status: "returned",
        returnedAt: now,
      }).where(eq(deliveryTasks.id, input.taskId));

      await db.update(orders).set({
        status: "returned",
        statusChangedAt: now,
        statusChangedBy: ctx.user.id,
      }).where(eq(orders.id, task.orderId));

      await db.update(riders).set({ status: "available" }).where(eq(riders.id, task.riderId));

      await db.insert(deliveryEvents).values({
        orderId: task.orderId,
        riderId: task.riderId,
        eventType: "returned",
        note: input.note ?? "Returned to store",
      });

      await recordOrderTimestamp(task.orderId, "returned", task.riderId, "rider", input.note);
      return { ok: true };
    }),

  collectCod: protectedProcedure
    .input(z.object({
      taskId: z.number().int(),
      collectedAmount: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(deliveryTasks).set({
        codCollectedAt: new Date(),
        codCollectedAmount: input.collectedAmount,
      }).where(eq(deliveryTasks.id, input.taskId));

      return { ok: true };
    }),

  reconcileCod: protectedProcedure
    .input(z.object({
      taskId: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(deliveryTasks).set({
        codReconciled: true,
        codReconciledAt: new Date(),
        codReconciledBy: ctx.user.id,
      }).where(eq(deliveryTasks.id, input.taskId));

      return { ok: true };
    }),

  list: protectedProcedure
    .input(z.object({
      storeId: z.number().int().optional(),
      riderId: z.number().int().optional(),
      status: z.enum(["assigned", "pickup_confirmed", "out_for_delivery", "delivered", "failed_attempt", "returned", "cancelled"]).optional(),
      codPending: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      const storeId = input.storeId ?? getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);
      conditions.push(eq(deliveryTasks.storeId, storeId));
      if (input.riderId) conditions.push(eq(deliveryTasks.riderId, input.riderId));
      if (input.status) conditions.push(eq(deliveryTasks.status, input.status));
      if (input.codPending) {
        conditions.push(eq(deliveryTasks.isCod, true));
        conditions.push(eq(deliveryTasks.codReconciled, false));
      }

      return db.select().from(deliveryTasks)
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
      const [task] = await db.select().from(deliveryTasks).where(eq(deliveryTasks.id, input.taskId)).limit(1);
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

      const [total] = await db.select({ count: sql<number>`count(*)` })
        .from(deliveryTasks).where(and(eq(deliveryTasks.storeId, storeId), gte(deliveryTasks.assignedAt, since)));
      const [delivered] = await db.select({ count: sql<number>`count(*)` })
        .from(deliveryTasks).where(and(eq(deliveryTasks.storeId, storeId), eq(deliveryTasks.status, "delivered"), gte(deliveryTasks.assignedAt, since)));
      const [failed] = await db.select({ count: sql<number>`count(*)` })
        .from(deliveryTasks).where(and(eq(deliveryTasks.storeId, storeId), eq(deliveryTasks.status, "failed_attempt"), gte(deliveryTasks.assignedAt, since)));
      const [codPending] = await db.select({ count: sql<number>`count(*)` })
        .from(deliveryTasks).where(and(eq(deliveryTasks.storeId, storeId), eq(deliveryTasks.isCod, true), eq(deliveryTasks.codReconciled, false)));

      return {
        total: Number(total?.count ?? 0),
        delivered: Number(delivered?.count ?? 0),
        failed: Number(failed?.count ?? 0),
        codPending: Number(codPending?.count ?? 0),
      };
    }),
});

// ─── SLA sub-router ───────────────────────────────────────────────────────────

const slaRouter = router({
  list: protectedProcedure
    .input(z.object({
      storeId: z.number().int().optional(),
      breached: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) return [];
      const storeId = input.storeId ?? getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);
      const conditions = [eq(slaEvents.storeId, storeId)];
      if (input.breached !== undefined) conditions.push(eq(slaEvents.breached, input.breached));
      return db.select().from(slaEvents)
        .where(and(...conditions))
        .orderBy(desc(slaEvents.createdAt))
        .limit(input.limit);
    }),

  checkBreaches: protectedProcedure
    .mutation(async ({ ctx }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) return { breachesFound: 0 };
      const now = new Date();

      // Find undelivered SLA events past deadline
      const overdue = await db.select().from(slaEvents)
        .where(and(
          isNull(slaEvents.deliveredAt),
          eq(slaEvents.breached, false),
          lte(slaEvents.slaDeadline, now),
        ));

      for (const event of overdue) {
        await db.update(slaEvents).set({
          breached: true,
          breachDetectedAt: now,
        }).where(eq(slaEvents.id, event.id));

        // Record breach timestamp on order
        await recordOrderTimestamp(
          event.orderId,
          "sla_breached",
          null,
          "system",
          undefined,
          "SLA deadline exceeded",
          Math.round((now.getTime() - new Date(event.slaDeadline).getTime()) / 60000),
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
      return db.select().from(orderTimestamps)
        .where(eq(orderTimestamps.orderId, input.orderId))
        .orderBy(orderTimestamps.occurredAt);
    }),
});

// ─── Combined delivery router ─────────────────────────────────────────────────

export const deliveryRouter = router({
  routing: routingRouter,
  rider: riderRouter,
  task: taskRouter,
  sla: slaRouter,
  timestamps: timestampsRouter,
});
