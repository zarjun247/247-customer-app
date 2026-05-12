import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { assertPhaseAtLeast } from "../services/featureFlags";
import {
  appendSuggestion,
  recordOutcome,
  verifyChain,
  getStats,
  listSuggestions,
} from "../services/aiEvalLedger";
import { ENV } from "../_core/env";

export const aiEvalRouter = router({
  // ─── Append suggestion (advisory output from intelligence services) ───────────

  append: adminProcedure
    .input(
      z.object({
        suggestionKind: z.string().min(1).max(100),
        scopeType: z.enum(["customer", "product", "store", "global"]),
        scopeId: z.string().nullable().optional(),
        inputSnapshot: z.unknown(),
        outputPayload: z.unknown(),
        modelVersion: z.string().min(1).max(100),
        traceId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertPhaseAtLeast("scaled", "AI Eval Ledger: append");
      if (!ENV.aiEvalLedgerEnabled) {
        return { sequenceNumber: -1, rowHash: "", ledgerId: -1, skipped: true };
      }
      return appendSuggestion({
        suggestionKind: input.suggestionKind,
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? null,
        inputSnapshot: input.inputSnapshot,
        outputPayload: input.outputPayload,
        modelVersion: input.modelVersion,
        generatedByUserId: ctx.user?.id != null ? String(ctx.user.id) : null,
        traceId: input.traceId ?? null,
      });
    }),

  // ─── Record human outcome on a suggestion ────────────────────────────────────

  recordOutcome: adminProcedure
    .input(
      z.object({
        evalLedgerId: z.number().int().min(1),
        outcomeKind: z.enum([
          "accepted",
          "rejected",
          "ignored",
          "modified",
          "outcome_realized",
        ]),
        outcomePayload: z.unknown().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertPhaseAtLeast("scaled", "AI Eval Ledger: recordOutcome");
      await recordOutcome({
        evalLedgerId: input.evalLedgerId,
        outcomeKind: input.outcomeKind,
        outcomePayload: input.outcomePayload,
        recordedByUserId: ctx.user?.id != null ? String(ctx.user.id) : null,
      });
      return { ok: true };
    }),

  // ─── Ledger management (admin-only) ──────────────────────────────────────────

  stats: adminProcedure.query(async () => {
    assertPhaseAtLeast("scaled", "AI Eval Ledger: stats");
    return getStats();
  }),

  verify: adminProcedure
    .input(
      z
        .object({
          fromSequence: z.number().int().min(0).optional(),
          toSequence: z.number().int().min(0).optional(),
          maxRows: z.number().int().min(1).max(100_000).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      assertPhaseAtLeast("scaled", "AI Eval Ledger: verify");
      return verifyChain(input ?? {});
    }),

  list: adminProcedure
    .input(
      z
        .object({
          suggestionKind: z.string().optional(),
          scopeType: z.string().optional(),
          scopeId: z.string().optional(),
          limit: z.number().int().min(1).max(200).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      assertPhaseAtLeast("scaled", "AI Eval Ledger: list");
      return listSuggestions(input ?? {});
    }),
});
