import { z } from "zod";
import { router, adminProcedure, superAdminProcedure } from "../_core/trpc";
import { getKeyStatus, rotateKey } from "../services/piiEncryption";
import {
  verifyChain,
  getChainStats,
  appendChainedAudit,
} from "../services/auditHashChain";
import {
  grantCapability,
  revokeCapability,
  getUserCapabilities,
  listGrants,
  getCapabilityDefinitions,
} from "../services/capabilityGrantService";
import { PROCEDURE_RATE_LIMITS } from "../middleware/rateLimitWiring";
import { parseCspMode } from "../middleware/cspEnforcer";

export const securityRouter = router({
  // ─── PII encryption key management ──────────────────────────────────────────

  piiKeyStatus: adminProcedure.query(async () => {
    return getKeyStatus();
  }),

  piiRotateKey: superAdminProcedure
    .input(z.object({ scope: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const result = await rotateKey(input.scope);
      await appendChainedAudit({
        action: "pii.key.rotated",
        entityType: "pii_encryption_key",
        entityId: input.scope,
        actorUserId: ctx.user?.id ?? null,
        afterJson: result,
      });
      return result;
    }),

  // ─── Audit hash chain ────────────────────────────────────────────────────────

  auditChainStats: adminProcedure.query(async () => {
    return getChainStats();
  }),

  auditChainVerify: adminProcedure
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
      return verifyChain(input ?? {});
    }),

  // ─── Capability grants ───────────────────────────────────────────────────────

  capabilityDefinitions: adminProcedure.query(async () => {
    return getCapabilityDefinitions();
  }),

  getUserCapabilities: adminProcedure
    .input(z.object({ userId: z.union([z.string(), z.number()]) }))
    .query(async ({ input }) => {
      return getUserCapabilities(input.userId);
    }),

  listGrants: adminProcedure
    .input(
      z
        .object({
          userId: z.union([z.string(), z.number()]).optional(),
          capabilityName: z.string().optional(),
          includeRevoked: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return listGrants(input ?? {});
    }),

  grantCapability: superAdminProcedure
    .input(
      z.object({
        userId: z.union([z.string(), z.number()]),
        capabilityName: z.string().min(1).max(128),
        expiresAt: z.string().datetime().optional(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return grantCapability({
        userId: input.userId,
        capabilityName: input.capabilityName,
        grantedByUserId: ctx.user?.id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        reason: input.reason,
      });
    }),

  revokeCapability: superAdminProcedure
    .input(
      z.object({
        userId: z.union([z.string(), z.number()]),
        capabilityName: z.string().min(1).max(128),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return revokeCapability({
        userId: input.userId,
        capabilityName: input.capabilityName,
        revokedByUserId: ctx.user?.id,
        reason: input.reason,
      });
    }),

  // ─── Rate limit config (read-only view) ──────────────────────────────────────

  rateLimitConfig: adminProcedure.query(() => {
    return Array.from(PROCEDURE_RATE_LIMITS.entries()).map(
      ([procedure, policy]) => ({
        procedure,
        windowMs: policy.windowMs,
        max: policy.max,
        blockMs: policy.blockMs ?? null,
      })
    );
  }),

  // ─── CSP mode status ─────────────────────────────────────────────────────────

  cspStatus: adminProcedure.query(() => {
    return {
      mode: parseCspMode(process.env.CSP_MODE),
      reportUri: process.env.CSP_REPORT_URI ?? null,
    };
  }),
});
