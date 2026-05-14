/**
 * masterDataSupplierRouter.ts
 * CRUD procedures for suppliers master data.
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

export const supplierRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        activeOnly: z.boolean().default(false),
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { like, and, eq } = await import("drizzle-orm");
      const conds: SQL<unknown>[] = [];
      if (input.search)
        conds.push(like(suppliers.supplierName, `%${input.search}%`));
      if (input.activeOnly) conds.push(eq(suppliers.isActive, true));
      const where: SQL<unknown> | undefined =
        conds.length > 1 ? and(...conds) : conds[0];
      const rows = await db
        .select()
        .from(suppliers)
        .where(where)
        .orderBy(suppliers.supplierName)
        .limit(input.limit)
        .offset(input.offset);
      return { rows, total: rows.length };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.user.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(
      z.object({
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const insertResult = await db
        .insert(suppliers)
        .values({ ...input, isActive: true });
      const id = (insertResult as unknown as [ResultSetHeader])[0].insertId;
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.supplier.create",
          entityType: "supplier",
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.user.role);
      const db = await getDbSafe();
      const { suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, reason, ...fields } = input;
      await db.update(suppliers).set(fields).where(eq(suppliers.id, id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.supplier.update",
          entityType: "supplier",
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
      const { suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [before] = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, input.id));
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(suppliers)
        .set({ isActive: false })
        .where(eq(suppliers.id, input.id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.supplier.deactivate",
          entityType: "supplier",
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
      const { suppliers } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(suppliers)
        .set({ isActive: true })
        .where(eq(suppliers.id, input.id));
      await logAudit(
        {
          actorId: ctx.user.id,
          actorType: "user",
          action: "master.supplier.reactivate",
          entityType: "supplier",
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
      const { suppliers } = await import("../../drizzle/schema");
      const rows = await db
        .select()
        .from(suppliers)
        .orderBy(suppliers.supplierName);
      return toCsv(rows);
    }),
});
