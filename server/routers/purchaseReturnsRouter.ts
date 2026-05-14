/**
 * purchaseRouterExtension.ts — Extension for purchaseRouter.ts
 *
 * Contains: stockMovements, createReturn, addReturnLine, commitReturn,
 *           listReturns, getReturn, listPayments, recordPayment, allocatePayment,
 *           supplierOutstanding, ageing, reconciliation, reports
 * These are spread into purchaseRouter in purchaseRouter.ts.
 */
import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import type { ResultSetHeader } from "mysql2";
import { eq, and, desc } from "drizzle-orm";
import { logAudit } from "../services/audit";
import { withIdempotency as _withIdempotency } from "../services/idempotencyService";
import {
  decreaseStockForPurchaseReturn,
  increaseStockForPurchaseCommit as _increaseStockForPurchaseCommit,
} from "../services/stockInvariant";
import { syncStoreSkuAggregate } from "../services/reservationService";
import { requireStoreAccessForEntity } from "../_core/storeAccessHelpers";
import { applyPurchaseReturnCredit } from "../services/supplierLedger";
import { getDbSafe, requirePurchase, requireManager } from "./purchaseUtils";
import { purchasePaymentsExtension } from "./purchasePaymentsExtension";

export const purchaseRouterExtension = {
  stockMovements: protectedProcedure
    .input(
      z.object({
        purchaseInvoiceId: z.number().optional(),
        storeId: z.number().optional(),
        batchId: z.number().optional(),
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, Number(input.storeId));
      const db = await getDbSafe();
      const { stockMovements, batches, products } = await import(
        "../../drizzle/schema"
      );
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId) conds.push(eq(stockMovements.storeId, input.storeId));
      if (input.batchId) conds.push(eq(stockMovements.batchId, input.batchId));
      if (input.purchaseInvoiceId)
        conds.push(
          and(
            eq(stockMovements.referenceType, "purchase_invoice"),
            eq(stockMovements.referenceId, input.purchaseInvoiceId)
          )!
        );
      return db
        .select({
          movement: stockMovements,
          batchNumber: batches.batchNumber,
          productName: products.name,
        })
        .from(stockMovements)
        .leftJoin(batches, eq(stockMovements.batchId, batches.id))
        .leftJoin(products, eq(batches.productId, products.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(stockMovements.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  createReturn: protectedProcedure
    .input(
      z.object({
        purchaseInvoiceId: z.number(),
        supplierId: z.number(),
        storeId: z.number(),
        reason: z.string().optional(),
        debitNoteNo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      await requireStoreAccessForEntity(
        "purchase_invoice",
        input.purchaseInvoiceId,
        ctx
      );
      const db = await getDbSafe();
      const { purchaseReturns } = await import("../../drizzle/schema");
      const createResult = await db.insert(purchaseReturns).values({
        purchaseInvoiceId: input.purchaseInvoiceId,
        supplierId: input.supplierId,
        storeId: input.storeId,
        reason: input.reason ?? null,
        debitNoteNo: input.debitNoteNo ?? null,
        createdBy: ctx.user.id,
        status: "draft",
      });
      const [createHeader] = createResult as unknown as [ResultSetHeader];
      const id = createHeader.insertId;
      await logAudit(
        {
          action: "purchase.returned",
          entityType: "purchase_return",
          entityId: id,
          afterJson: { purchaseInvoiceId: input.purchaseInvoiceId },
        },
        ctx
      );
      return { id };
    }),

  addReturnLine: protectedProcedure
    .input(
      z.object({
        purchaseReturnId: z.number(),
        purchaseLineId: z.number(),
        batchId: z.number(),
        qty: z.number().min(1),
        returnRate: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      const db = await getDbSafe();
      const { purchaseReturnLines, purchaseReturns } = await import(
        "../../drizzle/schema"
      );
      const [ret] = await db
        .select()
        .from(purchaseReturns)
        .where(eq(purchaseReturns.id, input.purchaseReturnId));
      if (!ret || ret.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Return not in draft state",
        });
      const lineInsertResult = await db.insert(purchaseReturnLines).values({
        purchaseReturnId: input.purchaseReturnId,
        purchaseLineId: input.purchaseLineId,
        batchId: input.batchId,
        qty: input.qty,
        returnRate: input.returnRate,
        reason: input.reason ?? null,
      });
      const lines = await db
        .select()
        .from(purchaseReturnLines)
        .where(
          eq(purchaseReturnLines.purchaseReturnId, input.purchaseReturnId)
        );
      const total = lines.reduce(
        (s, l) => s + parseFloat(l.returnRate ?? "0") * l.qty,
        0
      );
      await db
        .update(purchaseReturns)
        .set({ totalAmount: total.toFixed(2) })
        .where(eq(purchaseReturns.id, input.purchaseReturnId));
      const [lineHeader] = lineInsertResult as unknown as [ResultSetHeader];
      return { id: lineHeader.insertId };
    }),

  commitReturn: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const {
        purchaseReturns,
        purchaseReturnLines,
        batchLedger,
        batches,
        purchaseInvoices,
      } = await import("../../drizzle/schema");
      const [ret] = await db
        .select()
        .from(purchaseReturns)
        .where(eq(purchaseReturns.id, input.id));
      if (!ret || ret.status !== "draft")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Return not in draft state",
        });
      const lines = await db
        .select()
        .from(purchaseReturnLines)
        .where(eq(purchaseReturnLines.purchaseReturnId, input.id));
      if (!lines.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No return lines",
        });
      for (const line of lines) {
        const [b] = await db
          .select()
          .from(batches)
          .where(eq(batches.id, line.batchId))
          .limit(1);
        if (b) {
          const [ledger] = await db
            .select()
            .from(batchLedger)
            .where(
              and(
                eq(batchLedger.batchNo, b.batchNumber),
                eq(batchLedger.storeId, ret.storeId),
                eq(batchLedger.productId, b.productId)
              )
            )
            .limit(1);
          if (!ledger)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Canonical ledger missing for batch ${b.batchNumber}`,
            });
          const canonicalBatchAvailable =
            (ledger.qtyOnHand ?? 0) -
            (ledger.qtyReserved ?? 0) -
            (ledger.qtyQuarantined ?? 0) -
            (ledger.qtyExpired ?? 0);
          if (canonicalBatchAvailable < line.qty)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient canonical stock in batch ${b.batchNumber}`,
            });
          const movement = await decreaseStockForPurchaseReturn({
            batchId: ledger.id,
            storeId: ret.storeId,
            qtyDelta: line.qty,
            referenceType: "purchase_return",
            referenceId: ret.id,
            reason: line.reason ?? `Purchase return ${ret.id}`,
            actor: {
              actorId: ctx.user.id,
              actorRole: ctx.user.role,
              source: "admin",
            },
            productId: b.productId,
          });
          await db
            .update(batches)
            .set({ quantity: movement.qtyAfter as number })
            .where(eq(batches.id, b.id));
          await syncStoreSkuAggregate({
            storeId: ret.storeId,
            productId: b.productId,
            variantId: b.variantId ?? null,
          });
        }
      }
      await db
        .update(purchaseReturns)
        .set({
          status: "committed",
          committedAt: new Date(),
          approvedBy: ctx.user.id,
        })
        .where(eq(purchaseReturns.id, input.id));
      await db
        .update(purchaseInvoices)
        .set({ status: "partially_returned" })
        .where(eq(purchaseInvoices.id, ret.purchaseInvoiceId));
      await applyPurchaseReturnCredit(
        db,
        {
          supplierId: ret.supplierId,
          purchaseInvoiceId: ret.purchaseInvoiceId,
          purchaseReturnId: ret.id,
          storeId: ret.storeId,
          amount: Number(ret.totalAmount ?? 0),
          createdBy: ctx.user.id,
        },
        ctx
      );
      await logAudit(
        {
          action: "purchase.return_committed",
          entityType: "purchase_return",
          entityId: input.id,
          beforeJson: { status: "draft" },
          afterJson: { status: "committed" },
        },
        ctx
      );
      return { success: true };
    }),

  listReturns: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        supplierId: z.number().optional(),
        status: z.enum(["draft", "committed"]).optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, Number(input.storeId));
      const db = await getDbSafe();
      const { purchaseReturns, suppliers, purchaseInvoices } = await import(
        "../../drizzle/schema"
      );
      const conds: ReturnType<typeof eq>[] = [];
      if (input.storeId) conds.push(eq(purchaseReturns.storeId, input.storeId));
      if (input.supplierId)
        conds.push(eq(purchaseReturns.supplierId, input.supplierId));
      if (input.status) conds.push(eq(purchaseReturns.status, input.status));
      return db
        .select({
          ret: purchaseReturns,
          supplierName: suppliers.supplierName,
          invoiceNo: purchaseInvoices.invoiceNo,
        })
        .from(purchaseReturns)
        .leftJoin(suppliers, eq(purchaseReturns.supplierId, suppliers.id))
        .leftJoin(
          purchaseInvoices,
          eq(purchaseReturns.purchaseInvoiceId, purchaseInvoices.id)
        )
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(purchaseReturns.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  getReturn: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user.role);
      const db = await getDbSafe();
      const {
        purchaseReturns,
        purchaseReturnLines,
        purchaseLines,
        products,
        batches,
      } = await import("../../drizzle/schema");
      const [ret] = await db
        .select()
        .from(purchaseReturns)
        .where(eq(purchaseReturns.id, input.id));
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db
        .select({
          line: purchaseReturnLines,
          productName: products.name,
          batchNumber: batches.batchNumber,
        })
        .from(purchaseReturnLines)
        .leftJoin(
          purchaseLines,
          eq(purchaseReturnLines.purchaseLineId, purchaseLines.id)
        )
        .leftJoin(products, eq(purchaseLines.productId, products.id))
        .leftJoin(batches, eq(purchaseReturnLines.batchId, batches.id))
        .where(eq(purchaseReturnLines.purchaseReturnId, input.id));
      return { ret, lines };
    }),

  ...purchasePaymentsExtension,
};
