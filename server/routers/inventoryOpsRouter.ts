/**
 * inventoryRouterExtension.ts — Extension for inventoryRouter.ts
 *
 * Contains: transferRouter, auditSessionRouter, quarantineRouter, expiryActionsRouter
 * These are spread into inventoryLedgerRouter in inventoryRouter.ts.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import type { ResultSetHeader } from "mysql2";
import {
  isAdmin,
  isSuperAdmin,
  requireStaffStore,
  requireStoreAccess,
} from "../_core/rbac";
import type { AccessUser } from "../_core/rbac";
import { logAudit } from "../services/audit";
import {
  applyStockAuditCorrection,
  receiveTransferStockAtomic,
} from "../services/stockInvariant";
import { resolveBarcodeForStockAudit } from "../services/barcodeService";
import { reserveBatchAtomic } from "../services/reservationService";
import { requireStoreAccessForEntity } from "../_core/storeAccessHelpers";
import { eq, and, or, gt, desc, asc, type SQL } from "drizzle-orm";

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
  user: AccessUser,
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
  user: AccessUser,
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

// ─── Transfer Router ──────────────────────────────────────────────────────────

const transferRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        status: z
          .enum(["pending", "in_transit", "received", "cancelled"])
          .optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      const visibleStoreId = requireStoreScopedFilter(ctx.user, input.storeId);
      const db = await getDb();
      const { stockTransfers, batchLedger, products } = await schema();
      const offset = (input.page - 1) * input.pageSize;
      const conds: SQL[] = [];
      if (visibleStoreId) {
        const orCond = or(
          eq(stockTransfers.fromStoreId, visibleStoreId),
          eq(stockTransfers.toStoreId, visibleStoreId)
        );
        if (orCond) conds.push(orCond);
      }
      if (input.status) conds.push(eq(stockTransfers.status, input.status));

      const rows = await db
        .select({
          transfer: stockTransfers,
          productName: products.name,
          batchNo: batchLedger.batchNo,
        })
        .from(stockTransfers)
        .leftJoin(products, eq(stockTransfers.productId, products.id))
        .leftJoin(batchLedger, eq(stockTransfers.batchId, batchLedger.id))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(stockTransfers.initiatedAt))
        .limit(input.pageSize)
        .offset(offset);

      return { rows };
    }),

  initiate: protectedProcedure
    .input(
      z.object({
        fromStoreId: z.number(),
        toStoreId: z.number(),
        batchId: z.number(),
        productId: z.number(),
        qty: z.number().min(1),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      if (input.fromStoreId === input.toStoreId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source and destination stores must differ",
        });
      requireTransferEndpointAccess(
        ctx.user,
        { fromStoreId: input.fromStoreId, toStoreId: input.toStoreId },
        "initiate"
      );
      const db = await getDb();
      const { batchLedger, stockTransfers, stores } = await schema();
      const [batch] = await db
        .select()
        .from(batchLedger)
        .where(eq(batchLedger.id, input.batchId));
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });
      if (batch.storeId !== input.fromStoreId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source batch does not belong to fromStoreId",
        });
      if (batch.productId !== input.productId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Source batch product mismatch",
        });
      const [destinationStore] = await db
        .select({ id: stores.id })
        .from(stores)
        .where(eq(stores.id, input.toStoreId))
        .limit(1);
      if (!destinationStore)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Destination store not found",
        });
      await reserveBatchAtomic({
        batchId: input.batchId,
        productId: input.productId,
        storeId: input.fromStoreId,
        qty: input.qty,
        releaseReason: "transfer_initiated",
        ctx,
      });
      const transferInsert = await db.insert(stockTransfers).values({
        fromStoreId: input.fromStoreId,
        toStoreId: input.toStoreId,
        batchId: input.batchId,
        productId: input.productId,
        qtyTransferred: input.qty,
        status: "in_transit",
        initiatedBy: ctx.user.id,
        note: input.note,
      });
      const [transferHeader] = transferInsert as unknown as [ResultSetHeader];
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "stock_transfer",
          entityId: transferHeader.insertId,
          action: "inventory.initiate",
          afterJson: input,
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { transferId: transferHeader.insertId };
    }),

  receive: protectedProcedure
    .input(z.object({ transferId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      const db = await getDb();
      const { stockTransfers } = await schema();
      const [transfer] = await db
        .select()
        .from(stockTransfers)
        .where(eq(stockTransfers.id, input.transferId));
      if (!transfer) throw new TRPCError({ code: "NOT_FOUND" });
      requireTransferEndpointAccess(ctx.user, transfer, "receive");
      if (transfer.status !== "in_transit")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transfer is not in transit",
        });
      const destResult = await receiveTransferStockAtomic({
        transferId: input.transferId,
        actor: {
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          source: "admin",
        },
      });
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "stock_transfer",
          entityId: input.transferId,
          action: "inventory.receive",
          reason: `Received ${transfer.qtyTransferred} units at store ${transfer.toStoreId}`,
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { ok: true, destBatchId: destResult.destinationBatchId };
    }),
});

// ─── Audit Session Router ─────────────────────────────────────────────────────

const auditSessionRouter = router({
  scanBarcodeForAudit: protectedProcedure
    .input(z.object({ barcode: z.string().min(1), storeId: z.number() }))
    .query(async ({ input }) => {
      const resolved = await resolveBarcodeForStockAudit(
        input.barcode,
        input.storeId
      );
      return {
        ...resolved,
        correctionMutation:
          "deferred_to_audit_complete_applyStockAuditCorrection",
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        status: z
          .enum(["draft", "in_progress", "completed", "cancelled"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      const visibleStoreId = requireStoreScopedFilter(ctx.user, input.storeId);
      const db = await getDb();
      const { stockAudits } = await schema();
      const conds: SQL[] = [];
      if (visibleStoreId) conds.push(eq(stockAudits.storeId, visibleStoreId));
      if (input.status) conds.push(eq(stockAudits.status, input.status));
      return db
        .select()
        .from(stockAudits)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(stockAudits.startedAt));
    }),

  create: protectedProcedure
    .input(
      z.object({
        storeId: z.number(),
        auditType: z.enum(["full", "spot_check", "expiry_sweep", "scheduled"]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      requireStoreAccess(ctx.user, input.storeId, {
        allowAdminCrossStore: true,
      });
      const db = await getDb();
      const { stockAudits, stockAuditLines, batchLedger } = await schema();
      const auditInsert = await db.insert(stockAudits).values({
        storeId: input.storeId,
        auditType: input.auditType,
        status: "draft",
        startedBy: ctx.user.id,
        note: input.note,
      });
      const [auditHeader] = auditInsert as unknown as [ResultSetHeader];
      const batches = await db
        .select()
        .from(batchLedger)
        .where(
          and(
            eq(batchLedger.storeId, input.storeId),
            eq(batchLedger.status, "active"),
            gt(batchLedger.qtyOnHand, 0)
          )
        );
      if (batches.length > 0) {
        await db.insert(stockAuditLines).values(
          batches.map(b => ({
            auditId: auditHeader.insertId,
            batchId: b.id,
            productId: b.productId,
            systemQty: b.qtyOnHand,
            status: "pending" as const,
          }))
        );
      }
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "stock_audit",
          entityId: auditHeader.insertId,
          action: "inventory.create",
          afterJson: { ...input, lineCount: batches.length },
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { auditId: auditHeader.insertId, lineCount: batches.length };
    }),

  getLines: protectedProcedure
    .input(z.object({ auditId: z.number() }))
    .query(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      const db = await getDb();
      const { stockAudits, stockAuditLines, batchLedger, products } =
        await schema();
      const [audit] = await db
        .select()
        .from(stockAudits)
        .where(eq(stockAudits.id, input.auditId))
        .limit(1);
      if (!audit) throw new TRPCError({ code: "NOT_FOUND" });
      requireStoreAccess(ctx.user, audit.storeId, {
        allowAdminCrossStore: true,
      });
      return db
        .select({
          line: stockAuditLines,
          productName: products.name,
          batchNo: batchLedger.batchNo,
          expiryDate: batchLedger.expiryDate,
        })
        .from(stockAuditLines)
        .leftJoin(products, eq(stockAuditLines.productId, products.id))
        .leftJoin(batchLedger, eq(stockAuditLines.batchId, batchLedger.id))
        .where(eq(stockAuditLines.auditId, input.auditId))
        .orderBy(asc(products.name));
    }),

  submitCount: protectedProcedure
    .input(z.object({ lineId: z.number(), countedQty: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      assertInventoryRole(ctx.user.role);
      const db = await getDb();
      const { stockAuditLines } = await schema();
      const [line] = await db
        .select()
        .from(stockAuditLines)
        .where(eq(stockAuditLines.id, input.lineId));
      if (!line) throw new TRPCError({ code: "NOT_FOUND" });
      await requireStoreAccessForEntity("stock_audit", line.auditId, ctx);
      const variance = input.countedQty - line.systemQty;
      await db
        .update(stockAuditLines)
        .set({
          countedQty: input.countedQty,
          variance,
          status: "counted",
          countedBy: ctx.user.id,
          countedAt: new Date(),
        })
        .where(eq(stockAuditLines.id, input.lineId));
      return { variance };
    }),

  complete: protectedProcedure
    .input(
      z.object({
        auditId: z.number(),
        applyCorrections: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertManagerRole(ctx.user.role);
      const db = await getDb();
      const { stockAudits, stockAuditLines, batchLedger } = await schema();
      const [audit] = await db
        .select()
        .from(stockAudits)
        .where(eq(stockAudits.id, input.auditId));
      if (!audit) throw new TRPCError({ code: "NOT_FOUND" });
      if (audit.status === "completed")
        return {
          ok: true,
          idempotent: true,
          varianceCount: Number(audit.totalVariances ?? 0),
        };
      const lines = await db
        .select()
        .from(stockAuditLines)
        .where(
          and(
            eq(stockAuditLines.auditId, input.auditId),
            eq(stockAuditLines.status, "counted")
          )
        );
      const variances = lines.filter(
        l => l.variance !== 0 && l.variance !== null
      );
      if (input.applyCorrections) {
        for (const line of variances) {
          const [batch] = await db
            .select()
            .from(batchLedger)
            .where(eq(batchLedger.id, line.batchId));
          if (!batch) continue;
          await applyStockAuditCorrection({
            auditId: input.auditId,
            lineId: line.id,
            batchId: line.batchId,
            storeId: audit.storeId,
            countedQty: line.countedQty ?? batch.qtyOnHand,
            actor: {
              actorId: ctx.user.id,
              actorRole: ctx.user.role,
              source: "admin",
            },
            productId: line.productId,
          });
        }
      }
      await db
        .update(stockAudits)
        .set({
          status: "completed",
          completedBy: ctx.user.id,
          completedAt: new Date(),
          totalVariances: variances.length,
        })
        .where(eq(stockAudits.id, input.auditId));
      try {
        await logAudit({
          actorId: ctx.user.id,
          entityType: "stock_audit",
          entityId: input.auditId,
          action: "inventory.complete",
          reason: `${variances.length} variances. Corrections: ${input.applyCorrections}`,
          source: "admin",
        });
      } catch {
        /* non-critical */
      }
      return { ok: true, varianceCount: variances.length };
    }),
});

// ─── Quarantine Log Router ────────────────────────────────────────────────────

const quarantineRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        status: z
          .enum(["pending_review", "approved", "released", "disposed"])
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
      const { batchQuarantineLogs, batchLedger, products } = await schema();
      const offset = (input.page - 1) * input.pageSize;
      const conds: SQL[] = [];
      if (input.storeId)
        conds.push(eq(batchQuarantineLogs.storeId, input.storeId));
      if (input.status)
        conds.push(eq(batchQuarantineLogs.status, input.status));
      const rows = await db
        .select({
          log: batchQuarantineLogs,
          productName: products.name,
          batchNo: batchLedger.batchNo,
        })
        .from(batchQuarantineLogs)
        .leftJoin(products, eq(batchQuarantineLogs.productId, products.id))
        .leftJoin(batchLedger, eq(batchQuarantineLogs.batchId, batchLedger.id))
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(batchQuarantineLogs.initiatedAt))
        .limit(input.pageSize)
        .offset(offset);
      return { rows };
    }),
});

// ─── Expiry Actions Router ────────────────────────────────────────────────────

const expiryActionsRouter = router({
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

// ─── Extension export ─────────────────────────────────────────────────────────

export const inventoryRouterExtension = {
  transfer: transferRouter,
  audit: auditSessionRouter,
  quarantine: quarantineRouter,
  expiryActions: expiryActionsRouter,
};
