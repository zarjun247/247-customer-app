import { z } from "zod";
import { adminProcedure, router, capabilityProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, writeAuditLog } from "../db";
import { providerDeadLetters } from "../../drizzle/schema";
import { escalate } from "../services/onCallRota";

export const deadLetterRouter = router({
  list: adminProcedure
    .input(
      z.object({
        providerType: z.string().optional(),
        reviewStatus: z.enum(["pending_review", "resolved", "replayed"]).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], count: 0 };

      const conditions = [
        input.providerType ? eq(providerDeadLetters.provider, input.providerType) : undefined,
        input.reviewStatus ? eq(providerDeadLetters.reviewStatus, input.reviewStatus) : undefined,
      ].filter(Boolean);

      const [rows, countRows] = await Promise.all([
        db
          .select()
          .from(providerDeadLetters)
          .where(conditions.length > 0 ? and(...(conditions as any[])) : undefined)
          .orderBy(desc(providerDeadLetters.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(providerDeadLetters)
          .where(conditions.length > 0 ? and(...(conditions as any[])) : undefined),
      ]);

      return { rows, count: Number(countRows[0]?.count ?? 0) };
    }),

  retry: adminProcedure
    .input(z.object({ deadLetterId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db
        .select()
        .from(providerDeadLetters)
        .where(eq(providerDeadLetters.id, input.deadLetterId))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Dead letter not found" });
      if (existing.reviewStatus === "resolved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dead letter already resolved" });
      }

      const before = { reviewStatus: existing.reviewStatus };

      // Use "replayed" to mark retry in progress (no "retrying" value in current enum).
      // Future: convert to worker-based retry (see OPEN_BLOCKERS.md).
      await db
        .update(providerDeadLetters)
        .set({
          reviewStatus: "replayed",
          reviewedBy: String(ctx.user.id),
          reviewedAt: new Date(),
          reviewNote: "retry_initiated_by_operator",
        })
        .where(eq(providerDeadLetters.id, input.deadLetterId));

      await writeAuditLog({
        actor: { id: ctx.user.id, role: ctx.user.role },
        action: "dead_letter.retry",
        entityType: "provider_dead_letter",
        entityId: input.deadLetterId,
        before,
        after: { reviewStatus: "replayed" },
        reason: "operator_retry",
        channel: "admin",
      });

      return { success: true, reviewStatus: "replayed" as const };
    }),

  resolve: adminProcedure
    .input(
      z.object({
        deadLetterId: z.number().int(),
        resolutionNotes: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db
        .select()
        .from(providerDeadLetters)
        .where(eq(providerDeadLetters.id, input.deadLetterId))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Dead letter not found" });

      const before = { reviewStatus: existing.reviewStatus, reviewNote: existing.reviewNote };

      await db
        .update(providerDeadLetters)
        .set({
          reviewStatus: "resolved",
          reviewedBy: String(ctx.user.id),
          reviewedAt: new Date(),
          reviewNote: input.resolutionNotes,
        })
        .where(eq(providerDeadLetters.id, input.deadLetterId));

      await writeAuditLog({
        actor: { id: ctx.user.id, role: ctx.user.role },
        action: "dead_letter.resolved",
        entityType: "provider_dead_letter",
        entityId: input.deadLetterId,
        before,
        after: { reviewStatus: "resolved", resolutionNotes: input.resolutionNotes },
        reason: input.resolutionNotes,
        channel: "admin",
      });

      return { success: true, reviewStatus: "resolved" as const };
    }),

  escalate: capabilityProcedure("chaos.trigger")
    .input(
      z.object({
        deadLetterId: z.number().int(),
        severity: z.enum(["P0", "P1", "P2"]).default("P1"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [existing] = await db
        .select()
        .from(providerDeadLetters)
        .where(eq(providerDeadLetters.id, input.deadLetterId))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Dead letter not found" });

      const before = { reviewStatus: existing.reviewStatus };

      await db
        .update(providerDeadLetters)
        .set({
          reviewStatus: "resolved",
          reviewedBy: String(ctx.user.id),
          reviewedAt: new Date(),
          reviewNote: `escalated:${input.severity}:operator=${ctx.user.id}`,
        })
        .where(eq(providerDeadLetters.id, input.deadLetterId));

      await writeAuditLog({
        actor: { id: ctx.user.id, role: ctx.user.role },
        action: "dead_letter.escalated",
        entityType: "provider_dead_letter",
        entityId: input.deadLetterId,
        before,
        after: { reviewStatus: "resolved", escalationSeverity: input.severity },
        reason: `escalated to on-call (${input.severity})`,
        channel: "admin",
      });

      await escalate(input.severity, "provider_owner", {
        deadLetterId: input.deadLetterId,
        provider: existing.provider,
        eventType: existing.eventType,
        deadLetterClass: existing.deadLetterClass,
        failureReason: existing.failureReason,
        escalatedBy: ctx.user.id,
      });

      return { success: true, severity: input.severity };
    }),
});
