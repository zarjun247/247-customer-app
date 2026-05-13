import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { commandOutbox } from "../../drizzle/schema";
import { getRegisteredKinds } from "../services/outboxDispatcher";

const listInput = z.object({
  limit: z.number().min(1).max(200).default(50),
  offset: z.number().min(0).default(0),
});

export const outboxRouter = router({
  pending: adminProcedure.input(listInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { records: [], total: 0 };
    const rows = await db
      .select()
      .from(commandOutbox)
      .where(eq(commandOutbox.state, "pending"))
      .orderBy(desc(commandOutbox.createdAt))
      .limit(input.limit)
      .offset(input.offset);
    return { records: rows };
  }),

  dispatched: adminProcedure.input(listInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { records: [], total: 0 };
    const rows = await db
      .select()
      .from(commandOutbox)
      .where(eq(commandOutbox.state, "dispatched"))
      .orderBy(desc(commandOutbox.dispatchedAt))
      .limit(input.limit)
      .offset(input.offset);
    return { records: rows };
  }),

  failed: adminProcedure.input(listInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { records: [], total: 0 };
    const rows = await db
      .select()
      .from(commandOutbox)
      .where(eq(commandOutbox.state, "failed"))
      .orderBy(desc(commandOutbox.failedAt))
      .limit(input.limit)
      .offset(input.offset);
    return { records: rows };
  }),

  retry: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB unavailable",
        });
      const rows = await db
        .select()
        .from(commandOutbox)
        .where(eq(commandOutbox.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Outbox row not found",
        });
      if (row.state !== "failed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Row is in state "${row.state}", not "failed"`,
        });
      }
      await db
        .update(commandOutbox)
        .set({ state: "pending", nextAttemptAt: new Date(), failedAt: null })
        .where(eq(commandOutbox.id, input.id));
      return { success: true };
    }),

  kinds: adminProcedure.query(() => {
    return { kinds: getRegisteredKinds() };
  }),
});
