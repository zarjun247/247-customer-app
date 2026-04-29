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

async function logAudit(userId: number, detail: string) {
  try {
    const db = await getDbSafe();
    const { auditLogs } = await import("../../drizzle/schema");
    await db.insert(auditLogs).values({
      userId,
      action: "update",
      entityType: "master_data",
      payload: detail,
    });
  } catch { /* non-critical */ }
}

// ─── Suppliers ────────────────────────────────────────────────────────────────
const supplierRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { like } = await import("drizzle-orm");
      const where = input.search ? like(suppliers.supplierName, `%${input.search}%`) : undefined;
      return db.select().from(suppliers).where(where).orderBy(suppliers.supplierName).limit(input.limit).offset(input.offset);
    }),

  create: protectedProcedure
    .input(z.object({
      supplierName: z.string().min(1),
      gstin: z.string().optional(),
      address: z.string().optional(),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      paymentTerms: z.string().optional(),
      defaultDiscount: z.string().optional(),
      cashDiscount: z.string().optional(),
      creditDays: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const [result] = await db.insert(suppliers).values({ ...input });
      const id = (result as { insertId: number }).insertId;
      await logAudit(ctx.user!.id, `Created supplier: ${input.supplierName}`);
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: z.object({
      supplierName: z.string().optional(),
      gstin: z.string().optional(),
      address: z.string().optional(),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      paymentTerms: z.string().optional(),
      defaultDiscount: z.string().optional(),
      cashDiscount: z.string().optional(),
      creditDays: z.number().optional(),
      isActive: z.boolean().optional(),
    }) }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(suppliers).set(input.data).where(eq(suppliers.id, input.id));
      await logAudit(ctx.user!.id, `Updated supplier #${input.id}`);
      return { success: true };
    }),
});

// ─── Manufacturers ────────────────────────────────────────────────────────────
const manufacturerRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const { like } = await import("drizzle-orm");
      const where = input.search ? like(manufacturers.companyName, `%${input.search}%`) : undefined;
      return db.select().from(manufacturers).where(where).orderBy(manufacturers.companyName).limit(input.limit);
    }),

  create: protectedProcedure
    .input(z.object({ companyName: z.string().min(1), aliases: z.string().optional(), gstin: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const [result] = await db.insert(manufacturers).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: z.object({
      companyName: z.string().optional(),
      aliases: z.string().optional(),
      gstin: z.string().optional(),
      isActive: z.boolean().optional(),
    }) }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(manufacturers).set(input.data).where(eq(manufacturers.id, input.id));
      return { success: true };
    }),
});

// ─── Generics ─────────────────────────────────────────────────────────────────
const genericRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user!.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const { like } = await import("drizzle-orm");
      const where = input.search ? like(generics.genericName, `%${input.search}%`) : undefined;
      return db.select().from(generics).where(where).orderBy(generics.genericName).limit(input.limit);
    }),

  create: protectedProcedure
    .input(z.object({ genericName: z.string().min(1), aliases: z.string().optional(), therapeuticClass: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const [result] = await db.insert(generics).values(input);
      return { id: (result as { insertId: number }).insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), data: z.object({
      genericName: z.string().optional(),
      aliases: z.string().optional(),
      therapeuticClass: z.string().optional(),
      isActive: z.boolean().optional(),
    }) }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user!.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(generics).set(input.data).where(eq(generics.id, input.id));
      return { success: true };
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
});

// ─── Discount Categories ──────────────────────────────────────────────────────
const discountCategoryRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireStaff(ctx.user!.role);
    const db = await getDbSafe();
    const { discountCategories } = await import("../../drizzle/schema");
    return db.select().from(discountCategories).orderBy(discountCategories.categoryName);
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
        await db.update(discountCategories).set(input).where(eq(discountCategories.id, input.id));
        return { id: input.id };
      }
      const [result] = await db.insert(discountCategories).values(input);
      return { id: (result as { insertId: number }).insertId };
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
      await db.update(financialYears).set({ isLocked: true, lockedAt: new Date(), lockedBy: ctx.user!.id }).where(eq(financialYears.id, input.id));
      await logAudit(ctx.user!.id, `Locked financial year #${input.id}`);
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