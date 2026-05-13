/**
 * Consent Router
 *
 * tRPC procedures for managing user consent records (PDPA/DPDP compliance).
 * Users can grant or revoke consent for each consent type.
 * Consent history is immutable — revocation creates a new record.
 *
 * Consent types:
 *   terms_of_service    — App ToS acceptance
 *   privacy_policy      — Privacy policy acceptance
 *   rx_data_processing  — Consent to process prescription data
 *   marketing           — Marketing communications opt-in
 *   location            — Location data collection consent
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { userConsents } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// Current consent document versions
export const CONSENT_VERSIONS = {
  terms_of_service: "1.0",
  privacy_policy: "1.0",
  rx_data_processing: "1.0",
  marketing: "1.0",
  location: "1.0",
} as const;

export type ConsentType = keyof typeof CONSENT_VERSIONS;

export const consentRouter = router({
  /**
   * Get the current consent status for the authenticated user.
   * Returns the latest record for each consent type.
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database unavailable",
      });

    const allConsents = await db
      .select()
      .from(userConsents)
      .where(eq(userConsents.userId, ctx.user.id))
      .orderBy(desc(userConsents.grantedAt));

    // Return latest record per consent type
    const latestByType: Record<string, (typeof allConsents)[0]> = {};
    for (const consent of allConsents) {
      if (!latestByType[consent.consentType]) {
        latestByType[consent.consentType] = consent;
      }
    }

    // Build status for all consent types
    const consentTypes: ConsentType[] = [
      "terms_of_service",
      "privacy_policy",
      "rx_data_processing",
      "marketing",
      "location",
    ];

    return consentTypes.map(type => {
      const record = latestByType[type];
      return {
        type,
        currentVersion: CONSENT_VERSIONS[type],
        granted: record?.granted ?? false,
        recordVersion: record?.version ?? null,
        grantedAt: record?.grantedAt ?? null,
        revokedAt: record?.revokedAt ?? null,
        isCurrentVersion: record?.version === CONSENT_VERSIONS[type],
      };
    });
  }),

  /**
   * Grant consent for one or more consent types.
   * Creates a new consent record (does not overwrite existing).
   */
  grant: protectedProcedure
    .input(
      z.object({
        types: z
          .array(
            z.enum([
              "terms_of_service",
              "privacy_policy",
              "rx_data_processing",
              "marketing",
              "location",
            ])
          )
          .min(1),
        ipAddress: z.string().max(45).optional(),
        userAgent: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      const rows = input.types.map(type => ({
        userId: ctx.user.id,
        consentType: type,
        version: CONSENT_VERSIONS[type],
        granted: true,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      }));

      await db.insert(userConsents).values(rows);

      return { granted: input.types };
    }),

  /**
   * Revoke consent for a specific consent type.
   * Creates a new record with granted=false and revokedAt timestamp.
   *
   * Note: Terms of Service and Privacy Policy cannot be revoked
   * (revoking them would mean the user can no longer use the service).
   */
  revoke: protectedProcedure
    .input(
      z.object({
        type: z.enum(["rx_data_processing", "marketing", "location"]),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      await db.insert(userConsents).values({
        userId: ctx.user.id,
        consentType: input.type,
        version: CONSENT_VERSIONS[input.type],
        granted: false,
        revokedAt: new Date(),
      });

      return { revoked: input.type };
    }),

  /**
   * Get full consent history for the authenticated user.
   * Returns all consent records in reverse chronological order.
   */
  history: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      const records = await db
        .select()
        .from(userConsents)
        .where(eq(userConsents.userId, ctx.user.id))
        .orderBy(desc(userConsents.grantedAt))
        .limit(input.limit)
        .offset(input.offset);

      return records;
    }),
});
