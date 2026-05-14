/**
 * masterDataCatalogOpsRouter.ts
 * Store / Location Master — extracted from masterDataCatalogRouter.ts
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import type { ResultSetHeader } from "mysql2";
import { logAudit } from "../services/audit";
import { router, protectedProcedure } from "../_core/trpc";

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

// ─── Store / Location Master ──────────────────────────────────────────────────
export const storeMasterRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        activeOnly: z.boolean().default(true),
        limit: z.number().default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDb();
      const { stores } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: SQL<unknown>[] = [];
      if (input.search) conds.push(like(stores.name, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(stores.isActive, true));
      const where: SQL<unknown> | undefined = conds.length
        ? and(...conds)
        : undefined;
      const rows = await db
        .select()
        .from(stores)
        .where(where)
        .orderBy(stores.name)
        .limit(input.limit);
      return { rows, total: rows.length };
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(["in_building", "cluster_hub"]).default("in_building"),
        address: z.string().optional(),
        pincode: z.string().optional(),
        phone: z.string().optional(),
        slaMins: z.number().default(20),
        lat: z.string().optional(),
        lng: z.string().optional(),
        serviceRadius: z.number().default(3000),
        openingHours: z.string().optional(),
        priority: z.number().default(10),
        isPrimary: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      const { stores } = await import("../../drizzle/schema");
      const insertResult = await db.insert(stores).values(input);
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.store.create",
        entityType: "store",
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
        type: z.enum(["in_building", "cluster_hub"]).optional(),
        address: z.string().optional(),
        pincode: z.string().optional(),
        phone: z.string().optional(),
        slaMins: z.number().optional(),
        lat: z.string().optional(),
        lng: z.string().optional(),
        serviceRadius: z.number().optional(),
        openingHours: z.string().optional(),
        priority: z.number().optional(),
        isPrimary: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx.user.role);
      const db = await getDb();
      const { stores } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, ...data } = input;
      const [before] = await db.select().from(stores).where(eq(stores.id, id));
      await db.update(stores).set(data).where(eq(stores.id, id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.store.update",
        entityType: "store",
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
      requireAdmin(ctx.user.role);
      const db = await getDb();
      const { stores } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(stores)
        .set({ isActive: false })
        .where(eq(stores.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.store.deactivate",
        entityType: "store",
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
      requireAdmin(ctx.user.role);
      const db = await getDb();
      const { stores } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(stores)
        .set({ isActive: true })
        .where(eq(stores.id, input.id));
      await logAudit({
        actorId: ctx.user.id,
        actorType: "user",
        action: "master.store.reactivate",
        entityType: "store",
        entityId: input.id,
        source: "admin",
      });
      return { success: true };
    }),
  exportCsv: protectedProcedure
    .input(z.object({}))
    .mutation(async ({ ctx }) => {
      requireManager(ctx.user.role);
      const db = await getDb();
      const { stores } = await import("../../drizzle/schema");
      const rows = await db.select().from(stores).orderBy(stores.name);
      return toCsv(rows);
    }),
});
