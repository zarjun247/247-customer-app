/**
 * Ingestion Router
 *
 * tRPC procedures for the invoice ingestion engine.
 * All procedures require admin, store_manager, or inventory_operator role.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import {
  invoiceIngestions,
  ocrJobs,
  humanReviewItems,
} from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { storagePut } from "../storage";
import { runOcrPipeline } from "../ingestion";
import { getOcrProviderReadiness } from "../services/ocrProductionSafety";

// Roles allowed to use the ingestion system
const INGESTION_ROLES = [
  "admin",
  "store_manager",
  "inventory_operator",
] as const;
type IngestionRole = (typeof INGESTION_ROLES)[number];

function assertIngestionRole(role: string): asserts role is IngestionRole {
  if (!INGESTION_ROLES.includes(role as IngestionRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Only admin, store_manager, or inventory_operator can access the ingestion system",
    });
  }
}

export const ingestionRouter = router({
  /**
   * Upload an invoice file and create an ingestion record + OCR job.
   * Accepts a base64-encoded file payload.
   */
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        mimeType: z.enum([
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/webp",
        ]),
        base64Data: z.string().min(1), // base64-encoded file content
        storeId: z.number().int().positive(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertIngestionRole(ctx.user.role);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      // Decode base64 and upload to storage
      const buffer = Buffer.from(input.base64Data, "base64");
      const fileKey = `ingestion/${ctx.user.id}/${Date.now()}-${input.filename}`;
      const { key: storedFileKey, url: fileUrl } = await storagePut(
        fileKey,
        buffer,
        input.mimeType
      );

      // Create ingestion record
      const [ingestionResult] = await db.insert(invoiceIngestions).values({
        storeId: input.storeId,
        uploadedBy: ctx.user.id,
        fileKey: storedFileKey,
        fileUrl,
        originalFilename: input.filename,
        mimeType: input.mimeType,
        status: "pending_ocr",
        notes: input.notes ?? null,
      });

      const ingestionId = (ingestionResult as any).insertId as number;

      const readiness = getOcrProviderReadiness();
      await db.insert(ocrJobs).values({
        ingestionId,
        status: readiness.ok ? "queued" : "failed",
        provider: readiness.ok ? "llm" : readiness.status,
        attempts: 0,
        errorMessage: readiness.ok ? null : readiness.reason,
      });

      if (!readiness.ok) {
        await db
          .update(invoiceIngestions)
          .set({
            status: "under_review",
            notes: `OCR ${readiness.status}: ${readiness.reason}. Manual review required.`,
          })
          .where(eq(invoiceIngestions.id, ingestionId));
        return {
          ingestionId,
          status: readiness.status,
          manualRequired: true,
          reason: readiness.reason,
        };
      }

      runOcrPipeline(ingestionId).catch(err =>
        console.error(
          `[Ingestion] Background OCR failed for #${ingestionId}:`,
          err
        )
      );

      return { ingestionId, status: "pending_ocr" };
    }),

  /**
   * List all ingestions (admin/store_manager/inventory_operator).
   * Supports optional storeId filter.
   */
  list: protectedProcedure
    .input(
      z.object({
        storeId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      assertIngestionRole(ctx.user.role);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      const rows = await db
        .select()
        .from(invoiceIngestions)
        .where(
          input.storeId
            ? eq(invoiceIngestions.storeId, input.storeId)
            : undefined
        )
        .orderBy(desc(invoiceIngestions.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return rows;
    }),

  /**
   * Get a single ingestion with its OCR job status.
   */
  get: protectedProcedure
    .input(z.object({ ingestionId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertIngestionRole(ctx.user.role);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      const ingestionRows = await db
        .select()
        .from(invoiceIngestions)
        .where(eq(invoiceIngestions.id, input.ingestionId))
        .limit(1);

      if (ingestionRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ingestion not found",
        });
      }

      const jobRows = await db
        .select()
        .from(ocrJobs)
        .where(eq(ocrJobs.ingestionId, input.ingestionId))
        .orderBy(desc(ocrJobs.createdAt))
        .limit(1);

      return {
        ingestion: ingestionRows[0],
        ocrJob: jobRows[0] ?? null,
      };
    }),

  /**
   * Get human review items for an ingestion.
   */
  getItems: protectedProcedure
    .input(
      z.object({
        ingestionId: z.number().int().positive(),
        status: z
          .enum(["pending", "approved", "rejected", "merged"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      assertIngestionRole(ctx.user.role);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      const condition = input.status
        ? and(
            eq(humanReviewItems.ingestionId, input.ingestionId),
            eq(humanReviewItems.status, input.status)
          )
        : eq(humanReviewItems.ingestionId, input.ingestionId);

      const items = await db
        .select()
        .from(humanReviewItems)
        .where(condition)
        .orderBy(humanReviewItems.id);

      return items;
    }),

  /**
   * Approve a single review item.
   */
  approveItem: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        reviewNote: z.string().max(500).optional(),
        // Override matched product if reviewer selects a different one
        matchedProductId: z.number().int().positive().optional(),
        matchedVariantId: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertIngestionRole(ctx.user.role);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      await db
        .update(humanReviewItems)
        .set({
          status: "approved",
          reviewedBy: ctx.user.id,
          reviewNote: input.reviewNote ?? null,
          ...(input.matchedProductId && {
            matchedProductId: input.matchedProductId,
          }),
          ...(input.matchedVariantId && {
            matchedVariantId: input.matchedVariantId,
          }),
        })
        .where(eq(humanReviewItems.id, input.itemId));

      // Update ingestion approved count
      const item = await db
        .select({ ingestionId: humanReviewItems.ingestionId })
        .from(humanReviewItems)
        .where(eq(humanReviewItems.id, input.itemId))
        .limit(1);

      if (item.length > 0) {
        const counts = await db
          .select({
            approved: humanReviewItems.status,
          })
          .from(humanReviewItems)
          .where(eq(humanReviewItems.ingestionId, item[0].ingestionId));

        const approvedCount = counts.filter(
          c => c.approved === "approved"
        ).length;
        const rejectedCount = counts.filter(
          c => c.approved === "rejected"
        ).length;

        await db
          .update(invoiceIngestions)
          .set({ approvedCount, rejectedCount })
          .where(eq(invoiceIngestions.id, item[0].ingestionId));
      }

      return { success: true };
    }),

  /**
   * Reject a single review item.
   */
  rejectItem: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        reviewNote: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertIngestionRole(ctx.user.role);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      await db
        .update(humanReviewItems)
        .set({
          status: "rejected",
          reviewedBy: ctx.user.id,
          reviewNote: input.reviewNote ?? null,
        })
        .where(eq(humanReviewItems.id, input.itemId));

      return { success: true };
    }),

  /**
   * Merge a duplicate item into another.
   */
  mergeItem: protectedProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        mergeIntoId: z.number().int().positive(),
        reviewNote: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertIngestionRole(ctx.user.role);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      await db
        .update(humanReviewItems)
        .set({
          status: "merged",
          reviewedBy: ctx.user.id,
          duplicateOfId: input.mergeIntoId,
          reviewNote: input.reviewNote ?? null,
        })
        .where(eq(humanReviewItems.id, input.itemId));

      return { success: true };
    }),

  /**
   * Bulk approve all pending items in an ingestion.
   * Marks the ingestion as approved.
   */
  approveAll: protectedProcedure
    .input(
      z.object({
        ingestionId: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertIngestionRole(ctx.user.role);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      // Approve all pending items
      await db
        .update(humanReviewItems)
        .set({
          status: "approved",
          reviewedBy: ctx.user.id,
        })
        .where(
          and(
            eq(humanReviewItems.ingestionId, input.ingestionId),
            eq(humanReviewItems.status, "pending")
          )
        );

      // Get final counts
      const allItems = await db
        .select({ status: humanReviewItems.status })
        .from(humanReviewItems)
        .where(eq(humanReviewItems.ingestionId, input.ingestionId));

      const approvedCount = allItems.filter(
        i => i.status === "approved"
      ).length;
      const rejectedCount = allItems.filter(
        i => i.status === "rejected"
      ).length;

      // Mark ingestion as approved
      await db
        .update(invoiceIngestions)
        .set({
          status: "approved",
          approvedCount,
          rejectedCount,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(invoiceIngestions.id, input.ingestionId));

      return { approvedCount, rejectedCount };
    }),

  /**
   * Retry OCR for a failed ingestion.
   */
  retryOcr: protectedProcedure
    .input(z.object({ ingestionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertIngestionRole(ctx.user.role);

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable",
        });

      // Reset OCR job to queued
      await db
        .update(ocrJobs)
        .set({ status: "queued", attempts: 0, errorMessage: null })
        .where(eq(ocrJobs.ingestionId, input.ingestionId));

      // Reset ingestion status
      await db
        .update(invoiceIngestions)
        .set({ status: "pending_ocr" })
        .where(eq(invoiceIngestions.id, input.ingestionId));

      // Run pipeline in background
      runOcrPipeline(input.ingestionId).catch(err =>
        console.error(
          `[Ingestion] Retry OCR failed for #${input.ingestionId}:`,
          err
        )
      );

      return { success: true };
    }),
});
