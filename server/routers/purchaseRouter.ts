/**
 * purchaseRouter.ts
 * Purchase invoice management: create draft, add lines, commit (updates stock),
 * purchase returns, supplier payments, stock movements ledger.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function requirePurchase(role: string) {
  if (!["admin", "super_admin", "store_manager", "purchase_manager", "inventory_operator"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Purchase access required." });
  }
}

export const purchaseRouter = router({
  // ── List invoices ──────────────────────────────────────────────────────────
  listInvoices: protectedProcedure
    .input(z.object({
      storeId: z.number().optional(),
      supplierId: z.number().optional(),
      status: z.enum(["draft", "committed", "partially_returned", "returned", "cancelled"]).optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { purchaseInvoices, suppliers } = await import("../../drizzle/schema");
      const { eq, and, desc } = await import("drizzle-orm");
      const conditions = [];
      if (input.storeId) conditions.push(eq(purchaseInvoices.storeId, input.storeId));
      if (input.supplierId) conditions.push(eq(purchaseInvoices.supplierId, input.supplierId));
      if (input.status) conditions.push(eq(purchaseInvoices.status, input.status));
      return db.select({
        invoice: purchaseInvoices,
        supplierName: suppliers.supplierName,
      })
        .from(purchaseInvoices)
        .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(purchaseInvoices.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // ── Get single invoice with lines ─────────────────────────────────────────
  getInvoice: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { purchaseInvoices, purchaseLines, products } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [invoice] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.id));
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db.select({
        line: purchaseLines,
        productName: products.name,
      })
        .from(purchaseLines)
        .leftJoin(products, eq(purchaseLines.productId, products.id))
        .where(eq(purchaseLines.purchaseInvoiceId, input.id));
      return { invoice, lines };
    }),

  // ── Create draft invoice ──────────────────────────────────────────────────
  createInvoice: protectedProcedure
    .input(z.object({
      supplierId: z.number(),
      storeId: z.number(),
      invoiceNo: z.string().min(1),
      invoiceDate: z.date(),
      supplierGstin: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { purchaseInvoices } = await import("../../drizzle/schema");
      const [result] = await db.insert(purchaseInvoices).values({
        ...input,
        createdBy: ctx.user!.id,
        status: "draft",
      });
      return { id: (result as { insertId: number }).insertId };
    }),

  // ── Add line to draft invoice ─────────────────────────────────────────────
  addLine: protectedProcedure
    .input(z.object({
      purchaseInvoiceId: z.number(),
      productId: z.number(),
      batchNo: z.string().min(1),
      expiryDate: z.date(),
      mrp: z.string(),
      purchaseRate: z.string(),
      saleRate: z.string().optional(),
      qty: z.number().min(1),
      freeQty: z.number().default(0),
      schemeDiscount: z.string().default("0.00"),
      cashDiscount: z.string().default("0.00"),
      hsnCode: z.string().optional(),
      gstRate: z.string().default("12.00"),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { purchaseInvoices, purchaseLines } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.purchaseInvoiceId));
      if (!inv || inv.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice not in draft state" });
      const [result] = await db.insert(purchaseLines).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),

  // ── Commit invoice → creates/updates batches + stock movements ────────────
  commitInvoice: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const {
        purchaseInvoices, purchaseLines, batches, storeSkus, stockMovements,
      } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.id));
      if (!inv || inv.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice not in draft state" });

      const lines = await db.select().from(purchaseLines).where(eq(purchaseLines.purchaseInvoiceId, input.id));
      if (!lines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No lines to commit" });

      for (const line of lines) {
        // Upsert batch
        const existingBatch = await db.select().from(batches)
          .where(eq(batches.batchNumber, line.batchNo))
          .limit(1);

        let batchId: number;
        if (existingBatch.length) {
          batchId = existingBatch[0].id;
        } else {
          const [br] = await db.insert(batches).values({
            productId: line.productId,
            batchNumber: line.batchNo,
            expiryDate: line.expiryDate,
            unitCost: line.purchaseRate,
            quantity: 0,
            storeId: inv.storeId,
            status: "active",
          });
          batchId = (br as { insertId: number }).insertId;
        }

        // Update batch quantity
        const [currentBatch] = await db.select().from(batches).where(eq(batches.id, batchId));
        const qtyBefore = currentBatch?.quantity ?? 0;
        const qtyAfter = qtyBefore + line.qty + (line.freeQty ?? 0);
        await db.update(batches).set({ quantity: qtyAfter }).where(eq(batches.id, batchId));

        // Update purchaseLine with batchId
        await db.update(purchaseLines).set({ batchId }).where(eq(purchaseLines.id, line.id));

        // Record stock movement
        await db.insert(stockMovements).values({
          batchId,
          storeId: inv.storeId,
          movementType: "purchase_inward",
          qty: line.qty + (line.freeQty ?? 0),
          qtyBefore,
          qtyAfter,
          referenceType: "purchase_invoice",
          referenceId: inv.id,
          performedBy: ctx.user!.id,
        });

        // Upsert storeSku stock
        const [sku] = await db.select().from(storeSkus)
          .where(eq(storeSkus.productId, line.productId))
          .limit(1);
        if (sku) {
          await db.update(storeSkus).set({ stockQty: (sku.stockQty ?? 0) + line.qty + (line.freeQty ?? 0) }).where(eq(storeSkus.id, sku.id));
        }
      }

      // Mark invoice committed
      await db.update(purchaseInvoices).set({ status: "committed", committedAt: new Date() }).where(eq(purchaseInvoices.id, input.id));
      return { success: true };
    }),

  // ── Stock movements ledger ────────────────────────────────────────────────
  stockMovements: protectedProcedure
    .input(z.object({
      storeId: z.number().optional(),
      batchId: z.number().optional(),
      movementType: z.string().optional(),
      limit: z.number().default(100),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { stockMovements, batches, products } = await import("../../drizzle/schema");
      const { eq, and, desc } = await import("drizzle-orm");
      const conditions = [];
      if (input.storeId) conditions.push(eq(stockMovements.storeId, input.storeId));
      if (input.batchId) conditions.push(eq(stockMovements.batchId, input.batchId));
      return db.select({
        movement: stockMovements,
        batchNumber: batches.batchNumber,
        productName: products.name,
      })
        .from(stockMovements)
        .leftJoin(batches, eq(stockMovements.batchId, batches.id))
        .leftJoin(products, eq(batches.productId, products.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(stockMovements.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // ── Supplier payments ─────────────────────────────────────────────────────
  listPayments: protectedProcedure
    .input(z.object({ supplierId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { supplierPayments, suppliers } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      return db.select({
        payment: supplierPayments,
        supplierName: suppliers.supplierName,
      })
        .from(supplierPayments)
        .leftJoin(suppliers, eq(supplierPayments.supplierId, suppliers.id))
        .where(input.supplierId ? eq(supplierPayments.supplierId, input.supplierId) : undefined)
        .orderBy(desc(supplierPayments.paymentDate))
        .limit(input.limit);
    }),

  recordPayment: protectedProcedure
    .input(z.object({
      supplierId: z.number(),
      storeId: z.number(),
      amount: z.string(),
      paymentMode: z.enum(["cash", "cheque", "upi", "neft", "rtgs"]),
      referenceNo: z.string().optional(),
      paymentDate: z.date().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { supplierPayments } = await import("../../drizzle/schema");
      const [result] = await db.insert(supplierPayments).values({
        ...input,
        paymentDate: input.paymentDate ?? new Date(),
        createdBy: ctx.user!.id,
      });
      return { id: (result as { insertId: number }).insertId };
    }),
});
