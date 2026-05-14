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
 *  task.*                        — see deliveryTaskRouter.ts
 *
 *  sla.list                      — list SLA events
 *  sla.checkBreaches             — system: scan for breached SLAs
 *
 *  timestamps.list               — list order lifecycle timestamps for an order
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import type { ResultSetHeader } from "mysql2";
import {
  riders,
  riderLocations,
  routingDecisions,
  storeCapabilities,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { resolveNode } from "../routingEngine";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { deliveryRouterExtension } from "./deliverySlaRouter";
import { deliveryTaskRouter } from "./deliveryTaskRouter";
import {
  assertRole,
  getStoreId,
  DELIVERY_ROLES,
  MANAGER_ROLES,
} from "./deliveryHelpers";

// ─── Routing sub-router ───────────────────────────────────────────────────────

const routingRouter = router({
  /** Runs the 12-step routing engine to find the best fulfilling store node for a building or pincode. */
  resolveNode: protectedProcedure
    .input(
      z.object({
        buildingId: z.number().int().optional(),
        pincode: z.string().optional(),
        requiredSkuIds: z.array(z.number().int()).optional(),
        requiresColdChain: z.boolean().optional(),
        requiresControlledDrug: z.boolean().optional(),
        orderId: z.number().int().optional(),
        triggeredBy: z
          .enum([
            "checkout",
            "whatsapp",
            "admin_override",
            "reallocation",
            "system",
          ])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await resolveNode({
        ...input,
        triggeredByUserId: ctx.user.id,
      });
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No eligible store found for this order",
        });
      return result;
    }),

  /** Lists routing decisions, optionally filtered by order or building. Manager/admin only. */
  decisions: protectedProcedure
    .input(
      z.object({
        orderId: z.number().int().optional(),
        buildingId: z.number().int().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.orderId)
        conditions.push(eq(routingDecisions.orderId, input.orderId));
      if (input.buildingId)
        conditions.push(eq(routingDecisions.buildingId, input.buildingId));
      return db
        .select()
        .from(routingDecisions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(routingDecisions.createdAt))
        .limit(input.limit);
    }),

  /** Fetches the capability record (licence, cold-chain, controlled-drug flags) for a store. Manager/admin only. */
  getStoreCapabilities: protectedProcedure
    .input(z.object({ storeId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) return null;
      const [cap] = await db
        .select()
        .from(storeCapabilities)
        .where(eq(storeCapabilities.storeId, input.storeId))
        .limit(1);
      return cap ?? null;
    }),

  /** Creates or updates the capability record for a store (licence, pharmacist, cold-chain, rider capacity). Manager/admin only. */
  upsertStoreCapabilities: protectedProcedure
    .input(
      z.object({
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { storeId, licenceExpiryDate, ...rest } = input;
      const values: Record<string, unknown> = { storeId, ...rest };
      if (licenceExpiryDate)
        values.licenceExpiryDate = new Date(licenceExpiryDate);

      const [existing] = await db
        .select({ id: storeCapabilities.id })
        .from(storeCapabilities)
        .where(eq(storeCapabilities.storeId, storeId))
        .limit(1);

      if (existing) {
        await db
          .update(storeCapabilities)
          .set(values)
          .where(eq(storeCapabilities.storeId, storeId));
      } else {
        await db
          .insert(storeCapabilities)
          .values(values as unknown as typeof storeCapabilities.$inferInsert);
      }
      return { ok: true };
    }),
});

// ─── Rider sub-router ─────────────────────────────────────────────────────────

const riderRouter = router({
  /** Lists riders for a store, optionally filtered by availability status or active flag. */
  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().int().optional(),
        status: z.enum(["available", "on_delivery", "offline"]).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) return [];
      const storeId = input.storeId ?? getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);
      const conditions = [eq(riders.storeId, storeId)];
      if (input.status) conditions.push(eq(riders.status, input.status));
      if (input.isActive !== undefined)
        conditions.push(eq(riders.isActive, input.isActive));
      return db
        .select()
        .from(riders)
        .where(and(...conditions))
        .orderBy(riders.name);
    }),

  /** Creates a new rider profile and associates it with the requesting store. Manager/admin only. */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(200),
        phone: z.string().min(10).max(20),
        storeId: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const storeId = input.storeId ?? getStoreId(ctx.user);
      requireStoreAccess(ctx.user, storeId);
      const riderInsert = await db
        .insert(riders)
        .values({ name: input.name, phone: input.phone, storeId });
      const [riderHeader] = riderInsert as unknown as [ResultSetHeader];
      return { id: riderHeader.insertId, ok: true };
    }),

  /** Updates a rider's name, phone, availability status, or active flag. Manager/admin only. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(2).max(200).optional(),
        phone: z.string().min(10).max(20).optional(),
        status: z.enum(["available", "on_delivery", "offline"]).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role, MANAGER_ROLES, "Manager");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...values } = input;
      const [existing] = await db
        .select()
        .from(riders)
        .where(eq(riders.id, id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, existing.storeId);
      await db.update(riders).set(values).where(eq(riders.id, id));
      return { ok: true };
    }),

  /** Records a GPS ping from the rider app, updating current position and appending to location history. */
  locationHeartbeat: protectedProcedure
    .input(
      z.object({
        riderId: z.number().int(),
        lat: z.number(),
        lng: z.number(),
        accuracy: z.number().optional(),
        activeTaskId: z.number().int().optional(),
        source: z.enum(["gps", "manual", "network"]).default("gps"),
      })
    )
    .mutation(async ({ ctx: _ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Update rider current location
      await db
        .update(riders)
        .set({
          currentLat: String(input.lat),
          currentLng: String(input.lng),
          lastLocationAt: new Date(),
        })
        .where(eq(riders.id, input.riderId));
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

  /** Returns the recent GPS ping history for a rider, newest first. Delivery operators and above. */
  locationHistory: protectedProcedure
    .input(
      z.object({
        riderId: z.number().int(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role, DELIVERY_ROLES, "Delivery operator");
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(riderLocations)
        .where(eq(riderLocations.riderId, input.riderId))
        .orderBy(desc(riderLocations.createdAt))
        .limit(input.limit);
    }),
});

// ─── Combined delivery router ─────────────────────────────────────────────────

export const deliveryRouter = router({
  /** Sub-router for store routing engine (resolveNode, routing decisions, store capabilities). */
  routing: routingRouter,
  /** Sub-router for rider management (list, create, update, GPS heartbeat, location history). */
  rider: riderRouter,
  /** Sub-router for delivery task lifecycle (assign, accept, complete, etc.). */
  task: deliveryTaskRouter,
  ...deliveryRouterExtension,
});
