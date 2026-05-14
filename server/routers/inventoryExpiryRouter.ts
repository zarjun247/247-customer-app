/**
 * inventoryExpiryRouter.ts
 * Expiry-action procedures extracted from inventoryOpsRouter.ts.
 * Exported as `expiryActionsRouter` and consumed by inventoryOpsRouter.ts
 * via the `inventoryRouterExtension.expiryActions` key.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import type { ResultSetHeader } from "mysql2";
import { requireStoreAccess } from "../_core/rbac";
import { requireStoreAccessForEntity } from "../_core/storeAccessHelpers";
import { eq, and, desc, type SQL } from "drizzle-orm";

async function getDb() {
  const { getDb: _getDb } = await import("../db");
  const db = await _getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

async function schema() {
  return import("../../drizzle/schema");
}

function assertInventoryRole(role: string | null | undefined) {
  const allowed = [
    "admin",
    "super_admin",
    "store_manager",
    "inventory_operator",
    "pharmacist",
    "purchase_manager",
  ];
  if (!role || !allowed.includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Inventory operator or manager role required",
    });
  }
}

// ─── Expiry Actions Router ────────────────────────────────────────────────────

export const expiryActionsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        expiryBucket: z
          .enum([
            "normal",
            "warning",
            "critical",
            "quarantine_candidate",
            "expired",
          ])
          .optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDb();
      const { expiryActions, batchLedger, products } = await schema();
      const offset = (input.page - 1) * input.pageSize;
      const conds: SQL[] = [];
      if (input.storeId) conds.push(eq(expiryActions.storeId, input.storeId));
      if (input.expiryBucket)
        conds.push(eq(expiryActions.expiryBucket, input.expiryBucket));
      const rows = await db
        .select({
          action: expiryActions,
          productName: products.name,
          batchNo: batchLedger.batchNo,
        })
        .from(expiryActions)
        .leftJoin(products, eq(expiryActions.productId, products.id))
        .leftJoin(batchLedger, eq(expiryActions.batchId, batchLedger.id))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(expiryActions.actionAt))
        .limit(input.pageSize)
        .offset(offset);
      return { rows };
    }),

  log: protectedProcedure
    .input(
      z.object({
        batchId: z.number(),
        productId: z.number(),
        storeId: z.number(),
        expiryDate: z.string(),
        daysToExpiry: z.number(),
        expiryBucket: z.enum([
          "normal",
          "warning",
          "critical",
          "quarantine_candidate",
          "expired",
        ]),
        actionTaken: z.enum([
          "flagged",
          "price_reduced",
          "quarantined",
          "returned_to_supplier",
          "disposed",
          "sold_before_expiry",
          "no_action",
        ]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      await requireStoreAccessForEntity("batch", input.batchId, ctx);
      const db = await getDb();
      const { expiryActions } = await schema();
      const expiryInsert = await db.insert(expiryActions).values({
        batchId: input.batchId,
        productId: input.productId,
        storeId: input.storeId,
        expiryDate: new Date(input.expiryDate),
        daysToExpiry: input.daysToExpiry,
        expiryBucket: input.expiryBucket,
        actionTaken: input.actionTaken,
        note: input.note,
        actionBy: ctx.user.id,
      });
      const [expiryHeader] = expiryInsert as unknown as [ResultSetHeader];
      return { id: expiryHeader.insertId };
    }),
});
