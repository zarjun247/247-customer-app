/**
 * salesOpsExtension.ts — lookup and read-only procedures for salesRouter
 * Covers: scanBarcodeForSale, scanBarcodeForReturn, searchProducts,
 *         getFefoBatches, getDraft, getInvoiceSnapshotPackage
 */
import { z } from "zod";
import { protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireStoreAccess } from "../_core/rbac";
import { eq, and, sql, like, or, asc } from "drizzle-orm";
import {
  resolveBarcodeForSale,
  resolveBarcodeForReturn,
} from "../services/barcodeService";
import { getInvoiceSnapshotPackageForSale } from "../services/invoiceSnapshotService";
import { getDbSafe, requireSales } from "./salesUtils";

export const salesOpsExtension = {
  scanBarcodeForSale: protectedProcedure
    .input(z.object({ barcode: z.string().min(1), storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      requireStoreAccess(ctx.user, input.storeId);
      const resolved = await resolveBarcodeForSale(
        input.barcode,
        input.storeId
      );
      return {
        ...resolved,
        stockMutation: "deferred_to_sale_confirmation_stockInvariant",
        complianceGate: "checked_at_confirm",
        marginGuard: "checked_at_confirm",
      };
    }),

  scanBarcodeForReturn: protectedProcedure
    .input(z.object({ barcode: z.string().min(1), storeId: z.number() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      requireStoreAccess(ctx.user, input.storeId);
      const resolved = await resolveBarcodeForReturn(
        input.barcode,
        input.storeId
      );
      return {
        ...resolved,
        stockMutation: "deferred_to_return_commit_stockInvariant",
      };
    }),

  // ─── Product Search ──────────────────────────────────────────────────────────
  searchProducts: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        storeId: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      if (input.storeId !== undefined)
        requireStoreAccess(ctx.user, Number(input.storeId));
      const db = await getDbSafe();
      const { products } = await import("../../drizzle/schema");
      const q = `%${input.query}%`;
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          strength: products.strength,
          dosageForm: products.form,
          packSize: products.packSize,
          gstRate: products.gstRate,
          hsnCode: products.hsnCode,
          scheduleId: products.schedule,
          prescriptionRequired: products.requiresPrescription,
          h1RegisterRequired: products.requiresPrescription,
          primaryBarcode: products.barcode,
        })
        .from(products)
        .where(
          and(
            or(
              like(products.name, q),
              like(products.brand, q),
              like(products.barcode, q),
              like(products.canonicalName, q)
            )
          )
        )
        .limit(input.limit);
      return { rows };
    }),

  // ─── FEFO Batch Suggestion ───────────────────────────────────────────────────
  getFefoBatches: protectedProcedure
    .input(
      z.object({
        productId: z.string(),
        storeId: z.string(),
        qtyNeeded: z.number().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      requireStoreAccess(ctx.user, Number(input.storeId));
      const db = await getDbSafe();
      const { batchLedger } = await import("../../drizzle/schema");
      const now = Date.now();
      const batches = await db
        .select()
        .from(batchLedger)
        .where(
          and(
            eq(batchLedger.productId, parseInt(input.productId) || 0),
            eq(batchLedger.storeId, parseInt(input.storeId) || 0),
            sql`${batchLedger.qtyOnHand} > 0`,
            sql`${batchLedger.status} NOT IN ('expired','quarantined','disposed','recalled')`
          )
        )
        .orderBy(asc(batchLedger.expiryDate))
        .limit(10);

      return {
        batches: batches.map(b => {
          const expiryMs = b.expiryDate
            ? new Date(b.expiryDate).getTime()
            : null;
          const daysToExpiry = expiryMs
            ? Math.ceil((expiryMs - now) / (24 * 60 * 60 * 1000))
            : null;
          const isNearExpiry = daysToExpiry !== null && daysToExpiry <= 90;
          const isExpired = daysToExpiry !== null && daysToExpiry <= 0;
          const isCritical =
            daysToExpiry !== null && daysToExpiry <= 60 && daysToExpiry > 30;
          const isQuarantineCandidate =
            daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry > 0;
          return {
            ...b,
            daysToExpiry,
            isNearExpiry,
            isExpired,
            isCritical,
            isQuarantineCandidate,
            availableQty:
              (b.qtyOnHand ?? 0) -
              (b.qtyReserved ?? 0) -
              (b.qtyQuarantined ?? 0) -
              (b.qtyExpired ?? 0),
          };
        }),
      };
    }),

  // ─── Get Draft (with lines) ──────────────────────────────────────────────────
  getDraft: protectedProcedure
    .input(z.object({ saleId: z.string() }))
    .query(async ({ ctx, input }) => {
      requireSales(ctx.user?.role);
      const db = await getDbSafe();
      const { sales, saleLines, products } = await import(
        "../../drizzle/schema"
      );
      const [sale] = await db
        .select()
        .from(sales)
        .where(eq(sales.id, input.saleId))
        .limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db
        .select({
          line: saleLines,
          productName: products.name,
          productBrand: products.brand,
        })
        .from(saleLines)
        .leftJoin(products, eq(saleLines.productId, products.id))
        .where(eq(saleLines.saleId, input.saleId));
      return { sale, lines };
    }),

  // ─── Immutable invoice snapshot package ─────────────────────────────────────
  getInvoiceSnapshotPackage: protectedProcedure
    .input(z.object({ saleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDbSafe();
      try {
        const invoicePackage = await getInvoiceSnapshotPackageForSale(
          db,
          input.saleId,
          { id: ctx.user.id, role: ctx.user?.role }
        );
        if (!invoicePackage)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invoice snapshot not found",
          });
        return invoicePackage;
      } catch (error) {
        if ((error as { code?: string })?.code === "FORBIDDEN")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Invoice snapshot not available for this customer",
          });
        throw error;
      }
    }),
};
