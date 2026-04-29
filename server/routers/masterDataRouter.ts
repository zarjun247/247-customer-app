/**
 * masterDataRouter.ts
 * CRUD procedures for all Pharmacy OS master data tables.
 * Access: store_manager | admin | super_admin | purchase_manager (varies by master)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";

type StaffRole = "admin" | "super_admin" | "store_manager" | "pharmacist" | "purchase_manager" | "accountant" | "cashier" | "salesman" | "inventory_operator" | "delivery_operator" | "auditor";
const STAFF_ROLES: StaffRole[] = ["admin", "super_admin", "store_manager", "pharmacist", "purchase_manager", "accountant", "cashier", "salesman", "inventory_operator", "delivery_operator", "auditor"];

function requireStaff(role: string) {
  if (!STAFF_ROLES.includes(role as StaffRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff access required." });
  }
}
function requireManager(role: string) {
  if (!["admin", "super_admin", "store_manager", "purchase_manager"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required." });
  }
}

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

async function logAudit(
  userId: number,
  action: string,
  entityType: string,
  entityId: number | string,
  before?: unknown,
  after?: unknown,
  reason?: string,
) {
  try {
    const db = await getDbSafe();
    const { auditLogs } = await import("../../drizzle/schema");
    const numericId = typeof entityId === "string" ? parseInt(entityId, 10) || 0 : entityId;
    await db.insert(auditLogs).values({
      actorId: userId,
      actorType: "user",
      userId,
      action,
      entityType,
      entityId: numericId,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
      reason: reason ?? null,
    });
  } catch { /* non-critical */ }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))].join("\n");
}

// ─── Suppliers ────────────────────────────────────────────────────────────────
const supplierRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      activeOnly: z.boolean().default(false),
      limit: z.number().default(100),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: any[] = [];
      if (input.search) conds.push(like(suppliers.supplierName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(suppliers.isActive, true));
      const where = conds.length > 1 ? and(...conds) : conds[0];
      const rows = await db.select().from(suppliers).where(where).orderBy(suppliers.supplierName).limit(input.limit).offset(input.offset);
      return { rows, total: rows.length };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(suppliers).where(eq(suppliers.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      supplierName: z.string().min(1).max(300),
      gstin: z.string().max(20).optional(),
      address: z.string().optional(),
      state: z.string().max(100).optional(),
      contactPerson: z.string().max(200).optional(),
      phone: z.string().max(20).optional(),
      email: z.string().email().max(320).optional(),
      paymentTerms: z.string().max(100).optional(),
      defaultDiscount: z.string().default("0.00"),
      cashDiscount: z.string().default("0.00"),
      creditDays: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const [result] = await db.insert(suppliers).values({ ...input, isActive: true });
      const id = (result as { insertId: number }).insertId;
      await logAudit(ctx.user!.id, "create", "supplier", id, undefined, input);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      supplierName: z.string().min(1).max(300).optional(),
      gstin: z.string().max(20).optional(),
      address: z.string().optional(),
      state: z.string().max(100).optional(),
      contactPerson: z.string().max(200).optional(),
      phone: z.string().max(20).optional(),
      email: z.string().email().max(320).optional(),
      paymentTerms: z.string().max(100).optional(),
      defaultDiscount: z.string().optional(),
      cashDiscount: z.string().optional(),
      creditDays: z.number().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db.select().from(suppliers).where(eq(suppliers.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, reason, ...fields } = input;
      await db.update(suppliers).set(fields).where(eq(suppliers.id, id));
      await logAudit(ctx.user!.id, "update", "supplier", id, before, fields, reason);
      return { success: true };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db.select().from(suppliers).where(eq(suppliers.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(suppliers).set({ isActive: false }).where(eq(suppliers.id, input.id));
      await logAudit(ctx.user!.id, "deactivate", "supplier", input.id, before, { isActive: false }, input.reason);
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(suppliers).set({ isActive: true }).where(eq(suppliers.id, input.id));
      await logAudit(ctx.user!.id, "reactivate", "supplier", input.id);
      return { success: true };
    }),

  exportCsv: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const rows = await db.select().from(suppliers).orderBy(suppliers.supplierName);
      return toCsv(rows as Record<string, unknown>[]);
    }),
});

// ─── Manufacturers ────────────────────────────────────────────────────────────────
const manufacturerRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      activeOnly: z.boolean().default(false),
      limit: z.number().default(200),
    }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: any[] = [];
      if (input.search) conds.push(like(manufacturers.companyName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(manufacturers.isActive, true));
      const where = conds.length > 1 ? and(...conds) : conds[0];
      const rows = await db.select().from(manufacturers).where(where).orderBy(manufacturers.companyName).limit(input.limit);
      return { rows, total: rows.length };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(manufacturers).where(eq(manufacturers.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      companyName: z.string().min(1).max(300),
      aliases: z.string().optional(),
      gstin: z.string().max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const [result] = await db.insert(manufacturers).values({ ...input, isActive: true });
      const id = (result as { insertId: number }).insertId;
      await logAudit(ctx.user!.id, "create", "manufacturer", id, undefined, input);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      companyName: z.string().min(1).max(300).optional(),
      aliases: z.string().optional(),
      gstin: z.string().max(20).optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db.select().from(manufacturers).where(eq(manufacturers.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, reason, ...fields } = input;
      await db.update(manufacturers).set(fields).where(eq(manufacturers.id, id));
      await logAudit(ctx.user!.id, "update", "manufacturer", id, before, fields, reason);
      return { success: true };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db.select().from(manufacturers).where(eq(manufacturers.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(manufacturers).set({ isActive: false }).where(eq(manufacturers.id, input.id));
      await logAudit(ctx.user!.id, "deactivate", "manufacturer", input.id, before, { isActive: false }, input.reason);
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(manufacturers).set({ isActive: true }).where(eq(manufacturers.id, input.id));
      await logAudit(ctx.user!.id, "reactivate", "manufacturer", input.id);
      return { success: true };
    }),

  exportCsv: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const rows = await db.select().from(manufacturers).orderBy(manufacturers.companyName);
      return toCsv(rows as Record<string, unknown>[]);
    }),
});

// ─── Drug Categories ──────────────────────────────────────────────────────────
const categoryRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      activeOnly: z.boolean().default(false),
      limit: z.number().default(200),
    }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: any[] = [];
      if (input.search) conds.push(like(drugCategories.categoryName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(drugCategories.isActive, true));
      const where = conds.length > 1 ? and(...conds) : conds[0];
      const rows = await db.select().from(drugCategories).where(where).orderBy(drugCategories.categoryName).limit(input.limit);
      return { rows, total: rows.length };
    }),

  create: protectedProcedure
    .input(z.object({
      categoryName: z.string().min(1).max(200),
      parentCategoryId: z.number().optional(),
      marginPolicy: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const [result] = await db.insert(drugCategories).values({ ...input, isActive: true });
      const id = (result as { insertId: number }).insertId;
      await logAudit(ctx.user!.id, "create", "drug_category", id, undefined, input);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      categoryName: z.string().min(1).max(200).optional(),
      parentCategoryId: z.number().optional(),
      marginPolicy: z.string().optional(),
      description: z.string().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db.select().from(drugCategories).where(eq(drugCategories.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, reason, ...fields } = input;
      await db.update(drugCategories).set(fields).where(eq(drugCategories.id, id));
      await logAudit(ctx.user!.id, "update", "drug_category", id, before, fields, reason);
      return { success: true };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db.select().from(drugCategories).where(eq(drugCategories.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(drugCategories).set({ isActive: false }).where(eq(drugCategories.id, input.id));
      await logAudit(ctx.user!.id, "deactivate", "drug_category", input.id, before, { isActive: false }, input.reason);
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(drugCategories).set({ isActive: true }).where(eq(drugCategories.id, input.id));
      await logAudit(ctx.user!.id, "reactivate", "drug_category", input.id);
      return { success: true };
    }),

  exportCsv: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const rows = await db.select().from(drugCategories).orderBy(drugCategories.categoryName);
      return toCsv(rows as Record<string, unknown>[]);
    }),
});

// ─── Generics ─────────────────────────────────────────────────────────────────
const genericRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      activeOnly: z.boolean().default(false),
      limit: z.number().default(200),
    }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: any[] = [];
      if (input.search) conds.push(like(generics.genericName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(generics.isActive, true));
      const where = conds.length > 1 ? and(...conds) : conds[0];
      const rows = await db.select().from(generics).where(where).orderBy(generics.genericName).limit(input.limit);
      return { rows, total: rows.length };
    }),

  create: protectedProcedure
    .input(z.object({
      genericName: z.string().min(1).max(300),
      aliases: z.string().optional(),
      therapeuticClass: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const [result] = await db.insert(generics).values({ ...input, isActive: true });
      const id = (result as { insertId: number }).insertId;
      await logAudit(ctx.user!.id, "create", "generic", id, undefined, input);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      genericName: z.string().min(1).max(300).optional(),
      aliases: z.string().optional(),
      therapeuticClass: z.string().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db.select().from(generics).where(eq(generics.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, reason, ...fields } = input;
      await db.update(generics).set(fields).where(eq(generics.id, id));
      await logAudit(ctx.user!.id, "update", "generic", id, before, fields, reason);
      return { success: true };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db.select().from(generics).where(eq(generics.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(generics).set({ isActive: false }).where(eq(generics.id, input.id));
      await logAudit(ctx.user!.id, "deactivate", "generic", input.id, before, { isActive: false }, input.reason);
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(generics).set({ isActive: true }).where(eq(generics.id, input.id));
      await logAudit(ctx.user!.id, "reactivate", "generic", input.id);
      return { success: true };
    }),

  exportCsv: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const rows = await db.select().from(generics).orderBy(generics.genericName);
      return toCsv(rows as Record<string, unknown>[]);
    }),
});

// ─── Doctors ──────────────────────────────────────────────────────────────────
const doctorRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { doctors } = await import("../../drizzle/schema");
      const { like } = await import("drizzle-orm");
      const where = input.search ? like(doctors.doctorName, `%${input.search}%`) : undefined;
      return db.select().from(doctors).where(where).orderBy(doctors.doctorName).limit(input.limit);
    }),

  create: protectedProcedure
    .input(z.object({
      doctorName: z.string().min(1),
      registrationNo: z.string().optional(),
      clinicHospital: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      specialization: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { doctors } = await import("../../drizzle/schema");
      const [result] = await db.insert(doctors).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: z.object({
      doctorName: z.string().optional(),
      registrationNo: z.string().optional(),
      clinicHospital: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      specialization: z.string().optional(),
      isActive: z.boolean().optional(),
    }) }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { doctors } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(doctors).set(input.data).where(eq(doctors.id, input.id));
      return { success: true };
    }),
});

// ─── Schedule Master ──────────────────────────────────────────────────────────
const scheduleRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireStaff(ctx.user!.role);
    const db = await getDbSafe();
    const { scheduleMaster } = await import("../../drizzle/schema");
    return db.select().from(scheduleMaster).orderBy(scheduleMaster.scheduleCode);
  }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      scheduleCode: z.string().min(1),
      prescriptionRequired: z.boolean().default(false),
      pharmacistReviewRequired: z.boolean().default(false),
      h1RegisterRequired: z.boolean().default(false),
      repeatDispenseAllowed: z.boolean().default(true),
      retentionPolicyDays: z.number().default(365),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { scheduleMaster } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        await db.update(scheduleMaster).set(input).where(eq(scheduleMaster.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(scheduleMaster).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { scheduleMaster } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(scheduleMaster).set({ isActive: false }).where(eq(scheduleMaster.id, input.id));
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { scheduleMaster } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(scheduleMaster).set({ isActive: true }).where(eq(scheduleMaster.id, input.id));
      return { success: true };
    }),
});

// ─── Discount Categories ──────────────────────────────────────────────────────
const discountCategoryRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      activeOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: any[] = [];
      if (input.search) conds.push(like(discountCategories.categoryName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(discountCategories.isActive, true));
      const where = conds.length > 1 ? and(...conds) : conds[0];
      return db.select().from(discountCategories).where(where).orderBy(discountCategories.categoryName);
    }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      categoryName: z.string().min(1),
      maxDiscount: z.string().default("0.00"),
      minMargin: z.string().default("0.00"),
      roleOverrideRequired: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        const { id, ...fields } = input;
        await db.update(discountCategories).set(fields).where(eq(discountCategories.id, id));
        return { id };
      }
      const [result] = await db.insert(discountCategories).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(discountCategories).set({ isActive: false }).where(eq(discountCategories.id, input.id));
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(discountCategories).set({ isActive: true }).where(eq(discountCategories.id, input.id));
      return { success: true };
    }),

  exportCsv: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const rows = await db.select().from(discountCategories).orderBy(discountCategories.categoryName);
      return toCsv(rows as Record<string, unknown>[]);
    }),
});

// ─── Message Templates ────────────────────────────────────────────────────────
const messageTemplateRouter = router({
  list: protectedProcedure
    .input(z.object({ channel: z.enum(["whatsapp", "sms", "email", "app"]).optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { messageTemplates } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const where = input.channel ? eq(messageTemplates.channel, input.channel) : undefined;
      return db.select().from(messageTemplates).where(where).orderBy(messageTemplates.templateName);
    }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      templateName: z.string().min(1),
      channel: z.enum(["whatsapp", "sms", "email", "app"]),
      messageBody: z.string().min(1),
      variables: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { messageTemplates } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        await db.update(messageTemplates).set(input).where(eq(messageTemplates.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(messageTemplates).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),
});

// ─── Financial Years ──────────────────────────────────────────────────────────
const financialYearRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireStaff(ctx.user!.role);
    const db = await getDbSafe();
    const { financialYears } = await import("../../drizzle/schema");
    const { desc } = await import("drizzle-orm");
    return db.select().from(financialYears).orderBy(desc(financialYears.startDate));
  }),

  create: protectedProcedure
    .input(z.object({
      yearLabel: z.string().min(1),
      startDate: z.date(),
      endDate: z.date(),
      isCurrent: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "super_admin"].includes(ctx.user!.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      const db = await getDbSafe();
      const { financialYears } = await import("../../drizzle/schema");
      const [result] = await db.insert(financialYears).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),

  lock: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "super_admin"].includes(ctx.user!.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
      }
      const db = await getDbSafe();
      const { financialYears } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(financialYears).set({ isLocked: true }).where(eq(financialYears.id, input.id));
      return { success: true };
    }),
});

// ─── States ───────────────────────────────────────────────────────────────────
const stateRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireStaff(ctx.user!.role);
    const db = await getDbSafe();
    const { states } = await import("../../drizzle/schema");
    return db.select().from(states).orderBy(states.stateName);
  }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      stateName: z.string().min(1),
      stateCode: z.string().min(1),
      gstStateCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { states } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        await db.update(states).set(input).where(eq(states.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(states).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),
});

// ─── Printers ─────────────────────────────────────────────────────────────────
const printerRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireStaff(ctx.user!.role);
    const db = await getDbSafe();
    const { printers } = await import("../../drizzle/schema");
    return db.select().from(printers).orderBy(printers.printerName);
  }),

  upsert: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      printerName: z.string().min(1),
      printerType: z.enum(["bill", "barcode", "a4", "thermal"]),
      assignedTerminal: z.string().optional(),
      assignedStoreId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { printers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        await db.update(printers).set(input).where(eq(printers.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(printers).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),
});

// ─── Customer / User listing ─────────────────────────────────────────────────────
const customerListRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().int().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { users } = await import("../../drizzle/schema");
      const { like, or, desc } = await import("drizzle-orm");
      let where: any = undefined;
      if (input.search) {
        where = or(
          like(users.name, `%${input.search}%`),
          like(users.phone, `%${input.search}%`),
          like(users.email, `%${input.search}%`),
        );
      }
      return db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        createdAt: users.createdAt,
        lastSignedIn: users.lastSignedIn,
      })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(input.limit);
    }),
});

// ─── Compose masterDataRouter ─────────────────────────────────────────────────────
export const masterDataRouter = router({
  suppliers: supplierRouter,
  manufacturers: manufacturerRouter,
  categories: categoryRouter,
  generics: genericRouter,
  doctors: doctorRouter,
  schedules: scheduleRouter,
  discountCategories: discountCategoryRouter,
  messageTemplates: messageTemplateRouter,
  financialYears: financialYearRouter,
  states: stateRouter,
  printers: printerRouter,
  customers: customerListRouter,
});
