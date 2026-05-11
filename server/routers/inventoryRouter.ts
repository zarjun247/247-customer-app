/**
 * inventoryRouter.ts — PART 4: Batchwise Inventory + Stock Ledger
 *
 * Uses the same getDb() + dynamic import pattern as all other routers.
 *
 * Sub-routers:
 *   batch.*         — batch_ledger CRUD + quarantine + dispose + FEFO
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
import { inventoryRouterExtension } from "./inventoryRouterExtension";
import {
  isAdmin,
  isSuperAdmin,
  requireStaffStore,
  requireStoreAccess,
} from "../_core/rbac";
import { logAudit } from "../services/audit";
import {
  adjustStock,
  quarantineBatch,
  disposeBatch,
  releaseQuarantine,
  createBatchWithOpeningStock,
} from "../services/stockInvariant";
import { eq, and, or, lte, gt, sql, desc, asc } from "drizzle-orm";

// ─── DB helper ────────────────────────────────────────────────────────────────

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

// ─── Schema helper ────────────────────────────────────────────────────────────

async function schema() {
  return import("../../drizzle/schema");
}

// ─── Role guards ──────────────────────────────────────────────────────────────

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

function assertManagerRole(role: string | null | undefined) {
  const allowed = ["admin", "super_admin", "store_manager", "purchase_manager"];
  if (!role || !allowed.includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Store manager or admin role required",
    });
  }
}

function requireStoreScopedFilter(
  user: any,
  requestedStoreId?: number
): number | undefined {
  if (requestedStoreId !== undefined) {
    requireStoreAccess(user, requestedStoreId, { allowAdminCrossStore: true });
    return requestedStoreId;
  }
  if (isSuperAdmin(user) || isAdmin(user)) return undefined;
  return requireStaffStore(user);
}

function requireTransferEndpointAccess(
  user: any,
  transfer: { fromStoreId: number; toStoreId: number },
  endpoint: "initiate" | "receive" | "read"
): void {
  if (isSuperAdmin(user) || isAdmin(user)) return;
  const staffStoreId = requireStaffStore(user);
  if (endpoint === "initiate" && staffStoreId === transfer.fromStoreId) return;
  if (endpoint === "receive" && staffStoreId === transfer.toStoreId) return;
  if (
    endpoint === "read" &&
    (staffStoreId === transfer.fromStoreId ||
      staffStoreId === transfer.toStoreId)
  )
    return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Store-scope transfer access denied",
  });
}

// ─── Expiry bucket ────────────────────────────────────────────────────────────

function computeExpiryBucket(
  expiryDate: string | Date
): "normal" | "warning" | "critical" | "quarantine_candidate" | "expired" {
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((expiry.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return "expired";
  if (days <= 30) return "quarantine_candidate";
  if (days <= 60) return "critical";
  if (days <= 90) return "warning";
  return "normal";
}

// ─── Batch Router ─────────────────────────────────────────────────────────────

const batchRouter = router({
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
      const { batchLedger, stockReservations, products, stores } =
        await schema();
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDb();
      const { batchLedger } = await schema();
      const bucket = computeExpiryBucket(input.expiryDate);
      const { batchId } = await createBatchWithOpeningStock({
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
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
      const newOnHand = movement.qtyAfter;
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
      const db = await getDb();
      const { stockMovements, batchLedger, products, stores } = await schema();
      const offset = (input.page - 1) * input.pageSize;
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId) conds.push(eq(stockMovements.storeId, input.storeId));
      if (input.batchId) conds.push(eq(stockMovements.batchId, input.batchId));
      if (input.movementType)
        conds.push(eq(stockMovements.movementType, input.movementType as any));
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
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
      if ((input as any).storeId !== undefined)
        requireStoreAccess(ctx.user, Number((input as any).storeId));
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
      assertManagerRole(ctx.user.role);
      const db = await getDb();
      const { stockAdjustments, batchLedger } = await schema();
      const [adj] = await db
        .select()
        .from(stockAdjustments)
        .where(eq(stockAdjustments.id, input.id));
      if (!adj) throw new TRPCError({ code: "NOT_FOUND" });
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      const qtyChange = adj.adjustmentType === "increase" ? adj.qty : -adj.qty;
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
      return { ok: true };
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

// ─── transfer, audit, quarantine, expiryActions: see inventoryRouterExtension.ts ──────────

// ─── Combined Inventory Router ────────────────────────────────────────────────

export const inventoryLedgerRouter = router({
  batch: batchRouter,
  stock: stockRouter,
  adjustment: adjustmentRouter,
  ...inventoryRouterExtension,
});
