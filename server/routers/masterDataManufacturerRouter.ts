/**
 * masterDataManufacturerRouter.ts
 * CRUD procedures for manufacturers master data.
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

export const manufacturerRouter = router({
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
      const { manufacturers } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: SQL<unknown>[] = [];
      if (input.search)
        conds.push(like(manufacturers.companyName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(manufacturers.isActive, true));
      const where: SQL<unknown> | undefined =
        conds.length > 1 ? and(...conds) : conds[0];
      const rows = await db
        .select()
        .from(manufacturers)
        .where(where)
        .orderBy(manufacturers.companyName)
        .limit(input.limit);
      return { rows, total: rows.length };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .select()
        .from(manufacturers)
        .where(eq(manufacturers.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(
      z.object({
        companyName: z.string().min(1).max(300),
        aliases: z.string().optional(),
        gstin: z.string().max(20).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const insertResult = await db
        .insert(manufacturers)
        .values({ ...input, isActive: true });
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.manufacturer.create",
          entityType: "manufacturer",
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
        companyName: z.string().min(1).max(300).optional(),
        aliases: z.string().optional(),
        gstin: z.string().max(20).optional(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { manufacturers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db
        .select()
        .from(manufacturers)
        .where(eq(manufacturers.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, reason, ...fields } = input;
      await db
        .update(manufacturers)
        .set(fields)
        .where(eq(manufacturers.id, id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.manufacturer.update",
          entityType: "manufacturer",
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
      const { manufacturers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db
        .select()
        .from(manufacturers)
        .where(eq(manufacturers.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(manufacturers)
        .set({ isActive: false })
        .where(eq(manufacturers.id, input.id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.manufacturer.deactivate",
          entityType: "manufacturer",
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
      const { manufacturers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(manufacturers)
        .set({ isActive: true })
        .where(eq(manufacturers.id, input.id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.manufacturer.reactivate",
          entityType: "manufacturer",
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
      const { manufacturers } = await import("../../drizzle/schema");
      const rows = await db
        .select()
        .from(manufacturers)
        .orderBy(manufacturers.companyName);
      return toCsv(rows);
    }),
});
