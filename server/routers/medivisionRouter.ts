/**
 * server/routers/medivisionRouter.ts
 * Medivision ERP integration — CSV stock sync adapter.
 *
 * Procedures:
 *   importCsv   — parse a CSV payload and batch-upsert products + store_skus
 *   syncStatus  — list recent sync log entries
 *   healthCheck — ping to verify connectivity (stub)
 *
 * CSV format expected (Medivision standard export):
 *   ItemCode, ItemName, Pack, Manufacturer, MRP, PurchaseRate, Category, HSNCode, GSTRate, StockQty
 *
 * Access: store_manager | admin
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { products, storeSkus, medivisionSyncLog } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

const ALLOWED_ROLES = ["store_manager", "admin"] as const;

function assertRole(role: string) {
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Store manager access required",
    });
  }
}

function getStoreId(user: {
  staffStoreId?: number | null;
  role: string;
}): number {
  if (user.staffStoreId) return user.staffStoreId;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "No store assigned",
  });
}

/**
 * Parse a Medivision CSV string into row objects.
 * Handles both comma and tab delimiters.
 * Returns an array of parsed row objects.
 */
function parseMedivisionCsv(csvText: string): Array<{
  itemCode: string;
  itemName: string;
  pack: string;
  manufacturer: string;
  mrp: number;
  purchaseRate: number;
  category: string;
  hsnCode: string;
  gstRate: number;
  stockQty: number;
}> {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter
  const delimiter = lines[0].includes("\t") ? "\t" : ",";

  // Parse header
  const rawHeaders = lines[0].split(delimiter).map(h =>
    h
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
  );
  const headerMap: Record<string, number> = {};
  rawHeaders.forEach((h, i) => {
    headerMap[h] = i;
  });

  const get = (row: string[], keys: string[]): string => {
    for (const k of keys) {
      const idx = headerMap[k];
      if (idx !== undefined && row[idx] !== undefined)
        return row[idx].trim().replace(/^"|"$/g, "");
    }
    return "";
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    if (cols.length < 3) continue;

    const itemCode = get(cols, ["itemcode", "code", "productcode", "sku"]);
    const itemName = get(cols, [
      "itemname",
      "name",
      "productname",
      "description",
    ]);
    if (!itemCode && !itemName) continue;

    rows.push({
      itemCode: itemCode || `MV-${i}`,
      itemName: itemName || "Unknown",
      pack: get(cols, ["pack", "packsize", "unit"]) || "1",
      manufacturer:
        get(cols, ["manufacturer", "mfr", "company", "brand"]) || "",
      mrp:
        parseFloat(get(cols, ["mrp", "maxretailprice", "sellingprice"])) || 0,
      purchaseRate:
        parseFloat(get(cols, ["purchaserate", "costprice", "rate", "ptr"])) ||
        0,
      category: get(cols, ["category", "type", "group"]) || "medicines",
      hsnCode: get(cols, ["hsncode", "hsn"]) || "30049099",
      gstRate: parseFloat(get(cols, ["gstrate", "gst", "taxrate"])) || 12,
      stockQty:
        parseInt(get(cols, ["stockqty", "stock", "qty", "quantity"])) || 0,
    });
  }
  return rows;
}

export const medivisionRouter = router({
  /**
   * Import a Medivision CSV payload.
   * Creates/updates products and store_skus in a single transaction.
   */
  importCsv: protectedProcedure
    .input(
      z.object({
        csvText: z.string().min(10, "CSV content is required"),
        filename: z.string().default("medivision-import.csv"),
        storeId: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertRole(ctx.user.role);
      const storeId = input.storeId ?? getStoreId(ctx.user);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB unavailable",
        });

      // Create sync log entry
      const [logResult] = await db.insert(medivisionSyncLog).values({
        filename: input.filename,
        status: "running",
      });
      const logId = (logResult as { insertId: number }).insertId;

      const rows = parseMedivisionCsv(input.csvText);
      if (rows.length === 0) {
        await db
          .update(medivisionSyncLog)
          .set({
            status: "failed",
            errors: "No parseable rows found in CSV",
            completedAt: new Date(),
          })
          .where(eq(medivisionSyncLog.id, logId));
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No parseable rows found in CSV",
        });
      }

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of rows) {
        try {
          // Upsert product by name + manufacturer
          const existingProducts = await db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.name, row.itemName))
            .limit(1);

          let productId: number;

          if (existingProducts.length > 0) {
            productId = existingProducts[0].id;
            // Update MRP, HSN, GST rate
            await db
              .update(products)
              .set({
                hsnCode: row.hsnCode,
                gstRate: String(row.gstRate),
                brand: row.manufacturer || undefined,
                packSize: row.pack || undefined,
              })
              .where(eq(products.id, productId));
            updated++;
          } else {
            // Insert new product
            const validCategories = [
              "medicine",
              "devices",
              "baby",
              "nutrition",
              "fmcg",
              "wellness",
            ] as const;
            type ValidCat = (typeof validCategories)[number];
            const catMap: Record<string, ValidCat> = {
              medicines: "medicine",
              personal_care: "fmcg",
              general: "fmcg",
            };
            const resolvedCat: ValidCat =
              catMap[row.category] ??
              (validCategories.includes(row.category as ValidCat)
                ? (row.category as ValidCat)
                : "medicine");
            const [insertResult] = await db.insert(products).values({
              name: row.itemName,
              brand: row.manufacturer || null,
              hsnCode: row.hsnCode,
              gstRate: String(row.gstRate),
              packSize: row.pack || null,
              category: resolvedCat,
              requiresPrescription: false,
              isChronicMedication: false,
            });
            productId = (insertResult as { insertId: number }).insertId;
            inserted++;
          }

          // Upsert store SKU with stock quantity
          const existingSkus = await db
            .select({ id: storeSkus.id })
            .from(storeSkus)
            .where(
              and(
                eq(storeSkus.productId, productId),
                eq(storeSkus.storeId, storeId)
              )
            )
            .limit(1);

          if (existingSkus.length > 0) {
            await db
              .update(storeSkus)
              .set({
                stockQty: row.stockQty,
                sellingPrice: String(row.mrp),
                mrp: String(row.mrp),
              })
              .where(eq(storeSkus.id, existingSkus[0].id));
          } else {
            await db.insert(storeSkus).values({
              productId,
              storeId,
              stockQty: row.stockQty,
              softLockedQty: 0,
              sellingPrice: String(row.mrp),
              mrp: String(row.mrp),
              isActive: true,
            });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`Row "${row.itemName}": ${message}`);
          skipped++;
        }
      }

      // Update sync log
      await db
        .update(medivisionSyncLog)
        .set({
          rowsProcessed: rows.length,
          rowsInserted: inserted,
          rowsUpdated: updated,
          rowsSkipped: skipped,
          errors: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
          status: errors.length === rows.length ? "failed" : "completed",
          completedAt: new Date(),
        })
        .where(eq(medivisionSyncLog.id, logId));

      return {
        logId,
        rowsProcessed: rows.length,
        rowsInserted: inserted,
        rowsUpdated: updated,
        rowsSkipped: skipped,
        errorCount: errors.length,
        firstErrors: errors.slice(0, 5),
      };
    }),

  /**
   * List recent sync log entries.
   */
  syncStatus: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      assertRole(ctx.user.role);
      const db = await getDb();
      if (!db) return [];
      const { desc } = await import("drizzle-orm");
      return db
        .select()
        .from(medivisionSyncLog)
        .orderBy(desc(medivisionSyncLog.startedAt))
        .limit(input.limit);
    }),

  /**
   * Health check — confirms the router is reachable.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  healthCheck: protectedProcedure.query(async ({ ctx }) => {
    assertRole(ctx.user.role);
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      message: "Medivision sync adapter is ready",
    };
  }),
});
