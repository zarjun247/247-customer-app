/**
 * inventoryRouter.ts — PART 4: Batchwise Inventory + Stock Ledger
 *
 * Uses the same getDb() + dynamic import pattern as all other routers.
 *
 * Sub-routers:
 *   batch.*         — batch_ledger CRUD + quarantine + dispose + FEFO
 *                     (implemented in inventoryBatchRouter.ts)
 *   stock.*         — current stock view + movement ledger + near-expiry + FEFO order
 *   adjustment.*    — stock adjustments (create / approve / reject / list)
 *   transfer.*      — inter-store transfers (initiate / receive / list)
 *   audit.*         — stock audit sessions (create / lines / count / complete)
 *   quarantine.*    — quarantine log listing
 *   expiryActions.* — expiry action log
 */

import { z } from "zod";
import { router, protectedProcedure, capabilityProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { inventoryRouterExtension } from "./inventoryOpsRouter";
import { requireStoreAccess } from "../_core/rbac";
import { logAudit } from "../services/audit";
import { adjustStock } from "../services/stockInvariant";
import { eq, and, lte, gt, sql, desc, asc } from "drizzle-orm";
import { requireStoreAccessForEntity } from "../_core/storeAccessHelpers";
import { emitSloEvent } from "../services/sloService";
import { inventoryBatchRouter } from "./inventoryBatchRouter";
import {
  assertInventoryRole,
  assertManagerRole,
  computeExpiryBucket,
  getDb,
  schema,
} from "./inventoryHelpers";

// ─── Stock Router ─────────────────────────────────────────────────────────────

const stockRouter = router({
  currentStock: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDb();
      const { batchLedger, stockReservations, products, stores } =
        await schema();
      const offset = (input.page - 1) * input.pageSize;
      const conds = [eq(batchLedger.status, "active")];
      if (input.storeId) conds.push(eq(batchLedger.storeId, input.storeId));

      const rows = await db
        .select({
          productId: batchLedger.productId,
          storeId: batchLedger.storeId,
          productName: products.name,
          storeName: stores.name,
          totalOnHand: sql<number>`SUM(${batchLedger.qtyOnHand})`,
          totalReserved: sql<number>`SUM(${batchLedger.qtyReserved}) + COALESCE((SELECT SUM(COALESCE(sr.qty, sr.qtyReserved)) FROM ${stockReservations} sr WHERE sr.productId = ${batchLedger.productId} AND sr.storeId = ${batchLedger.storeId} AND sr.status = 'active' AND (sr.expiresAt IS NULL OR sr.expiresAt > NOW())), 0)`,
          totalQuarantined: sql<number>`SUM(${batchLedger.qtyQuarantined})`,
          availableQty: sql<number>`SUM(${batchLedger.qtyOnHand}) - SUM(${batchLedger.qtyReserved}) - SUM(${batchLedger.qtyQuarantined}) - SUM(${batchLedger.qtyExpired}) - COALESCE((SELECT SUM(COALESCE(sr.qty, sr.qtyReserved)) FROM ${stockReservations} sr WHERE sr.productId = ${batchLedger.productId} AND sr.storeId = ${batchLedger.storeId} AND sr.status = 'active' AND (sr.expiresAt IS NULL OR sr.expiresAt > NOW())), 0)`,
          batchCount: sql<number>`COUNT(*)`,
          earliestExpiry: sql<string>`MIN(${batchLedger.expiryDate})`,
          latestMrp: sql<string>`MAX(${batchLedger.mrp})`,
        })
        .from(batchLedger)
        .leftJoin(products, eq(batchLedger.productId, products.id))
        .leftJoin(stores, eq(batchLedger.storeId, stores.id))
        .where(and(...conds))
        .groupBy(
          batchLedger.productId,
          batchLedger.storeId,
          products.name,
          stores.name
        )
        .orderBy(asc(products.name))
        .limit(input.pageSize)
        .offset(offset);

      return { rows, page: input.page, pageSize: input.pageSize };
    }),

  movements: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        productId: z.number().optional(),
        batchId: z.number().optional(),
        movementType: z.string().optional(),
        fromDate: z.string().optional(),
        toDate: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDb();
      const { stockMovements, batchLedger, products, stores } = await schema();
      const offset = (input.page - 1) * input.pageSize;
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId) conds.push(eq(stockMovements.storeId, input.storeId));
      if (input.batchId) conds.push(eq(stockMovements.batchId, input.batchId));
      if (input.movementType)
        conds.push(
          eq(
            stockMovements.movementType,
            input.movementType as
              | "quarantine"
              | "purchase_inward"
              | "sale_reserve"
              | "sale_fulfil"
              | "cancellation_release"
              | "sale_return"
              | "purchase_return"
              | "stock_adjustment"
              | "stock_transfer"
              | "batch_transfer"
              | "disposal"
              | "audit_correction"
          )
        );
      if (input.productId)
        conds.push(eq(batchLedger.productId, input.productId));

      const rows = await db
        .select({
          movement: stockMovements,
          productName: products.name,
          storeName: stores.name,
          batchNo: batchLedger.batchNo,
        })
        .from(stockMovements)
        .leftJoin(batchLedger, eq(stockMovements.batchId, batchLedger.id))
        .leftJoin(products, eq(batchLedger.productId, products.id))
        .leftJoin(stores, eq(stockMovements.storeId, stores.id))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(stockMovements.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(stockMovements)
        .where(conds.length > 0 ? and(...conds) : undefined);

      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),

  nearExpiry: protectedProcedure
    .input(
      z.object({ storeId: z.number().optional(), days: z.number().default(90) })
    )
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDb();
      const { batchLedger, products, stores } = await schema();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + input.days);
      const conds = [
        lte(batchLedger.expiryDate, cutoff),
        gt(batchLedger.qtyOnHand, 0),
        eq(batchLedger.status, "active"),
      ];
      if (input.storeId) conds.push(eq(batchLedger.storeId, input.storeId));

      const rows = await db
        .select({
          batch: batchLedger,
          productName: products.name,
          storeName: stores.name,
        })
        .from(batchLedger)
        .leftJoin(products, eq(batchLedger.productId, products.id))
        .leftJoin(stores, eq(batchLedger.storeId, stores.id))
        .where(and(...conds))
        .orderBy(asc(batchLedger.expiryDate));

      const buckets: Record<string, typeof rows> = {
        expired: [],
        quarantine_candidate: [],
        critical: [],
        warning: [],
        normal: [],
      };
      for (const row of rows) {
        const bucket = computeExpiryBucket(row.batch.expiryDate);
        buckets[bucket].push(row);
      }
      return { rows, buckets, total: rows.length };
    }),

  fefoOrder: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        storeId: z.number(),
        qtyNeeded: z.number().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDb();
      const { batchLedger } = await schema();
      const batches = await db
        .select()
        .from(batchLedger)
        .where(
          and(
            eq(batchLedger.productId, input.productId),
            eq(batchLedger.storeId, input.storeId),
            eq(batchLedger.status, "active"),
            gt(batchLedger.qtyOnHand, 0)
          )
        )
        .orderBy(asc(batchLedger.expiryDate));

      let remaining = input.qtyNeeded;
      const allocation: Array<{
        batchId: number;
        batchNo: string;
        expiryDate: string;
        allocatedQty: number;
        mrp: string;
        saleRate: string;
        expiryBucket: string;
      }> = [];
      for (const b of batches) {
        if (remaining <= 0) break;
        if (computeExpiryBucket(b.expiryDate) === "expired") continue;
        const take = Math.min(b.qtyOnHand - b.qtyReserved, remaining);
        if (take <= 0) continue;
        allocation.push({
          batchId: b.id,
          batchNo: b.batchNo,
          expiryDate: String(b.expiryDate),
          allocatedQty: take,
          mrp: String(b.mrp),
          saleRate: String(b.saleRate),
          expiryBucket: computeExpiryBucket(b.expiryDate),
        });
        remaining -= take;
      }
      return { allocation, fulfilled: remaining === 0, shortfall: remaining };
    }),
});

// ─── Adjustment Router ────────────────────────────────────────────────────────

const adjustmentRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        status: z.enum(["pending_approval", "approved", "rejected"]).optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDb();
      const { stockAdjustments, batchLedger } = await schema();
      const offset = (input.page - 1) * input.pageSize;
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId)
        conds.push(eq(stockAdjustments.storeId, input.storeId));
      if (input.status) conds.push(eq(stockAdjustments.status, input.status));

      const rows = await db
        .select({ adj: stockAdjustments, batchNo: batchLedger.batchNo })
        .from(stockAdjustments)
        .leftJoin(batchLedger, eq(stockAdjustments.batchId, batchLedger.id))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(stockAdjustments.createdAt))
        .limit(input.pageSize)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(stockAdjustments)
        .where(conds.length > 0 ? and(...conds) : undefined);

      return { rows, total };
    }),

  create: protectedProcedure
    .input(
      z.object({
        storeId: z.number(),
        batchId: z.number(),
        adjustmentType: z.enum(["increase", "decrease"]),
        qty: z.number().min(1),
        reason: z.string().min(1),
        supportingNote: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      await requireStoreAccessForEntity("batch", input.batchId, ctx);
      const db = await getDb();
      const { stockAdjustments, batchLedger } = await schema();
      const [batch] = await db
        .select()
        .from(batchLedger)
        .where(eq(batchLedger.id, input.batchId));
      if (!batch)
        throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      if (input.adjustmentType === "decrease" && batch.qtyOnHand < input.qty) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only ${batch.qtyOnHand} units available`,
        });
      }
      const [result] = await db.insert(stockAdjustments).values({
        storeId: input.storeId,
        batchId: input.batchId,
        adjustmentType: input.adjustmentType,
        qty: input.qty,
        reason: input.reason,
        supportingNote: input.supportingNote,
        status: "pending_approval",
        requestedBy: ctx.user.id,
      });
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "stock_adjustment",
          entityId: result.insertId,
          action: "inventory.create",
          afterJson: input,
          reason: `Pending approval. Qty: ${input.adjustmentType} ${input.qty}`,
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { adjustmentId: result.insertId };
    }),

  approve: capabilityProcedure("inventory.adjust")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const started = Date.now();
      let withinBudget = false;
      try {
        assertManagerRole(ctx.user.role);
        const db = await getDb();
        const { stockAdjustments, batchLedger } = await schema();
        const [adj] = await db
          .select()
          .from(stockAdjustments)
          .where(eq(stockAdjustments.id, input.id));
        if (!adj) throw new TRPCError({ code: "NOT_FOUND" });
        await requireStoreAccessForEntity("batch", adj.batchId, ctx);
        if (adj.status !== "pending_approval")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Adjustment is not pending",
          });
        const [batch] = await db
          .select()
          .from(batchLedger)
          .where(eq(batchLedger.id, adj.batchId));
        if (!batch)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Batch not found",
          });
        const qtyChange =
          adj.adjustmentType === "increase" ? adj.qty : -adj.qty;
        const movement = await adjustStock({
          batchId: adj.batchId,
          storeId: adj.storeId,
          qtyDelta: qtyChange,
          adjustmentType: adj.adjustmentType,
          referenceType: "stock_adjustment",
          referenceId: input.id,
          reason: adj.reason,
          actor: {
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            source: "admin",
          },
          productId: batch.productId,
        });
        await db
          .update(stockAdjustments)
          .set({
            status: "approved",
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          })
          .where(eq(stockAdjustments.id, input.id));
        try {
          await logAudit({
            actorId: ctx.user.id,
            entityType: "stock_adjustment",
            entityId: input.id,
            action: "inventory.approve",
            reason: `Qty changed from ${movement.qtyBefore} to ${movement.qtyAfter}`,
            source: "admin",
          });
        } catch {
          /* non-critical */
        }
        withinBudget = Date.now() - started <= 200;
        return { ok: true };
      } finally {
        void emitSloEvent({
          sloName: "inventory.adjust.latency",
          target: 0.95,
          measuredValue: Date.now() - started,
          withinBudget,
          sampleCount: 1,
          windowSeconds: 60,
        });
      }
    }),

  reject: capabilityProcedure("inventory.adjust")
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertManagerRole(ctx.user.role);
      const db = await getDb();
      const { stockAdjustments } = await schema();
      const [adj] = await db
        .select()
        .from(stockAdjustments)
        .where(eq(stockAdjustments.id, input.id));
      if (!adj) throw new TRPCError({ code: "NOT_FOUND" });
      await requireStoreAccessForEntity("batch", adj.batchId, ctx);
      if (adj.status !== "pending_approval")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Adjustment is not pending",
        });
      await db
        .update(stockAdjustments)
        .set({
          status: "rejected",
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
        })
        .where(eq(stockAdjustments.id, input.id));
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "stock_adjustment",
          entityId: input.id,
          action: "inventory.reject",
          reason: input.reason ?? "Rejected by manager",
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { ok: true };
    }),
});

// ─── transfer, audit, quarantine, expiryActions: see inventoryOpsRouter.ts ───────────────────

// ─── Combined Inventory Router ────────────────────────────────────────────────

export const inventoryLedgerRouter = router({
  batch: inventoryBatchRouter,
  stock: stockRouter,
  adjustment: adjustmentRouter,
  ...inventoryRouterExtension,
});
