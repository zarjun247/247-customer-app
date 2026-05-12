import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import * as dsrService from "../services/dsrService";
import { listNoticesForKind } from "../services/consentNoticeRegistry";
import {
  getActiveFamilyConsent,
  revokeFamilyConsent,
} from "../services/familyConsentService";
import { getDb } from "../db";
import { familyConsent } from "../../drizzle/schema";
import { desc } from "drizzle-orm";

export const dsrAdminRouter = router({
  // List DSR requests with optional status/kind filters
  list: adminProcedure
    .input(
      z.object({
        status: z.string().optional(),
        kind: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) =>
      dsrService.listDsrRequests({
        status: input.status,
        kind: input.kind,
        limit: input.limit,
      })
    ),

  // Get a single DSR request by ID
  get: adminProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ input }) => dsrService.adminGetDsrRequest(input.requestId)),

  // Approve a rectification request (admin reviews and applies changes)
  approveRectification: adminProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) =>
      dsrService.adminApproveRectification({
        requestId: input.requestId,
        approvedByUserId: ctx.user.id,
        notes: input.notes,
      })
    ),

  // Reject any DSR request with a reason
  rejectRequest: adminProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        reason: z.string().min(5).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) =>
      dsrService.adminRejectRequest({
        requestId: input.requestId,
        rejectedByUserId: ctx.user.id,
        reason: input.reason,
      })
    ),

  // List consent notice versions for a given kind
  listConsentNotices: adminProcedure
    .input(
      z.object({
        noticeKind: z
          .enum(["privacy_policy", "terms", "rx_data_use", "marketing"])
          .default("privacy_policy"),
        includeExpired: z.boolean().default(false),
      })
    )
    .query(async ({ input }) =>
      listNoticesForKind({
        noticeKind: input.noticeKind,
        includeExpired: input.includeExpired,
      })
    ),

  // List family consent records (most recent first)
  listFamilyConsents: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(familyConsent)
        .orderBy(desc(familyConsent.consentSignedAt))
        .limit(input.limit);
    }),

  // Revoke a family consent record
  revokeFamilyConsent: adminProcedure
    .input(
      z.object({
        consentId: z.number().int().positive(),
        reason: z.string().min(5).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) =>
      revokeFamilyConsent({
        consentId: input.consentId,
        revokedByUserId: ctx.user.id,
        reason: input.reason,
      })
    ),
});
