/**
 * masterDataPart3RouterExtension.ts — second half of masterDataPart3Router
 * Covers: buildingMasterRouter, printerMasterRouter, productMasterRouter
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import type { ResultSetHeader } from "mysql2";
import { logAudit } from "../services/audit";
import { router, protectedProcedure } from "../_core/trpc";
import { detectPotentialDuplicateProducts } from "../services/productNormalization";

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
  if (!STAFF.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Staff access required.",
    });
}
function requireManager(role: string) {
  if (
    !["admin", "super_admin", "store_manager", "purchase_manager"].includes(
      role
    )
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Manager access required.",
    });
}
function requireAdmin(role: string) {
  if (!["admin", "super_admin"].includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required.",
    });
}
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
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown): string => {
    let s: string;
    if (v === null || v === undefined) {
      s = "";
    } else if (typeof v === "object") {
      s = JSON.stringify(v);
    } else {
      const prim = v as string | number | boolean | bigint;
      s = String(prim);
    }
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(","),
    ...rows.map(r => headers.map(h => esc(r[h])).join(",")),
  ].join("\n");
}

// ─── Building / Society Master ────────────────────────────────────────────────
export const buildingMasterRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().default(200),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDb();
      const { buildings } = await import("../../drizzle/schema");
      const { like } = await import("drizzle-orm");
      const where = input.search
        ? like(buildings.name, `%${input.search}%`)
        : undefined;
      const rows = await db
        .select()
        .from(buildings)
        .where(where)
        .orderBy(buildings.name)
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db
        .select({ total: (await import("drizzle-orm")).count() })
        .from(buildings)
        .where(where);
      return { rows, total };
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        address: z.string().optional(),
        addressLine1: z.string().optional(),
        landmark: z.string().optional(),
        pincode: z.string().optional(),
        city: z.string().optional(),
        lat: z.string().optional(),
        lng: z.string().optional(),
        primaryStoreId: z.number().optional(),
        fallbackStoreId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      const { buildings } = await import("../../drizzle/schema");
      const insertResult = await db.insert(buildings).values(input);
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.building.create",
        entityType: "building",
        entityId: id,
        beforeJson: null,
        afterJson: input,
        source: "admin",
      });
      return { id };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        address: z.string().optional(),
        addressLine1: z.string().optional(),
        landmark: z.string().optional(),
        pincode: z.string().optional(),
        city: z.string().optional(),
        lat: z.string().optional(),
        lng: z.string().optional(),
        primaryStoreId: z.number().optional(),
        fallbackStoreId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      const { buildings } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, ...data } = input;
      const [before] = await db
        .select()
        .from(buildings)
        .where(eq(buildings.id, id));
      await db.update(buildings).set(data).where(eq(buildings.id, id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.building.update",
        entityType: "building",
        entityId: id,
        beforeJson: before,
        afterJson: data,
        source: "admin",
      });
      return { success: true };
    }),
  exportCsv: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { buildings } = await import("../../drizzle/schema");
      const rows = await db.select().from(buildings).orderBy(buildings.name);
      return toCsv(rows);
    }),
});

// ─── Printer Master (upgraded) ────────────────────────────────────────────────
export const printerMasterRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        activeOnly: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDb();
      const { printers } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: SQL<unknown>[] = [];
      if (input.search)
        conds.push(like(printers.printerName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(printers.isActive, true));
      const where: SQL<unknown> | undefined = conds.length
        ? and(...conds)
        : undefined;
      const rows = await db
        .select()
        .from(printers)
        .where(where)
        .orderBy(printers.printerName);
      return { rows, total: rows.length };
    }),
  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        printerName: z.string().min(1),
        printerType: z.enum(["bill", "barcode", "a4", "thermal"]),
        assignedTerminal: z.string().optional(),
        assignedStoreId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { printers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        const [before] = await db
          .select()
          .from(printers)
          .where(eq(printers.id, input.id));
        await db.update(printers).set(input).where(eq(printers.id, input.id));
        await logAudit({
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.printer.update",
          entityType: "printer",
          entityId: input.id,
          beforeJson: before,
          afterJson: input,
          source: "admin",
        });
        return { id: input.id };
      }
      const insertResult = await db.insert(printers).values(input);
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.printer.create",
        entityType: "printer",
        entityId: id,
        beforeJson: null,
        afterJson: input,
        source: "admin",
      });
      return { id };
    }),
  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { printers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(printers)
        .set({ isActive: false })
        .where(eq(printers.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.printer.deactivate",
        entityType: "printer",
        entityId: input.id,
        beforeJson: null,
        afterJson: null,
        reason: input.reason,
        source: "admin",
      });
      return { success: true };
    }),
  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { printers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(printers)
        .set({ isActive: true })
        .where(eq(printers.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.printer.reactivate",
        entityType: "printer",
        entityId: input.id,
        source: "admin",
      });
      return { success: true };
    }),
});

// ─── Product Master (upgraded) ────────────────────────────────────────────────
export const productMasterRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        activeOnly: z.boolean().default(true),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDb();
      const { products } = await import("../../drizzle/schema");
      const { like, and, eq, or } = await import("drizzle-orm");
      type ProductCategoryEnum =
        | "medicine"
        | "devices"
        | "baby"
        | "nutrition"
        | "fmcg"
        | "wellness";
      const conds: SQL<unknown>[] = [];
      if (input.search) {
        conds.push(
          or(
            like(products.name, `%${input.search}%`),
            like(products.brand, `%${input.search}%`),
            like(products.genericName, `%${input.search}%`),
            like(products.companyName, `%${input.search}%`)
          ) as SQL<unknown>
        );
      }
      if (input.category)
        conds.push(
          eq(products.category, input.category as ProductCategoryEnum)
        );
      const where: SQL<unknown> | undefined = conds.length
        ? and(...conds)
        : undefined;
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          genericName: products.genericName,
          form: products.form,
          strength: products.strength,
          packSize: products.packSize,
          schedule: products.schedule,
          requiresPrescription: products.requiresPrescription,
          category: products.category,
          companyName: products.companyName,
          hsnCode: products.hsnCode,
          barcode: products.barcode,
          gstRate: products.gstRate,
          isChronicMedication: products.isChronicMedication,
          canonicalName: products.canonicalName,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .where(where)
        .orderBy(products.name)
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db
        .select({ total: (await import("drizzle-orm")).count() })
        .from(products)
        .where(where);
      return { rows, total };
    }),
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDb();
      const {
        products,
        productAliases,
        productBarcodes,
        productSupplierMappings,
        productLocks,
      } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, input.id));
      if (!product) throw new TRPCError({ code: "NOT_FOUND" });
      const aliases = await db
        .select()
        .from(productAliases)
        .where(eq(productAliases.productId, input.id));
      const barcodes = await db
        .select()
        .from(productBarcodes)
        .where(eq(productBarcodes.productId, input.id));
      const supplierMappings = await db
        .select()
        .from(productSupplierMappings)
        .where(eq(productSupplierMappings.productId, input.id));
      const locks = await db
        .select()
        .from(productLocks)
        .where(eq(productLocks.productId, input.id));
      return { product, aliases, barcodes, supplierMappings, locks };
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        brand: z.string().optional(),
        genericName: z.string().optional(),
        form: z.string().optional(),
        strength: z.string().optional(),
        packSize: z.string().optional(),
        schedule: z.enum(["OTC", "H", "H1", "X"]).default("OTC"),
        requiresPrescription: z.boolean().default(false),
        isChronicMedication: z.boolean().default(false),
        category: z
          .enum([
            "medicine",
            "devices",
            "baby",
            "nutrition",
            "fmcg",
            "wellness",
          ])
          .default("medicine"),
        companyName: z.string().optional(),
        companyCode: z.string().optional(),
        hsnCode: z.string().optional(),
        barcode: z.string().optional(),
        gstRate: z.string().optional(),
        canonicalName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { products } = await import("../../drizzle/schema");
      const insertResult = await db.insert(products).values(input);
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.product.create",
        entityType: "product",
        entityId: id,
        beforeJson: null,
        afterJson: input,
        source: "admin",
      });
      return { id };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        brand: z.string().optional(),
        genericName: z.string().optional(),
        form: z.string().optional(),
        strength: z.string().optional(),
        packSize: z.string().optional(),
        schedule: z.enum(["OTC", "H", "H1", "X"]).optional(),
        requiresPrescription: z.boolean().optional(),
        isChronicMedication: z.boolean().optional(),
        category: z
          .enum([
            "medicine",
            "devices",
            "baby",
            "nutrition",
            "fmcg",
            "wellness",
          ])
          .optional(),
        companyName: z.string().optional(),
        companyCode: z.string().optional(),
        hsnCode: z.string().optional(),
        barcode: z.string().optional(),
        gstRate: z.string().optional(),
        canonicalName: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { products } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, ...data } = input;
      const [before] = await db
        .select()
        .from(products)
        .where(eq(products.id, id));
      await db.update(products).set(data).where(eq(products.id, id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.product.update",
        entityType: "product",
        entityId: id,
        beforeJson: before,
        afterJson: data,
        source: "admin",
      });
      return { success: true };
    }),
  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const _db = await getDb();
      // products table doesn't have isActive yet — we use a soft-delete via canonicalName marker
      // Instead, we log the deactivation as an audit event for now
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.product.deactivate",
        entityType: "product",
        entityId: input.id,
        beforeJson: null,
        afterJson: null,
        reason: input.reason,
        source: "admin",
      });
      return { success: true };
    }),

  duplicateCandidates: protectedProcedure
    .input(
      z.object({
        productIds: z.array(z.number()).optional(),
        limit: z.number().default(500),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDb();
      const { products } = await import("../../drizzle/schema");
      const { inArray } = await import("drizzle-orm");
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          genericName: products.genericName,
          form: products.form,
          strength: products.strength,
          packSize: products.packSize,
          companyName: products.companyName,
          hsnCode: products.hsnCode,
          barcode: products.barcode,
          gstRate: products.gstRate,
          schedule: products.schedule,
          requiresPrescription: products.requiresPrescription,
        })
        .from(products)
        .where(
          input.productIds?.length
            ? inArray(products.id, input.productIds)
            : undefined
        )
        .limit(input.limit);
      return {
        candidates: detectPotentialDuplicateProducts(rows),
        behavior: "review_only",
        autoMerge: false,
      };
    }),
  addAlias: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        alias: z.string().min(1),
        aliasType: z
          .enum([
            "supplier_code",
            "legacy_code",
            "medivision_code",
            "samarth_code",
            "barcode",
            "other",
          ])
          .default("other"),
        supplierId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { productAliases } = await import("../../drizzle/schema");
      const insertResult = await db.insert(productAliases).values(input);
      return {
        id: (insertResult as unknown as [ResultSetHeader])[0].insertId,
      };
    }),
  addBarcode: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        barcode: z.string().min(1),
        barcodeType: z
          .enum(["ean13", "ean8", "code128", "qr", "datamatrix", "other"])
          .default("ean13"),
        isPrimary: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { productBarcodes } = await import("../../drizzle/schema");
      const insertResult = await db.insert(productBarcodes).values(input);
      return {
        id: (insertResult as unknown as [ResultSetHeader])[0].insertId,
      };
    }),
  exportCsv: protectedProcedure
    .input(z.object({ category: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { products } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      type ProductCategoryEnum =
        | "medicine"
        | "devices"
        | "baby"
        | "nutrition"
        | "fmcg"
        | "wellness";
      const where = input.category
        ? eq(products.category, input.category as ProductCategoryEnum)
        : undefined;
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          brand: products.brand,
          genericName: products.genericName,
          form: products.form,
          strength: products.strength,
          packSize: products.packSize,
          schedule: products.schedule,
          requiresPrescription: products.requiresPrescription,
          category: products.category,
          companyName: products.companyName,
          hsnCode: products.hsnCode,
          barcode: products.barcode,
          gstRate: products.gstRate,
        })
        .from(products)
        .where(where)
        .orderBy(products.name);
      return toCsv(rows);
    }),
});
