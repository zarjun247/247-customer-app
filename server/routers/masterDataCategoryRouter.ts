/**
 * masterDataCategoryRouter.ts
 * CRUD procedures for drug categories master data.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import type { ResultSetHeader } from "mysql2";
import { logAudit } from "../services/audit";
import { router, protectedProcedure } from "../_core/trpc";
import {
  requireStaff,
  requireManager,
  getDbSafe,
  toCsv,
} from "./masterDataUtils";

export const categoryRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        activeOnly: z.boolean().default(false),
        limit: z.number().default(200),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: SQL<unknown>[] = [];
      if (input.search)
        conds.push(like(drugCategories.categoryName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(drugCategories.isActive, true));
      const where: SQL<unknown> | undefined =
        conds.length > 1 ? and(...conds) : conds[0];
      const rows = await db
        .select()
        .from(drugCategories)
        .where(where)
        .orderBy(drugCategories.categoryName)
        .limit(input.limit);
      return { rows, total: rows.length };
    }),

  create: protectedProcedure
    .input(
      z.object({
        categoryName: z.string().min(1).max(200),
        parentCategoryId: z.number().optional(),
        marginPolicy: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const insertResult = await db
        .insert(drugCategories)
        .values({ ...input, isActive: true });
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.drug_category.create",
          entityType: "drug_category",
          entityId: id,
          beforeJson: undefined,
          afterJson: input,
          source: "admin",
        },
        ctx
      ).catch(() => {});
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        categoryName: z.string().min(1).max(200).optional(),
        parentCategoryId: z.number().optional(),
        marginPolicy: z.string().optional(),
        description: z.string().optional(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db
        .select()
        .from(drugCategories)
        .where(eq(drugCategories.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, reason, ...fields } = input;
      await db
        .update(drugCategories)
        .set(fields)
        .where(eq(drugCategories.id, id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.drug_category.update",
          entityType: "drug_category",
          entityId: id,
          beforeJson: before,
          afterJson: fields,
          reason: reason ?? undefined,
          source: "admin",
        },
        ctx
      ).catch(() => {});
      return { success: true };
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db
        .select()
        .from(drugCategories)
        .where(eq(drugCategories.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(drugCategories)
        .set({ isActive: false })
        .where(eq(drugCategories.id, input.id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.drug_category.deactivate",
          entityType: "drug_category",
          entityId: input.id,
          beforeJson: before,
          afterJson: { isActive: false },
          reason: input.reason ?? undefined,
          source: "admin",
        },
        ctx
      ).catch(() => {});
      return { success: true };
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(drugCategories)
        .set({ isActive: true })
        .where(eq(drugCategories.id, input.id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.drug_category.reactivate",
          entityType: "drug_category",
          entityId: input.id,
          source: "admin",
        },
        ctx
      ).catch(() => {});
      return { success: true };
    }),

  exportCsv: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { drugCategories } = await import("../../drizzle/schema");
      const rows = await db
        .select()
        .from(drugCategories)
        .orderBy(drugCategories.categoryName);
      return toCsv(rows);
    }),
});
