/**
 * ocrIngestionRouterExtension — second half of ocrIngestionRouter procedures
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logAudit } from "../services/audit";
import { protectedProcedure } from "../_core/trpc";
import { eq, and, desc } from "drizzle-orm";
import {
  assertOcrDraftApprovedForHandoff,
  buildOcrExceptionReport,
} from "../services/ocrPurchaseInwarding";
import {
  assertRuntimeGate,
  productToMasterLike,
  validatePurchaseLineMaster,
} from "../services/productMasterValidation";

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

export const ocrIngestionRouterExtension = {
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
      const conditions: any[] = [];
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

  generateDraft: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const {
        ingestionJobs,
        ocrExtractedHeaders,
        ocrExtractedLines,
        purchaseDrafts,
        purchaseDraftLines,
      } = await import("../../drizzle/schema");
      const [job] = await db
        .select()
        .from(ingestionJobs)
        .where(eq(ingestionJobs.id, input.jobId))
        .limit(1);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      const [header] = await db
        .select()
        .from(ocrExtractedHeaders)
        .where(eq(ocrExtractedHeaders.ingestionJobId, input.jobId))
        .limit(1);
      const matchedLines = await db
        .select()
        .from(ocrExtractedLines)
        .where(
          and(
            eq(ocrExtractedLines.ingestionJobId, input.jobId),
            eq(ocrExtractedLines.matchStatus, "auto_matched")
          )
        );
      if (matchedLines.length === 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No auto-matched lines. Review pending lines first.",
        });
      const [draft] = await db
        .insert(purchaseDrafts)
        .values({
          ingestionJobId: input.jobId,
          supplierId: header?.matchedSupplierId ?? null,
          invoiceNo: header?.invoiceNo ?? null,
          invoiceDate: header?.invoiceDate ?? null,
          status: "draft",
        })
        .$returningId();
      for (const line of matchedLines) {
        await db.insert(purchaseDraftLines).values({
          purchaseDraftId: draft.id,
          ocrLineId: line.id,
          productId: line.matchedProductId ?? null,
          rawLineText: line.rawLineText ?? line.rawText ?? null,
          extractedProductName:
            line.extractedProductName ?? line.itemName ?? null,
          extractedBatchNo: line.extractedBatchNo ?? line.batchNo ?? null,
          extractedExpiry: line.extractedExpiry ?? line.expiryDate ?? null,
          extractedQty: line.extractedQty ?? line.qty ?? null,
          extractedMRP: line.extractedMRP ?? line.mrp ?? null,
          extractedCost: line.extractedCost ?? line.purchaseRate ?? null,
          mappedProductId:
            line.mappedProductId ?? line.matchedProductId ?? null,
          mappedSupplierSkuId: line.mappedSupplierSkuId ?? null,
          batchNo: line.batchNo ?? null,
          expiryDate: line.expiryDate ?? null,
          mrp: line.mrp ?? null,
          purchaseRate: line.purchaseRate ?? null,
          qty: line.qty ?? null,
          freeQty: line.freeQty ?? 0,
          discount: line.discount ?? null,
          gstRate: line.gstRate ?? null,
          hsnCode: line.hsnCode ?? null,
          confidence: line.confidence ?? null,
          exceptionReason: line.exceptionReason ?? null,
          approvalStatus: "pending",
          status: "pending",
        });
      }
      await db
        .update(ingestionJobs)
        .set({ status: "under_review" })
        .where(eq(ingestionJobs.id, input.jobId));
      await logAudit({
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: "user",
        entityType: "purchase_draft",
        entityId: draft.id,
        action: "ocr.generate",
        afterJson: { jobId: input.jobId, lineCount: matchedLines.length },
        source: "admin",
      });
      return { draftId: draft.id, lineCount: matchedLines.length };
    }),

  listDrafts: protectedProcedure
    .input(
      z.object({
        status: z
          .enum(["draft", "under_review", "approved", "committed", "rejected"])
          .optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { purchaseDrafts } = await import("../../drizzle/schema");
      const conditions: any[] = [];
      if (input.status)
        conditions.push(eq(purchaseDrafts.status, input.status));
      const rows = await db
        .select()
        .from(purchaseDrafts)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(purchaseDrafts.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return { rows };
    }),

  getDraft: protectedProcedure
    .input(z.object({ draftId: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { purchaseDrafts, purchaseDraftLines, products } = await import(
        "../../drizzle/schema"
      );
      const [draft] = await db
        .select()
        .from(purchaseDrafts)
        .where(eq(purchaseDrafts.id, input.draftId))
        .limit(1);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db
        .select({
          id: purchaseDraftLines.id,
          purchaseDraftId: purchaseDraftLines.purchaseDraftId,
          ocrLineId: purchaseDraftLines.ocrLineId,
          productId: purchaseDraftLines.productId,
          productName: products.name,
          rawLineText: purchaseDraftLines.rawLineText,
          extractedProductName: purchaseDraftLines.extractedProductName,
          extractedBatchNo: purchaseDraftLines.extractedBatchNo,
          extractedExpiry: purchaseDraftLines.extractedExpiry,
          extractedQty: purchaseDraftLines.extractedQty,
          extractedMRP: purchaseDraftLines.extractedMRP,
          extractedCost: purchaseDraftLines.extractedCost,
          mappedProductId: purchaseDraftLines.mappedProductId,
          mappedSupplierSkuId: purchaseDraftLines.mappedSupplierSkuId,
          batchNo: purchaseDraftLines.batchNo,
          expiryDate: purchaseDraftLines.expiryDate,
          mrp: purchaseDraftLines.mrp,
          purchaseRate: purchaseDraftLines.purchaseRate,
          saleRate: purchaseDraftLines.saleRate,
          landingCost: purchaseDraftLines.landingCost,
          margin: purchaseDraftLines.margin,
          qty: purchaseDraftLines.qty,
          freeQty: purchaseDraftLines.freeQty,
          discount: purchaseDraftLines.discount,
          gstRate: purchaseDraftLines.gstRate,
          hsnCode: purchaseDraftLines.hsnCode,
          confidence: purchaseDraftLines.confidence,
          exceptionReason: purchaseDraftLines.exceptionReason,
          approvalStatus: purchaseDraftLines.approvalStatus,
          approvedBy: purchaseDraftLines.approvedBy,
          approvedAt: purchaseDraftLines.approvedAt,
          approvalDecision: purchaseDraftLines.approvalDecision,
          correctionNotes: purchaseDraftLines.correctionNotes,
          status: purchaseDraftLines.status,
          rejectionReason: purchaseDraftLines.rejectionReason,
          createdAt: purchaseDraftLines.createdAt,
        })
        .from(purchaseDraftLines)
        .leftJoin(products, eq(purchaseDraftLines.productId, products.id))
        .where(eq(purchaseDraftLines.purchaseDraftId, input.draftId));
      return { draft, lines };
    }),

  updateDraftLine: protectedProcedure
    .input(
      z.object({
        lineId: z.number(),
        productId: z.number().optional(),
        mrp: z.number().optional(),
        purchaseRate: z.number().optional(),
        saleRate: z.number().optional(),
        qty: z.number().optional(),
        freeQty: z.number().optional(),
        discount: z.number().optional(),
        gstRate: z.number().optional(),
        hsnCode: z.string().optional(),
        status: z.enum(["pending", "approved", "held", "rejected"]).optional(),
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
          .nullable()
          .optional(),
        correctionNotes: z.string().optional(),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { purchaseDraftLines } = await import("../../drizzle/schema");
      const { lineId, ...fields } = input;
      const u: any = {};
      if (fields.productId !== undefined) {
        u.productId = fields.productId;
        u.mappedProductId = fields.productId;
      }
      if (fields.mrp !== undefined) u.mrp = String(fields.mrp);
      if (fields.purchaseRate !== undefined)
        u.purchaseRate = String(fields.purchaseRate);
      if (fields.saleRate !== undefined) u.saleRate = String(fields.saleRate);
      if (fields.qty !== undefined) u.qty = fields.qty;
      if (fields.freeQty !== undefined) u.freeQty = fields.freeQty;
      if (fields.discount !== undefined) u.discount = String(fields.discount);
      if (fields.gstRate !== undefined) u.gstRate = String(fields.gstRate);
      if (fields.hsnCode !== undefined) u.hsnCode = fields.hsnCode;
      if (fields.status !== undefined) u.status = fields.status;
      if (fields.approvalStatus !== undefined) {
        u.approvalStatus = fields.approvalStatus;
        u.status = fields.approvalStatus;
        u.approvalDecision =
          fields.approvalStatus === "approved"
            ? "approve"
            : fields.approvalStatus === "rejected"
              ? "reject"
              : fields.approvalStatus === "held"
                ? "hold"
                : undefined;
        if (fields.approvalStatus === "approved") {
          u.approvedBy = ctx.user.id;
          u.approvedAt = new Date();
        }
      }
      if (fields.exceptionReason !== undefined)
        u.exceptionReason = fields.exceptionReason;
      if (fields.correctionNotes !== undefined)
        u.correctionNotes = fields.correctionNotes;
      if (fields.rejectionReason !== undefined)
        u.rejectionReason = fields.rejectionReason;
      if (fields.purchaseRate !== undefined && fields.gstRate !== undefined) {
        const lc =
          fields.purchaseRate *
          (1 - (fields.discount ?? 0) / 100) *
          (1 + fields.gstRate / 100);
        u.landingCost = String(lc.toFixed(2));
        if (fields.mrp && fields.mrp > 0)
          u.margin = String(
            (((fields.mrp - lc) / fields.mrp) * 100).toFixed(2)
          );
      }
      await db
        .update(purchaseDraftLines)
        .set(u)
        .where(eq(purchaseDraftLines.id, lineId));
      return { success: true };
    }),

  approveDraft: protectedProcedure
    .input(z.object({ draftId: z.number(), notes: z.string().optional() }))
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
      const { purchaseDrafts, purchaseDraftLines } = await import(
        "../../drizzle/schema"
      );
      const [draft] = await db
        .select()
        .from(purchaseDrafts)
        .where(eq(purchaseDrafts.id, input.draftId))
        .limit(1);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      if (draft.status !== "draft" && draft.status !== "under_review")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot approve draft in status: ${draft.status}`,
        });
      const lines = await db
        .select()
        .from(purchaseDraftLines)
        .where(eq(purchaseDraftLines.purchaseDraftId, input.draftId));
      const unsafe = lines.find(
        (line: any) =>
          line.approvalStatus !== "approved" ||
          line.status !== "approved" ||
          line.exceptionReason
      );
      if (unsafe)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "All OCR draft lines must be approved and exception-free before draft approval",
        });
      await db
        .update(purchaseDrafts)
        .set({
          status: "approved",
          approvalDecision: "approve",
          correctionNotes: input.notes,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          notes: input.notes,
        })
        .where(eq(purchaseDrafts.id, input.draftId));
      await logAudit({
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: "user",
        entityType: "purchase_draft",
        entityId: input.draftId,
        action: "ocr.approve",
        beforeJson: { status: draft.status },
        afterJson: { status: "approved" },
        source: "admin",
      });
      return { success: true };
    }),

  rejectDraft: protectedProcedure
    .input(z.object({ draftId: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const { purchaseDrafts } = await import("../../drizzle/schema");
      await db
        .update(purchaseDrafts)
        .set({
          status: "rejected",
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          rejectionReason: input.reason,
        })
        .where(eq(purchaseDrafts.id, input.draftId));
      await logAudit({
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: "user",
        entityType: "purchase_draft",
        entityId: input.draftId,
        action: "ocr.reject",
        reason: input.reason,
        source: "admin",
      });
      return { success: true };
    }),

  commitDraft: protectedProcedure
    .input(z.object({ draftId: z.number() }))
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
      const {
        purchaseDrafts,
        purchaseDraftLines,
        purchaseInvoices,
        purchaseLines,
        ingestionJobs,
        products,
      } = await import("../../drizzle/schema");
      const [draft] = await db
        .select()
        .from(purchaseDrafts)
        .where(eq(purchaseDrafts.id, input.draftId))
        .limit(1);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      if (draft.status === "committed")
        return {
          success: true,
          invoiceId: draft.committedInvoiceId,
          idempotent: true,
        };
      if (draft.status !== "approved")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Draft must be approved before purchase handoff",
        });
      const [job] = await db
        .select()
        .from(ingestionJobs)
        .where(eq(ingestionJobs.id, draft.ingestionJobId))
        .limit(1);
      const lines = await db
        .select()
        .from(purchaseDraftLines)
        .where(eq(purchaseDraftLines.purchaseDraftId, input.draftId));
      assertOcrDraftApprovedForHandoff(draft, lines);
      const [invoice] = await db
        .insert(purchaseInvoices)
        .values({
          supplierId: draft.supplierId ?? 0,
          storeId: job?.storeId ?? 0,
          invoiceNo: draft.invoiceNo ?? `OCR-${Date.now()}`,
          invoiceDate: draft.invoiceDate
            ? new Date(draft.invoiceDate)
            : new Date(),
          sourceType: "ocr",
          status: "draft",
          createdBy: ctx.user.id,
        })
        .$returningId();
      for (const line of lines) {
        const productId = line.productId ?? line.mappedProductId;
        const [product] = productId
          ? await db
              .select()
              .from(products)
              .where(eq(products.id, productId))
              .limit(1)
          : [];
        assertRuntimeGate(
          validatePurchaseLineMaster({
            product: product ? productToMasterLike(product) : null,
            productId,
            batchNo: line.batchNo,
            expiryDate: line.expiryDate,
            mrp: line.mrp,
            purchaseRate: line.purchaseRate,
            hsnCode: line.hsnCode,
            gstRate: line.gstRate,
          }),
          "OCR approved draft has incomplete product master or purchase metadata"
        );
        await db.insert(purchaseLines).values({
          purchaseInvoiceId: invoice.id,
          productId,
          batchNo: line.batchNo,
          expiryDate: new Date(line.expiryDate as string),
          mrp: line.mrp,
          purchaseRate: line.purchaseRate,
          qty: line.qty,
          freeQty: line.freeQty ?? 0,
          schemeDiscount: line.discount ?? "0",
          gstRate: line.gstRate ?? "0",
          hsnCode: line.hsnCode ?? undefined,
          rawLineText: line.rawLineText ?? null,
          confidence: line.confidence ?? null,
          reviewerId: line.approvedBy ?? ctx.user.id,
        } as any);
      }
      await db
        .update(purchaseDrafts)
        .set({ status: "committed", committedInvoiceId: invoice.id })
        .where(eq(purchaseDrafts.id, input.draftId));
      await db
        .update(ingestionJobs)
        .set({ status: "committed", committedAt: new Date() })
        .where(eq(ingestionJobs.id, draft.ingestionJobId));
      await logAudit({
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        actorType: "user",
        entityType: "purchase_draft",
        entityId: input.draftId,
        action: "ocr.commit",
        afterJson: { committedInvoiceId: invoice.id },
        source: "admin",
      });
      return {
        success: true,
        invoiceId: invoice.id,
        nextStep: "purchase.commitInvoice",
      };
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
      const conditions: any[] = [];
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
      const csvData = rows.map((row: any) => ({ ...row }));
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
