/**
 * ocrAdminExtension.ts — SKU-draft review and AI-decision procedures
 *
 * Extracted from ocrAdminRouter.ts to keep that file under 600 counted lines.
 * Spread into ocrIngestionRouterExtension in ocrAdminRouter.ts.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logAudit } from "../services/audit";
import { protectedProcedure } from "../_core/trpc";
import { eq, and, desc, type SQL } from "drizzle-orm";
import { buildOcrExceptionReport } from "../services/ocrPurchaseInwarding";

async function getDb() {
  const { getDb: _getDb } = await import("../db");
  const db = await _getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "DB unavailable",
    });
  return db;
}

function requirePurchaseRole(role: string) {
  const allowed = [
    "admin",
    "super_admin",
    "store_manager",
    "purchase_manager",
    "inventory_operator",
    "pharmacist",
  ];
  if (!allowed.includes(role))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Purchase role required",
    });
}

export const ocrAdminExtension = {
  listSkuDrafts: protectedProcedure
    .input(
      z.object({
        jobId: z.number().optional(),
        status: z.enum(["pending_review", "approved", "rejected"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { skuCreationDrafts } = await import("../../drizzle/schema");
      const conditions: SQL[] = [];
      if (input.jobId)
        conditions.push(eq(skuCreationDrafts.ingestionJobId, input.jobId));
      if (input.status)
        conditions.push(eq(skuCreationDrafts.status, input.status));
      const rows = await db
        .select()
        .from(skuCreationDrafts)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(skuCreationDrafts.createdAt))
        .limit(200);
      return { rows };
    }),

  reviewSkuDraft: protectedProcedure
    .input(
      z.object({
        draftId: z.number(),
        action: z.enum(["approve", "reject"]),
        activatedProductId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !["admin", "super_admin", "store_manager", "purchase_manager"].includes(
          ctx.user.role
        )
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Manager role required",
        });
      const db = await getDb();
      const { skuCreationDrafts } = await import("../../drizzle/schema");
      await db
        .update(skuCreationDrafts)
        .set({
          status: input.action === "approve" ? "approved" : "rejected",
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          activatedProductId: input.activatedProductId,
        })
        .where(eq(skuCreationDrafts.id, input.draftId));
      await logAudit({
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: "user",
        entityType: "sku_creation_draft",
        entityId: input.draftId,
        action: `ocr.sku_${input.action}`,
        source: "admin",
      });
      return { success: true };
    }),

  getExceptionReport: protectedProcedure
    .input(
      z.object({
        jobId: z.number().optional(),
        approvalStatus: z
          .enum(["pending", "approved", "held", "rejected"])
          .optional(),
        exceptionReason: z
          .enum([
            "low_confidence",
            "ambiguous_product",
            "missing_batch",
            "missing_expiry",
            "missing_qty",
            "missing_mrp",
            "missing_cost",
            "missing_hsn_or_gst",
            "missing_schedule_for_regulated",
            "supplier_sku_unmapped",
          ])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { ocrExtractedLines, products } = await import(
        "../../drizzle/schema"
      );
      const conditions: SQL[] = [];
      if (input.jobId)
        conditions.push(eq(ocrExtractedLines.ingestionJobId, input.jobId));
      if (input.approvalStatus)
        conditions.push(
          eq(ocrExtractedLines.approvalStatus, input.approvalStatus)
        );
      if (input.exceptionReason)
        conditions.push(
          eq(ocrExtractedLines.exceptionReason, input.exceptionReason)
        );
      const rows = await db
        .select({
          id: ocrExtractedLines.id,
          ingestionJobId: ocrExtractedLines.ingestionJobId,
          lineNo: ocrExtractedLines.lineNo,
          rawLineText: ocrExtractedLines.rawLineText,
          extractedProductName: ocrExtractedLines.extractedProductName,
          extractedBatchNo: ocrExtractedLines.extractedBatchNo,
          extractedExpiry: ocrExtractedLines.extractedExpiry,
          extractedQty: ocrExtractedLines.extractedQty,
          extractedMRP: ocrExtractedLines.extractedMRP,
          extractedCost: ocrExtractedLines.extractedCost,
          confidence: ocrExtractedLines.confidence,
          mappedProductId: ocrExtractedLines.mappedProductId,
          productName: products.name,
          mappedSupplierSkuId: ocrExtractedLines.mappedSupplierSkuId,
          exceptionReason: ocrExtractedLines.exceptionReason,
          approvalStatus: ocrExtractedLines.approvalStatus,
          approvedBy: ocrExtractedLines.approvedBy,
          approvedAt: ocrExtractedLines.approvedAt,
          approvalDecision: ocrExtractedLines.approvalDecision,
          correctionNotes: ocrExtractedLines.correctionNotes,
        })
        .from(ocrExtractedLines)
        .leftJoin(products, eq(ocrExtractedLines.mappedProductId, products.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(ocrExtractedLines.createdAt))
        .limit(500);
      const totals = buildOcrExceptionReport(rows);
      const csvData = rows.map(row => ({ ...row }));
      return { rows, totals, csvData };
    }),

  getAiDecisions: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { aiDecisions } = await import("../../drizzle/schema");
      const rows = await db
        .select()
        .from(aiDecisions)
        .where(eq(aiDecisions.ingestionJobId, input.jobId))
        .orderBy(aiDecisions.createdAt);
      return { rows };
    }),
};
