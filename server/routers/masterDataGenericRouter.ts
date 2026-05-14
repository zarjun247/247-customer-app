/**
 * masterDataGenericRouter.ts
 * CRUD procedures for generics master data.
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

export const genericRouter = router({
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
      const { generics } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: SQL<unknown>[] = [];
      if (input.search)
        conds.push(like(generics.genericName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(generics.isActive, true));
      const where: SQL<unknown> | undefined =
        conds.length > 1 ? and(...conds) : conds[0];
      const rows = await db
        .select()
        .from(generics)
        .where(where)
        .orderBy(generics.genericName)
        .limit(input.limit);
      return { rows, total: rows.length };
    }),

  create: protectedProcedure
    .input(
      z.object({
        genericName: z.string().min(1).max(300),
        aliases: z.string().optional(),
        therapeuticClass: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const insertResult = await db
        .insert(generics)
        .values({ ...input, isActive: true });
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.generic.create",
          entityType: "generic",
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
        genericName: z.string().min(1).max(300).optional(),
        aliases: z.string().optional(),
        therapeuticClass: z.string().optional(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { generics } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db
        .select()
        .from(generics)
        .where(eq(generics.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, reason, ...fields } = input;
      await db.update(generics).set(fields).where(eq(generics.id, id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.generic.update",
          entityType: "generic",
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
      const { generics } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db
        .select()
        .from(generics)
        .where(eq(generics.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(generics)
        .set({ isActive: false })
        .where(eq(generics.id, input.id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.generic.deactivate",
          entityType: "generic",
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
      const { generics } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(generics)
        .set({ isActive: true })
        .where(eq(generics.id, input.id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.generic.reactivate",
          entityType: "generic",
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
      const { generics } = await import("../../drizzle/schema");
      const rows = await db
        .select()
        .from(generics)
        .orderBy(generics.genericName);
      return toCsv(rows);
    }),
});
