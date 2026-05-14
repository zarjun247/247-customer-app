/**
 * inventoryBatchRouter.ts — Batch Ledger sub-router
 *
 * Extracted from inventoryRouter.ts to keep files under the 600-line limit.
 * Procedures (all under the `batch.*` namespace in inventoryLedgerRouter):
 *   batch.list
 *   batch.create
 *   batch.update
 *   batch.quarantine
 *   batch.releaseQuarantine
 *   batch.dispose
 *   batch.refreshBuckets
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { logAudit } from "../services/audit";
import {
  quarantineBatch,
  disposeBatch,
  releaseQuarantine,
  createBatchWithOpeningStock,
} from "../services/stockInvariant";
import { eq, and, asc } from "drizzle-orm";
import { requireStoreAccessForEntity } from "../_core/storeAccessHelpers";
import {
  assertInventoryRole,
  assertManagerRole,
  requireStoreScopedFilter,
  computeExpiryBucket,
  getDb,
  schema,
} from "./inventoryHelpers";

// ─── Batch Router ─────────────────────────────────────────────────────────────

export const inventoryBatchRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        productId: z.number().optional(),
        expiryBucket: z
          .enum([
            "normal",
            "warning",
            "critical",
            "quarantine_candidate",
            "expired",
          ])
          .optional(),
        status: z
          .enum([
            "active",
            "quarantined",
            "depleted",
            "expired",
            "recalled",
            "damaged",
            "returned_to_supplier",
          ])
          .optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      const visibleStoreId = requireStoreScopedFilter(ctx.user, input.storeId);
      const db = await getDb();
      const {
        batchLedger,
        stockReservations: _stockReservations,
        products,
        stores,
      } = await schema();
      const offset = (input.page - 1) * input.pageSize;
      const conds: ReturnType<typeof eq>[] = [];
      if (visibleStoreId) conds.push(eq(batchLedger.storeId, visibleStoreId));
      if (input.productId)
        conds.push(eq(batchLedger.productId, input.productId));
      if (input.expiryBucket)
        conds.push(eq(batchLedger.expiryBucket, input.expiryBucket));
      if (input.status) conds.push(eq(batchLedger.status, input.status));

      const rows = await db
        .select({
          batch: batchLedger,
          productName: products.name,
          storeName: stores.name,
        })
        .from(batchLedger)
        .leftJoin(products, eq(batchLedger.productId, products.id))
        .leftJoin(stores, eq(batchLedger.storeId, stores.id))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(asc(batchLedger.expiryDate))
        .limit(input.pageSize)
        .offset(offset);

      const { sql } = await import("drizzle-orm");
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(batchLedger)
        .where(conds.length > 0 ? and(...conds) : undefined);

      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),

  create: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        variantId: z.number().optional(),
        storeId: z.number(),
        supplierId: z.number().optional(),
        batchNo: z.string().min(1),
        mfgDate: z.string().optional(),
        expiryDate: z.string(),
        mrp: z.string(),
        purchaseRate: z.string(),
        saleRate: z.string(),
        schemeDiscount: z.string().optional(),
        cashDiscount: z.string().optional(),
        landingCost: z.string().optional(),
        margin: z.string().optional(),
        qtyOnHand: z.number().min(0),
        internalBarcode: z.string().optional(),
        manufacturerBarcode: z.string().optional(),
        purchaseInvoiceId: z.number().optional(),
        grnId: z.number().optional(),
        storageCondition: z
          .enum(["ambient", "cold_chain", "controlled", "frozen"])
          .default("ambient"),
        coldChainFlag: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      requireStoreAccess(ctx.user, input.storeId);
      const bucket = computeExpiryBucket(input.expiryDate);
      const createResult = await createBatchWithOpeningStock({
        batch: {
          ...input,
          qtyOnHand: 0,
          mfgDate: input.mfgDate ? new Date(input.mfgDate) : undefined,
          expiryDate: new Date(input.expiryDate),
          expiryBucket: bucket,
          status: bucket === "expired" ? "expired" : "active",
          createdBy: ctx.user.id,
        },
        actor: {
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          source: "admin",
        },
      });
      const batchId = createResult.batchId as number;
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "batch_ledger",
          entityId: batchId,
          action: "inventory.create",
          afterJson: { ...input, expiryBucket: bucket },
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { batchId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        mrp: z.string().optional(),
        saleRate: z.string().optional(),
        schemeDiscount: z.string().optional(),
        cashDiscount: z.string().optional(),
        landingCost: z.string().optional(),
        margin: z.string().optional(),
        internalBarcode: z.string().optional(),
        manufacturerBarcode: z.string().optional(),
        storageCondition: z
          .enum(["ambient", "cold_chain", "controlled", "frozen"])
          .optional(),
        coldChainFlag: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      await requireStoreAccessForEntity("batch", input.id, ctx);
      const db = await getDb();
      const { batchLedger } = await schema();
      const [before] = await db
        .select()
        .from(batchLedger)
        .where(eq(batchLedger.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...updates } = input;
      await db.update(batchLedger).set(updates).where(eq(batchLedger.id, id));
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "batch_ledger",
          entityId: id,
          action: "inventory.update",
          beforeJson: before,
          afterJson: updates,
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { ok: true };
    }),

  quarantine: protectedProcedure
    .input(
      z.object({
        batchId: z.number(),
        qty: z.number().min(1),
        reason: z.enum([
          "near_expiry",
          "quality_issue",
          "recall",
          "damage",
          "cold_chain_breach",
          "manual",
        ]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      await requireStoreAccessForEntity("batch", input.batchId, ctx);
      const db = await getDb();
      const { batchLedger, batchQuarantineLogs } = await schema();
      const [batch] = await db
        .select()
        .from(batchLedger)
        .where(eq(batchLedger.id, input.batchId));
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });
      const movement = await quarantineBatch({
        batchId: input.batchId,
        storeId: batch.storeId,
        qtyDelta: input.qty,
        referenceType: "batch_quarantine",
        referenceId: input.batchId,
        reason: `Quarantine: ${input.reason}. ${input.note ?? ""}`.trim(),
        actor: {
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          source: "admin",
        },
        productId: batch.productId,
      });
      const newOnHand = movement.qtyAfter as number;
      const newQuarantined = batch.qtyQuarantined + input.qty;
      await db
        .update(batchLedger)
        .set({
          qtyOnHand: newOnHand,
          qtyQuarantined: newQuarantined,
          status: newOnHand === 0 ? "quarantined" : batch.status,
        })
        .where(eq(batchLedger.id, input.batchId));
      await db.insert(batchQuarantineLogs).values({
        batchId: input.batchId,
        productId: batch.productId,
        storeId: batch.storeId,
        reason: input.reason,
        qtyQuarantined: input.qty,
        initiatedBy: ctx.user.id,
        note: input.note,
      });
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "batch_ledger",
          entityId: input.batchId,
          action: "inventory.quarantine",
          beforeJson: {
            qtyOnHand: batch.qtyOnHand,
            qtyQuarantined: batch.qtyQuarantined,
          },
          afterJson: { qtyOnHand: newOnHand, qtyQuarantined: newQuarantined },
          reason: `Reason: ${input.reason}`,
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { ok: true };
    }),

  releaseQuarantine: protectedProcedure
    .input(
      z.object({
        batchId: z.number(),
        qty: z.number().min(1),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertManagerRole(ctx.user.role);
      await requireStoreAccessForEntity("batch", input.batchId, ctx);
      const db = await getDb();
      const { batchLedger } = await schema();
      const [batch] = await db
        .select()
        .from(batchLedger)
        .where(eq(batchLedger.id, input.batchId));
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });
      const movement = await releaseQuarantine({
        batchId: input.batchId,
        qty: input.qty,
        note: input.note,
        actor: {
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          source: "admin",
        },
      });
      const newOnHand = movement.qtyAfter;
      const newQuarantined = movement.qtyQuarantinedAfter;
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "batch_ledger",
          entityId: input.batchId,
          action: "inventory.release_quarantine",
          beforeJson: {
            qtyOnHand: batch.qtyOnHand,
            qtyQuarantined: batch.qtyQuarantined,
          },
          afterJson: { qtyOnHand: newOnHand, qtyQuarantined: newQuarantined },
          reason: input.note,
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { ok: true };
    }),

  dispose: protectedProcedure
    .input(
      z.object({
        batchId: z.number(),
        qty: z.number().min(1),
        note: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertManagerRole(ctx.user.role);
      await requireStoreAccessForEntity("batch", input.batchId, ctx);
      const db = await getDb();
      const { batchLedger } = await schema();
      const [batch] = await db
        .select()
        .from(batchLedger)
        .where(eq(batchLedger.id, input.batchId));
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });
      const available = batch.qtyOnHand + batch.qtyQuarantined;
      if (available < input.qty)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only ${available} units available`,
        });
      const fromQuarantine = Math.min(batch.qtyQuarantined, input.qty);
      const fromOnHand = input.qty - fromQuarantine;
      if (fromOnHand > 0) {
        await disposeBatch({
          batchId: input.batchId,
          storeId: batch.storeId,
          qtyDelta: fromOnHand,
          referenceType: "batch_disposal",
          referenceId: input.batchId,
          reason: input.note,
          actor: {
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            source: "admin",
          },
          productId: batch.productId,
        });
      }
      const newOnHand = batch.qtyOnHand - fromOnHand;
      const newQuarantined = batch.qtyQuarantined - fromQuarantine;
      const newExpired = batch.qtyExpired + input.qty;
      await db
        .update(batchLedger)
        .set({
          qtyOnHand: newOnHand,
          qtyQuarantined: newQuarantined,
          qtyExpired: newExpired,
          status:
            newOnHand === 0 && newQuarantined === 0 ? "depleted" : batch.status,
        })
        .where(eq(batchLedger.id, input.batchId));
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "batch_ledger",
          entityId: input.batchId,
          action: "inventory.dispose",
          beforeJson: {
            qtyOnHand: batch.qtyOnHand,
            qtyQuarantined: batch.qtyQuarantined,
          },
          afterJson: {
            qtyOnHand: newOnHand,
            qtyQuarantined: newQuarantined,
            qtyExpired: newExpired,
          },
          reason: input.note,
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { ok: true };
    }),

  refreshBuckets: protectedProcedure
    .input(z.object({ storeId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, input.storeId);
      const db = await getDb();
      const { batchLedger } = await schema();
      const conds = input.storeId
        ? [eq(batchLedger.storeId, input.storeId)]
        : [];
      const batches = await db
        .select({
          id: batchLedger.id,
          expiryDate: batchLedger.expiryDate,
          status: batchLedger.status,
        })
        .from(batchLedger)
        .where(conds.length > 0 ? and(...conds) : undefined);
      let updated = 0;
      for (const b of batches) {
        if (b.status === "depleted" || b.status === "recalled") continue;
        const bucket = computeExpiryBucket(b.expiryDate);
        const newStatus =
          bucket === "expired"
            ? "expired"
            : b.status === "expired"
              ? "active"
              : b.status;
        await db
          .update(batchLedger)
          .set({ expiryBucket: bucket, status: newStatus })
          .where(eq(batchLedger.id, b.id));
        updated++;
      }
      return { updated };
    }),
});
