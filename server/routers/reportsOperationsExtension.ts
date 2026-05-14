/**
 * reportsOperationsExtension.ts
 * Operational / shift-level report procedures extracted from reportsRouter.ts.
 * Spread into reportsRouter via `...reportsOperationsExtension`.
 *
 * Procedures: nearExpiry, nonMoving, shiftClosings, submitShiftClosing
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../_core/trpc";
import type { ResultSetHeader } from "mysql2";
import {
  requireStoreAccess,
  requireStaffStore,
  type AccessUser,
} from "../_core/rbac";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

function requireStaff(role: string) {
  const STAFF = [
    "admin",
    "super_admin",
    "store_manager",
    "pharmacist",
    "purchase_manager",
    "accountant",
    "cashier",
    "salesman",
    "inventory_operator",
    "delivery_operator",
    "auditor",
  ];
  if (!STAFF.includes(role)) throw new TRPCError({ code: "FORBIDDEN" });
}

function resolveScopedStoreId(
  user: AccessUser | null | undefined,
  inputStoreId?: number
): number | undefined {
  if (inputStoreId !== undefined) {
    requireStoreAccess(user, inputStoreId);
    return inputStoreId;
  }
  if (user && ["super_admin", "admin", "ops_admin"].includes(user.role ?? ""))
    return undefined;
  return requireStaffStore(user);
}

export const reportsOperationsExtension = {
  // ── Near-Expiry Stock Report ────────────────────────────────────────────────
  nearExpiry: protectedProcedure
    .input(
      z.object({ storeId: z.number().optional(), days: z.number().default(90) })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { batches, products } = await import("../../drizzle/schema");
      const { eq, and, lte, gt, asc } = await import("drizzle-orm");
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.days);
      const conditions = [
        lte(batches.expiryDate, cutoff),
        gt(batches.quantity, 0),
      ];
      if (scopedStoreId !== undefined)
        conditions.push(eq(batches.storeId, scopedStoreId));
      return db
        .select({
          batch: batches,
          productName: products.name,
          category: products.category,
          schedule: products.schedule,
        })
        .from(batches)
        .leftJoin(products, eq(batches.productId, products.id))
        .where(and(...conditions))
        .orderBy(asc(batches.expiryDate));
    }),

  // ── Non-Moving Stock ────────────────────────────────────────────────────────
  nonMoving: protectedProcedure
    .input(
      z.object({ storeId: z.number().optional(), days: z.number().default(90) })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const _scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { storeSkus, products } = await import("../../drizzle/schema");
      const { eq, and, gt, lte } = await import("drizzle-orm");
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.days);
      const conditions = [
        gt(storeSkus.stockQty, 0),
        lte(storeSkus.updatedAt, cutoff),
      ];
      if (input.storeId) conditions.push(eq(storeSkus.storeId, input.storeId));
      return db
        .select({
          sku: storeSkus,
          productName: products.name,
          category: products.category,
        })
        .from(storeSkus)
        .leftJoin(products, eq(storeSkus.productId, products.id))
        .where(and(...conditions))
        .orderBy(storeSkus.updatedAt);
    }),

  // ── Shift Closing Summary ───────────────────────────────────────────────────
  shiftClosings: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        limit: z.number().default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const _scopedStoreId = resolveScopedStoreId(ctx.user, input.storeId);
      const db = await getDbSafe();
      const { shiftClosings } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      return db
        .select()
        .from(shiftClosings)
        .where(
          input.storeId ? eq(shiftClosings.storeId, input.storeId) : undefined
        )
        .orderBy(desc(shiftClosings.shiftDate))
        .limit(input.limit);
    }),

  // ── Submit shift closing ────────────────────────────────────────────────────
  submitShiftClosing: protectedProcedure
    .input(
      z.object({
        storeId: z.number(),
        shiftDate: z.date(),
        openingCash: z.string().default("0"),
        cashSales: z.string().default("0"),
        upiCardSales: z.string().default("0"),
        creditSales: z.string().default("0"),
        refunds: z.string().default("0"),
        expenses: z.string().default("0"),
        cashDeposited: z.string().default("0"),
        actualCash: z.string().default("0"),
        pendingOrders: z.number().default(0),
        cancelledBills: z.number().default(0),
        pharmacistOnDutyId: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !["admin", "super_admin", "store_manager", "cashier"].includes(
          ctx.user.role
        )
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDbSafe();
      const { shiftClosings } = await import("../../drizzle/schema");
      const expectedCash = (
        parseFloat(input.openingCash) +
        parseFloat(input.cashSales) -
        parseFloat(input.refunds) -
        parseFloat(input.expenses)
      ).toFixed(2);
      const variance = (
        parseFloat(input.actualCash) - parseFloat(expectedCash)
      ).toFixed(2);
      const insertResult = await db.insert(shiftClosings).values({
        ...input,
        expectedCash,
        variance,
        cashierId: ctx.user.id,
        status: "submitted",
      });
      const [header] = insertResult as unknown as [ResultSetHeader];
      return { id: header.insertId };
    }),
};
