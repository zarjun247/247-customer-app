/**
 * ocrIngestionRouter — PART 6: AI OCR Bill Ingestion V1
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logAudit } from "../services/audit";
import { router, protectedProcedure } from "../_core/trpc";
import { eq, and, desc, or as _or, inArray, type SQL } from "drizzle-orm";
import { ocrIngestionRouterExtension } from "./ocrAdminRouter";
import {
  assertRuntimeGate,
  productToMasterLike,
  validatePurchaseLineMaster,
} from "../services/productMasterValidation";
import { isUnsafeOcrEvidenceUrl } from "../services/ocrProductionSafety";
import { processJobProcedure } from "./ocrIngestionExtension";

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

export const ocrIngestionRouter = router({
  uploadBill: protectedProcedure
    .input(
      z.object({
        storeId: z.number(),
        fileUrl: z.string().min(1),
        fileKey: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        fileSizeBytes: z.number().optional(),
        sourceType: z
          .enum([
            "upload",
            "email",
            "whatsapp",
            "watched_folder",
            "csv_import",
            "legacy",
          ])
          .default("upload"),
        supplierHint: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      if (isUnsafeOcrEvidenceUrl(input.fileUrl))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "manual_required: real OCR evidence URL is required",
        });
      if (!input.fileKey.trim())
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "manual_required: real OCR evidence file key is required",
        });
      const db = await getDb();
      const { ingestionJobs, ingestionFiles } = await import(
        "../../drizzle/schema"
      );
      const [job] = await db
        .insert(ingestionJobs)
        .values({
          storeId: input.storeId,
          jobType: "purchase_bill",
          status: "queued",
          sourceType: input.sourceType,
          fileUrl: input.fileUrl,
          fileKey: input.fileKey,
          filename: input.filename,
          mimeType: input.mimeType,
          supplierHint: input.supplierHint,
          createdBy: ctx.user.id,
        })
        .$returningId();
      await db.insert(ingestionFiles).values({
        ingestionJobId: job.id,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        filename: input.filename,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        uploadedBy: ctx.user.id,
      });
      await logAudit({
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: "user",
        entityType: "ingestion_job",
        entityId: job.id,
        action: "ocr.upload",
        afterJson: { filename: input.filename, sourceType: input.sourceType },
        source: "admin",
      });
      return { jobId: job.id };
    }),

  processJob: processJobProcedure,

  listJobs: protectedProcedure
    .input(
      z.object({
        storeId: z.number().optional(),
        status: z
          .enum([
            "queued",
            "processing",
            "ocr_complete",
            "under_review",
            "committed",
            "failed",
          ])
          .optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { ingestionJobs } = await import("../../drizzle/schema");
      const conditions: SQL[] = [];
      if (input.storeId)
        conditions.push(eq(ingestionJobs.storeId, input.storeId));
      if (input.status) conditions.push(eq(ingestionJobs.status, input.status));
      const rows = await db
        .select()
        .from(ingestionJobs)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(ingestionJobs.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return { rows };
    }),

  getJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const {
        ingestionJobs,
        ocrExtractedHeaders,
        ocrExtractedLines,
        ocrReviewTasks,
      } = await import("../../drizzle/schema");
      const [job] = await db
        .select()
        .from(ingestionJobs)
        .where(eq(ingestionJobs.id, input.jobId))
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      const headers = await db
        .select()
        .from(ocrExtractedHeaders)
        .where(eq(ocrExtractedHeaders.ingestionJobId, input.jobId));
      const lines = await db
        .select()
        .from(ocrExtractedLines)
        .where(eq(ocrExtractedLines.ingestionJobId, input.jobId))
        .orderBy(ocrExtractedLines.lineNo);
      const tasks = await db
        .select()
        .from(ocrReviewTasks)
        .where(eq(ocrReviewTasks.ingestionJobId, input.jobId));
      return { job, headers, lines, tasks };
    }),

  getLines: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
        matchStatus: z
          .enum(["auto_matched", "review_required", "unknown_sku", "rejected"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { ocrExtractedLines, ocrMatchCandidates, products } = await import(
        "../../drizzle/schema"
      );
      const conditions: SQL[] = [
        eq(ocrExtractedLines.ingestionJobId, input.jobId),
      ];
      if (input.matchStatus)
        conditions.push(eq(ocrExtractedLines.matchStatus, input.matchStatus));
      const lines = await db
        .select()
        .from(ocrExtractedLines)
        .where(and(...conditions))
        .orderBy(ocrExtractedLines.lineNo);
      const lineIds = lines.map(l => l.id);
      const candidates =
        lineIds.length > 0
          ? await db
              .select({
                id: ocrMatchCandidates.id,
                ocrLineId: ocrMatchCandidates.ocrLineId,
                productId: ocrMatchCandidates.productId,
                matchScore: ocrMatchCandidates.matchScore,
                matchMethod: ocrMatchCandidates.matchMethod,
                matchDetails: ocrMatchCandidates.matchDetails,
                isSelected: ocrMatchCandidates.isSelected,
                productName: products.name,
              })
              .from(ocrMatchCandidates)
              .leftJoin(products, eq(ocrMatchCandidates.productId, products.id))
              .where(inArray(ocrMatchCandidates.ocrLineId, lineIds))
          : [];
      return {
        lines: lines.map(line => ({
          ...line,
          candidates: candidates.filter(c => c.ocrLineId === line.id),
        })),
      };
    }),

  reviewLine: protectedProcedure
    .input(
      z.object({
        lineId: z.number(),
        action: z.enum(["approve", "reject", "reassign", "hold"]),
        selectedProductId: z.number().optional(),
        rejectionReason: z.string().optional(),
        correctionNotes: z.string().optional(),
        itemName: z.string().optional(),
        batchNo: z.string().optional(),
        expiryDate: z.string().optional(),
        mrp: z.number().optional(),
        purchaseRate: z.number().optional(),
        qty: z.number().optional(),
        freeQty: z.number().optional(),
        discount: z.number().optional(),
        gstRate: z.number().optional(),
        hsnCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const {
        ocrExtractedLines,
        ocrMatchCandidates,
        ocrReviewTasks,
        products,
      } = await import("../../drizzle/schema");
      const [line] = await db
        .select()
        .from(ocrExtractedLines)
        .where(eq(ocrExtractedLines.id, input.lineId))
        .limit(1);
      if (!line) throw new TRPCError({ code: "NOT_FOUND" });
      const u: Record<string, unknown> = {
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
      };
      if (input.action === "approve") {
        u.matchStatus = "auto_matched";
        u.approvalStatus = "approved";
        u.approvalDecision = "approve";
        u.approvedBy = ctx.user.id;
        u.approvedAt = new Date();
        u.exceptionReason = null;
        if (input.selectedProductId) {
          u.matchedProductId = input.selectedProductId;
          u.mappedProductId = input.selectedProductId;
        }
      } else if (input.action === "hold") {
        u.approvalStatus = "held";
        u.approvalDecision = "hold";
        u.correctionNotes = input.correctionNotes;
      } else if (input.action === "reject") {
        u.matchStatus = "rejected";
        u.approvalStatus = "rejected";
        u.approvalDecision = "reject";
        u.rejectionReason = input.rejectionReason;
        u.correctionNotes = input.correctionNotes;
      } else if (input.action === "reassign" && input.selectedProductId) {
        u.matchStatus = "auto_matched";
        u.approvalStatus = "approved";
        u.approvalDecision = "approve";
        u.approvedBy = ctx.user.id;
        u.approvedAt = new Date();
        u.exceptionReason = null;
        u.matchedProductId = input.selectedProductId;
        u.mappedProductId = input.selectedProductId;
        await db
          .update(ocrMatchCandidates)
          .set({ isSelected: false })
          .where(eq(ocrMatchCandidates.ocrLineId, input.lineId));
        await db
          .update(ocrMatchCandidates)
          .set({ isSelected: true })
          .where(
            and(
              eq(ocrMatchCandidates.ocrLineId, input.lineId),
              eq(ocrMatchCandidates.productId, input.selectedProductId)
            )
          );
      }
      if (input.itemName !== undefined) u.itemName = input.itemName;
      if (input.batchNo !== undefined) u.batchNo = input.batchNo;
      if (input.expiryDate !== undefined) u.expiryDate = input.expiryDate;
      if (input.mrp !== undefined) u.mrp = String(input.mrp);
      if (input.purchaseRate !== undefined)
        u.purchaseRate = String(input.purchaseRate);
      if (input.qty !== undefined) u.qty = input.qty;
      if (input.freeQty !== undefined) u.freeQty = input.freeQty;
      if (input.discount !== undefined) u.discount = String(input.discount);
      if (input.gstRate !== undefined) u.gstRate = String(input.gstRate);
      if (input.hsnCode !== undefined) u.hsnCode = input.hsnCode;
      if (input.correctionNotes !== undefined)
        u.correctionNotes = input.correctionNotes;
      if (input.action === "approve" || input.action === "reassign") {
        const productId = (u.mappedProductId ??
          u.matchedProductId ??
          line.mappedProductId ??
          line.matchedProductId) as number | null | undefined;
        const [product] = productId
          ? await db
              .select()
              .from(products)
              .where(eq(products.id, productId))
              .limit(1)
          : [];
        const mergedLine = { ...line, ...u } as typeof line &
          Record<string, unknown>;
        assertRuntimeGate(
          validatePurchaseLineMaster({
            product: product ? productToMasterLike(product) : null,
            productId,
            batchNo: mergedLine.batchNo ?? null,
            expiryDate: mergedLine.expiryDate ?? null,
            mrp: mergedLine.mrp ?? null,
            purchaseRate: mergedLine.purchaseRate ?? null,
            hsnCode: mergedLine.hsnCode ?? null,
            gstRate: mergedLine.gstRate ?? null,
          }),
          "OCR line has incomplete product master or purchase metadata"
        );
      }
      await db
        .update(ocrExtractedLines)
        .set(u)
        .where(eq(ocrExtractedLines.id, input.lineId));
      await db
        .update(ocrReviewTasks)
        .set({
          status: "resolved",
          resolvedBy: ctx.user.id,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(ocrReviewTasks.ocrLineId, input.lineId),
            eq(ocrReviewTasks.status, "pending")
          )
        );
      await logAudit({
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: "user",
        entityType: "ocr_extracted_line",
        entityId: input.lineId,
        action: `ocr.review_${input.action}`,
        beforeJson: { matchStatus: line.matchStatus },
        afterJson: u,
        reason: input.rejectionReason,
        source: "admin",
      });
      return { success: true };
    }),

  reviewHeader: protectedProcedure
    .input(
      z.object({
        headerId: z.number(),
        action: z.enum(["approve", "reject"]),
        supplierName: z.string().optional(),
        supplierGstin: z.string().optional(),
        invoiceNo: z.string().optional(),
        invoiceDate: z.string().optional(),
        matchedSupplierId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { ocrExtractedHeaders } = await import("../../drizzle/schema");
      const u: Record<string, unknown> = {
        reviewStatus: input.action === "approve" ? "approved" : "rejected",
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
      };
      if (input.supplierName) u.supplierName = input.supplierName;
      if (input.supplierGstin) u.supplierGstin = input.supplierGstin;
      if (input.invoiceNo) u.invoiceNo = input.invoiceNo;
      if (input.invoiceDate) u.invoiceDate = input.invoiceDate;
      if (input.matchedSupplierId)
        u.matchedSupplierId = input.matchedSupplierId;
      await db
        .update(ocrExtractedHeaders)
        .set(u)
        .where(eq(ocrExtractedHeaders.id, input.headerId));
      return { success: true };
    }),

  getReviewTasks: protectedProcedure
    .input(
      z.object({
        jobId: z.number().optional(),
        taskType: z
          .enum([
            "header_review",
            "line_review",
            "sku_creation",
            "h1_review",
            "low_confidence",
          ])
          .optional(),
        status: z
          .enum(["pending", "in_progress", "resolved", "skipped"])
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { ocrReviewTasks } = await import("../../drizzle/schema");
      const conditions: SQL[] = [];
      if (input.jobId)
        conditions.push(eq(ocrReviewTasks.ingestionJobId, input.jobId));
      if (input.taskType)
        conditions.push(eq(ocrReviewTasks.taskType, input.taskType));
      if (input.status)
        conditions.push(eq(ocrReviewTasks.status, input.status));
      const rows = await db
        .select()
        .from(ocrReviewTasks)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(ocrReviewTasks.createdAt))
        .limit(200);
      return { rows };
    }),

  resolveTask: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        status: z.enum(["resolved", "skipped"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { ocrReviewTasks } = await import("../../drizzle/schema");
      await db
        .update(ocrReviewTasks)
        .set({
          status: input.status,
          resolvedBy: ctx.user.id,
          resolvedAt: new Date(),
          notes: input.notes,
        })
        .where(eq(ocrReviewTasks.id, input.taskId));
      return { success: true };
    }),

  createSkuDraft: protectedProcedure
    .input(
      z.object({
        ingestionJobId: z.number(),
        ocrLineId: z.number().optional(),
        draftName: z.string().min(1),
        brand: z.string().optional(),
        genericName: z.string().optional(),
        manufacturer: z.string().optional(),
        scheduleFlag: z.string().optional(),
        hsnCode: z.string().optional(),
        gstRate: z.number().optional(),
        packSize: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { skuCreationDrafts } = await import("../../drizzle/schema");
      const [draft] = await db
        .insert(skuCreationDrafts)
        .values({
          ingestionJobId: input.ingestionJobId,
          ocrLineId: input.ocrLineId,
          draftName: input.draftName,
          brand: input.brand,
          genericName: input.genericName,
          manufacturer: input.manufacturer,
          scheduleFlag: input.scheduleFlag,
          hsnCode: input.hsnCode,
          gstRate:
            input.gstRate !== undefined ? String(input.gstRate) : undefined,
          packSize: input.packSize,
          status: "pending_review",
        })
        .$returningId();
      await logAudit({
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: "user",
        entityType: "sku_creation_draft",
        entityId: draft.id,
        action: "ocr.create",
        afterJson: { draftName: input.draftName },
        source: "admin",
      });
      return { draftId: draft.id };
    }),

  ...ocrIngestionRouterExtension,
});
