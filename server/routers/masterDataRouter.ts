/**
 * masterDataRouter.ts
 * CRUD procedures for all Pharmacy OS master data tables.
 * Access: store_manager | admin | super_admin | purchase_manager (varies by master)
 *
 * Large sub-routers live in dedicated files:
 *   masterDataSupplierRouter.ts     – supplierRouter
 *   masterDataManufacturerRouter.ts – manufacturerRouter
 *   masterDataCategoryRouter.ts     – categoryRouter
 *   masterDataGenericRouter.ts      – genericRouter
 * Shared helpers live in masterDataUtils.ts
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { ResultSetHeader } from "mysql2";
import type { SQL } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import {
  requireStaff,
  requireManager,
  getDbSafe,
  toCsv,
} from "./masterDataUtils";
import { supplierRouter } from "./masterDataSupplierRouter";
import { manufacturerRouter } from "./masterDataManufacturerRouter";
import { categoryRouter } from "./masterDataCategoryRouter";
import { genericRouter } from "./masterDataGenericRouter";

// ─── Doctors ──────────────────────────────────────────────────────────────────
const doctorRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { doctors } = await import("../../drizzle/schema");
      const { like } = await import("drizzle-orm");
      const where = input.search
        ? like(doctors.doctorName, `%${input.search}%`)
        : undefined;
      return db
        .select()
        .from(doctors)
        .where(where)
        .orderBy(doctors.doctorName)
        .limit(input.limit);
    }),

  create: protectedProcedure
    .input(
      z.object({
        doctorName: z.string().min(1),
        registrationNo: z.string().optional(),
        clinicHospital: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        specialization: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { doctors } = await import("../../drizzle/schema");
      const insertResult = await db.insert(doctors).values(input);
      return { id: (insertResult as unknown as [ResultSetHeader])[0].insertId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          doctorName: z.string().optional(),
          registrationNo: z.string().optional(),
          clinicHospital: z.string().optional(),
          phone: z.string().optional(),
          address: z.string().optional(),
          specialization: z.string().optional(),
          isActive: z.boolean().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
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
    requireStaff(ctx.user.role);
    const db = await getDbSafe();
    const { scheduleMaster } = await import("../../drizzle/schema");
    return db
      .select()
      .from(scheduleMaster)
      .orderBy(scheduleMaster.scheduleCode);
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        scheduleCode: z.string().min(1),
        prescriptionRequired: z.boolean().default(false),
        pharmacistReviewRequired: z.boolean().default(false),
        h1RegisterRequired: z.boolean().default(false),
        repeatDispenseAllowed: z.boolean().default(true),
        retentionPolicyDays: z.number().default(365),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { scheduleMaster } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        await db
          .update(scheduleMaster)
          .set(input)
          .where(eq(scheduleMaster.id, input.id));
        return { id: input.id };
      }
      const insertResult = await db.insert(scheduleMaster).values(input);
      return { id: (insertResult as unknown as [ResultSetHeader])[0].insertId };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { scheduleMaster } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(scheduleMaster)
        .set({ isActive: false })
        .where(eq(scheduleMaster.id, input.id));
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { scheduleMaster } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(scheduleMaster)
        .set({ isActive: true })
        .where(eq(scheduleMaster.id, input.id));
      return { success: true };
    }),
});

// ─── Discount Categories ──────────────────────────────────────────────────────
const discountCategoryRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        activeOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: SQL<unknown>[] = [];
      if (input.search)
        conds.push(like(discountCategories.categoryName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(discountCategories.isActive, true));
      const where: SQL<unknown> | undefined =
        conds.length > 1 ? and(...conds) : conds[0];
      return db
        .select()
        .from(discountCategories)
        .where(where)
        .orderBy(discountCategories.categoryName);
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        categoryName: z.string().min(1),
        maxDiscount: z.string().default("0.00"),
        minMargin: z.string().default("0.00"),
        roleOverrideRequired: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        const { id, ...fields } = input;
        await db
          .update(discountCategories)
          .set(fields)
          .where(eq(discountCategories.id, id));
        return { id };
      }
      const insertResult = await db.insert(discountCategories).values(input);
      return { id: (insertResult as unknown as [ResultSetHeader])[0].insertId };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(discountCategories)
        .set({ isActive: false })
        .where(eq(discountCategories.id, input.id));
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(discountCategories)
        .set({ isActive: true })
        .where(eq(discountCategories.id, input.id));
      return { success: true };
    }),

  exportCsv: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { discountCategories } = await import("../../drizzle/schema");
      const rows = await db
        .select()
        .from(discountCategories)
        .orderBy(discountCategories.categoryName);
      return toCsv(rows);
    }),
});

// ─── Message Templates ────────────────────────────────────────────────────────
const messageTemplateRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        channel: z.enum(["whatsapp", "sms", "email", "app"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { messageTemplates } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const where = input.channel
        ? eq(messageTemplates.channel, input.channel)
        : undefined;
      return db
        .select()
        .from(messageTemplates)
        .where(where)
        .orderBy(messageTemplates.templateName);
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        templateName: z.string().min(1),
        channel: z.enum(["whatsapp", "sms", "email", "app"]),
        messageBody: z.string().min(1),
        variables: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { messageTemplates } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        await db
          .update(messageTemplates)
          .set(input)
          .where(eq(messageTemplates.id, input.id));
        return { id: input.id };
      }
      const insertResult = await db.insert(messageTemplates).values(input);
      return { id: (insertResult as unknown as [ResultSetHeader])[0].insertId };
    }),
});

// ─── Financial Years ──────────────────────────────────────────────────────────
const financialYearRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireStaff(ctx.user.role);
    const db = await getDbSafe();
    const { financialYears } = await import("../../drizzle/schema");
    const { desc } = await import("drizzle-orm");
    return db
      .select()
      .from(financialYears)
      .orderBy(desc(financialYears.startDate));
  }),

  create: protectedProcedure
    .input(
      z.object({
        yearLabel: z.string().min(1),
        startDate: z.date(),
        endDate: z.date(),
        isCurrent: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "super_admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required.",
        });
      }
      const db = await getDbSafe();
      const { financialYears } = await import("../../drizzle/schema");
      const insertResult = await db.insert(financialYears).values(input);
      return { id: (insertResult as unknown as [ResultSetHeader])[0].insertId };
    }),

  lock: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!["admin", "super_admin"].includes(ctx.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Admin access required.",
        });
      }
      const db = await getDbSafe();
      const { financialYears } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(financialYears)
        .set({ isLocked: true })
        .where(eq(financialYears.id, input.id));
      return { success: true };
    }),
});

// ─── States ───────────────────────────────────────────────────────────────────
const stateRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireStaff(ctx.user.role);
    const db = await getDbSafe();
    const { states } = await import("../../drizzle/schema");
    return db.select().from(states).orderBy(states.stateName);
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        stateName: z.string().min(1),
        stateCode: z.string().min(1),
        gstStateCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { states } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      if (input.id) {
        await db.update(states).set(input).where(eq(states.id, input.id));
        return { id: input.id };
      }
      const insertResult = await db.insert(states).values(input);
      return { id: (insertResult as unknown as [ResultSetHeader])[0].insertId };
    }),
});

import { masterDataRouterExtension } from "./masterDataRefRouter";

// ─── Compose masterDataRouter ─────────────────────────────────────────────────
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
  ...masterDataRouterExtension,
});
