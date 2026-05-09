/**
 * ocrIngestionRouter — PART 6: AI OCR Bill Ingestion V1
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logAudit } from "../services/audit";
import { router, protectedProcedure } from "../_core/trpc";
import { eq, and, desc, like, or, inArray } from "drizzle-orm";
import {
  approvalStatusForException,
  assertOcrDraftApprovedForHandoff,
  buildOcrExceptionReport,
  classifyOcrLineException,
} from "../services/ocrPurchaseInwarding";
import { normalizeProductName } from "../services/productNormalization";
import {
  assertRuntimeGate,
  productToMasterLike,
  validatePurchaseLineMaster,
} from "../services/productMasterValidation";
import {
  assertRealOcrEvidence,
  getOcrProviderReadiness,
  isUnsafeOcrEvidenceUrl,
  parseManualCsvImport,
} from "../services/ocrProductionSafety";

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

const AUTO_MATCH_THRESHOLD = 95;
const REVIEW_THRESHOLD = 70;
const SCHEDULE_GATE_CODES = ["H", "H1", "X", "NRX"];

function decideMatchStatus(
  confidence: number,
  scheduleCode?: string | null
): "auto_matched" | "review_required" | "unknown_sku" {
  if (scheduleCode && SCHEDULE_GATE_CODES.includes(scheduleCode.toUpperCase()))
    return "review_required";
  if (confidence >= AUTO_MATCH_THRESHOLD) return "auto_matched";
  if (confidence >= REVIEW_THRESHOLD) return "review_required";
  return "unknown_sku";
}

async function matchProduct(
  db: any,
  line: {
    itemName: string;
    manufacturer?: string;
    hsnCode?: string;
    gstRate?: number;
  }
): Promise<
  Array<{ productId: number; score: number; method: string; details: string }>
> {
  const { products } = await import("../../drizzle/schema");
  const candidates: Array<{
    productId: number;
    score: number;
    method: string;
    details: string;
  }> = [];
  if (!line.itemName) return candidates;
  const name = normalizeProductName(line.itemName).toLowerCase();
  const exactMatches = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.name, line.itemName))
    .limit(5);
  for (const m of exactMatches)
    candidates.push({
      productId: m.id,
      score: 100,
      method: "exact_name",
      details: `Exact: "${m.name}"`,
    });
  if (candidates.length === 0 && name.length >= 4) {
    const words = name.split(/\s+/).filter((w: string) => w.length >= 3);
    for (const word of words.slice(0, 2)) {
      const fuzzy = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(like(products.name, `%${word}%`))
        .limit(5);
      for (const m of fuzzy) {
        if (!candidates.find((c: any) => c.productId === m.id)) {
          const pw = m.name.toLowerCase().split(/\s+/);
          const iw = name.split(/\s+/);
          const overlap = iw.filter((w: string) =>
            pw.some((p: string) => p.includes(w) || w.includes(p))
          ).length;
          const score = Math.min(
            90,
            60 + (overlap / Math.max(iw.length, 1)) * 30
          );
          candidates.push({
            productId: m.id,
            score,
            method: "fuzzy_name",
            details: `Fuzzy "${word}": "${m.name}" (${Math.round(score)}%)`,
          });
        }
      }
    }
  }
  if (line.hsnCode && line.gstRate !== undefined) {
    const hsnMatches = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(
        and(
          eq(products.hsnCode, line.hsnCode),
          eq(products.gstRate, String(line.gstRate))
        )
      )
      .limit(3);
    for (const m of hsnMatches) {
      if (!candidates.find((c: any) => c.productId === m.id))
        candidates.push({
          productId: m.id,
          score: 65,
          method: "hsn_gst",
          details: `HSN ${line.hsnCode} + GST ${line.gstRate}%`,
        });
    }
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
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

  processJob: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
        rawCsvText: z.string().optional(),
        useLlmOcr: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requirePurchaseRole(ctx.user.role);
      const db = await getDb();
      const {
        ingestionJobs,
        ocrExtractedHeaders,
        ocrExtractedLines,
        ocrMatchCandidates,
        ocrReviewTasks,
        aiDecisions,
      } = await import("../../drizzle/schema");
      const [job] = await db
        .select()
        .from(ingestionJobs)
        .where(eq(ingestionJobs.id, input.jobId))
        .limit(1);
      if (!job)
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      await db
        .update(ingestionJobs)
        .set({ status: "processing" })
        .where(eq(ingestionJobs.id, input.jobId));
      try {
        let parsed: ReturnType<typeof parseManualCsvImport>;
        const isManualCsvImport = job.sourceType === "csv_import";
        if (isManualCsvImport) {
          if (!input.rawCsvText?.trim())
            throw new Error("manual_required: CSV import text is required");
          parsed = parseManualCsvImport(input.rawCsvText);
        } else {
          assertRealOcrEvidence({ fileUrl: job.fileUrl, fileKey: job.fileKey });
          const readiness = getOcrProviderReadiness();
          if (!readiness.ok) {
            await db
              .update(ingestionJobs)
              .set({
                status: "failed",
                errorMessage: `${readiness.status}: ${readiness.reason}`,
              })
              .where(eq(ingestionJobs.id, input.jobId));
            return {
              success: false,
              status: readiness.status,
              manualRequired: true,
              reason: readiness.reason,
            };
          }
          if (!input.useLlmOcr) {
            await db
              .update(ingestionJobs)
              .set({
                status: "failed",
                errorMessage:
                  "manual_required: OCR provider execution was not requested",
              })
              .where(eq(ingestionJobs.id, input.jobId));
            return {
              success: false,
              status: "manual_required",
              manualRequired: true,
              reason: "OCR provider execution was not requested",
            };
          }
          const { invokeLLM } = await import("../_core/llm");
          const ocrPrompt = `You are a pharmacy purchase bill OCR system. Extract all data from this purchase invoice image. Return JSON with header (supplierName, supplierGstin, invoiceNo, invoiceDate, totalAmount, confidence 0-100) and lines array (lineNo, rawText, itemName, manufacturer, batchNo, expiryDate, mrp, purchaseRate, qty, freeQty, discount, gstRate, hsnCode, confidence 0-100). H/H1/X items: max confidence 80.`;
          const response = await invokeLLM({
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: ocrPrompt },
                  {
                    type: "image_url",
                    image_url: { url: job.fileUrl, detail: "high" },
                  },
                ] as any,
              },
            ],
          });
          const raw = response.choices[0]?.message?.content;
          if (!raw)
            throw new Error(
              "manual_required: OCR provider returned no parse payload"
            );
          const providerParsed =
            typeof raw === "string" ? JSON.parse(raw) : raw;
          parsed = {
            header: {
              ...providerParsed.header,
              confidence: providerParsed.header?.confidence ?? 0,
            },
            lines: providerParsed.lines ?? [],
          };
          if (!parsed.lines.length)
            throw new Error(
              "manual_required: OCR provider returned no invoice line items"
            );
        }
        const [header] = await db
          .insert(ocrExtractedHeaders)
          .values({
            ingestionJobId: input.jobId,
            supplierName: parsed.header.supplierName,
            supplierGstin: parsed.header.supplierGstin,
            invoiceNo: parsed.header.invoiceNo,
            invoiceDate: parsed.header.invoiceDate,
            totalAmount: String(parsed.header.totalAmount),
            confidence: String(parsed.header.confidence),
            reviewStatus: isManualCsvImport
              ? "pending"
              : parsed.header.confidence >= 80
                ? "approved"
                : "pending",
          })
          .$returningId();
        if (parsed.header.confidence < 80) {
          await db
            .insert(ocrReviewTasks)
            .values({
              ingestionJobId: input.jobId,
              taskType: "header_review",
              priority: "high",
              status: "pending",
            });
        }
        let autoMatched = 0,
          reviewRequired = 0,
          unknownSku = 0;
        for (const line of parsed.lines) {
          const [insertedLine] = await db
            .insert(ocrExtractedLines)
            .values({
              ingestionJobId: input.jobId,
              lineNo: line.lineNo,
              rawText: line.rawText,
              rawLineText: line.rawText,
              itemName: line.itemName,
              extractedProductName: line.itemName,
              manufacturer: line.manufacturer,
              batchNo: line.batchNo,
              extractedBatchNo: line.batchNo,
              expiryDate: line.expiryDate,
              extractedExpiry: line.expiryDate,
              mrp: String(line.mrp),
              extractedMRP: String(line.mrp),
              purchaseRate: String(line.purchaseRate),
              extractedCost: String(line.purchaseRate),
              qty: line.qty,
              extractedQty: line.qty,
              freeQty: line.freeQty,
              discount: String(line.discount),
              gstRate: String(line.gstRate),
              hsnCode: line.hsnCode,
              confidence: String(line.confidence),
              matchStatus: "review_required",
              approvalStatus: "pending",
            })
            .$returningId();
          const lineId = insertedLine.id;
          const matchCandidates = await matchProduct(db, {
            itemName: line.itemName,
            manufacturer: line.manufacturer,
            hsnCode: line.hsnCode,
            gstRate: line.gstRate,
          });
          for (const candidate of matchCandidates) {
            await db
              .insert(ocrMatchCandidates)
              .values({
                ocrLineId: lineId,
                productId: candidate.productId,
                matchScore: String(candidate.score),
                matchMethod: candidate.method as any,
                matchDetails: candidate.details,
                isSelected: false,
              });
          }
          const bestMatch = matchCandidates[0];
          const combinedConfidence =
            line.confidence * 0.4 + (bestMatch?.score ?? 0) * 0.6;
          const exceptionReason = classifyOcrLineException({
            confidence: line.confidence,
            batchNo: line.batchNo,
            expiryDate: line.expiryDate,
            qty: line.qty,
            mrp: line.mrp,
            purchaseRate: line.purchaseRate,
            hsnCode: line.hsnCode,
            gstRate: line.gstRate,
            matchedProductId: bestMatch?.productId ?? null,
            matchConfidence: combinedConfidence,
            candidateCount: matchCandidates.length,
          });
          const approvalStatus = approvalStatusForException(exceptionReason);
          const matchStatus = exceptionReason
            ? "review_required"
            : decideMatchStatus(combinedConfidence, null);
          await db
            .update(ocrExtractedLines)
            .set({
              matchedProductId: bestMatch?.productId ?? null,
              mappedProductId: bestMatch?.productId ?? null,
              matchConfidence: String(Math.round(combinedConfidence)),
              matchStatus,
              exceptionReason,
              approvalStatus,
            })
            .where(eq(ocrExtractedLines.id, lineId));
          if (bestMatch && !exceptionReason)
            await db
              .update(ocrMatchCandidates)
              .set({ isSelected: true })
              .where(
                and(
                  eq(ocrMatchCandidates.ocrLineId, lineId),
                  eq(ocrMatchCandidates.productId, bestMatch.productId)
                )
              );
          await db
            .insert(aiDecisions)
            .values({
              ingestionJobId: input.jobId,
              ocrLineId: lineId,
              decisionType:
                matchStatus === "auto_matched"
                  ? "auto_match"
                  : matchStatus === "unknown_sku"
                    ? "sku_create"
                    : "review_flag",
              confidence: String(Math.round(combinedConfidence)),
              reasoning: exceptionReason
                ? `Exception queued: ${exceptionReason}`
                : bestMatch
                  ? `Best match: "${bestMatch.details}" via ${bestMatch.method}`
                  : "No product match found",
              modelVersion: "v1-rule-based",
            });
          if (exceptionReason || matchStatus === "review_required") {
            reviewRequired++;
            await db
              .insert(ocrReviewTasks)
              .values({
                ingestionJobId: input.jobId,
                ocrLineId: lineId,
                taskType:
                  exceptionReason === "low_confidence"
                    ? "low_confidence"
                    : "line_review",
                priority:
                  exceptionReason || combinedConfidence < 75
                    ? "high"
                    : "medium",
                status: "pending",
                notes: exceptionReason,
              });
          } else if (matchStatus === "unknown_sku") {
            unknownSku++;
            await db
              .insert(ocrReviewTasks)
              .values({
                ingestionJobId: input.jobId,
                ocrLineId: lineId,
                taskType: "sku_creation",
                priority: "high",
                status: "pending",
                notes: "supplier_sku_unmapped",
              });
          } else {
            autoMatched++;
          }
        }
        await db
          .update(ingestionJobs)
          .set({
            status: isManualCsvImport ? "under_review" : "ocr_complete",
            processedAt: new Date(),
            totalLines: parsed.lines.length,
            matchedLines: isManualCsvImport ? 0 : autoMatched,
            reviewLines: isManualCsvImport
              ? parsed.lines.length
              : reviewRequired,
            unknownLines: unknownSku,
          })
          .where(eq(ingestionJobs.id, input.jobId));
        await logAudit({
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          actorType: "user",
          entityType: "ingestion_job",
          entityId: input.jobId,
          action: isManualCsvImport ? "manual_import.process" : "ocr.process",
          afterJson: {
            totalLines: parsed.lines.length,
            autoMatched: isManualCsvImport ? 0 : autoMatched,
            reviewRequired: isManualCsvImport
              ? parsed.lines.length
              : reviewRequired,
            unknownSku,
            sourceType: job.sourceType,
          },
          source: "admin",
        });
        return {
          success: !isManualCsvImport,
          status: isManualCsvImport
            ? "manual_import_under_review"
            : "ocr_complete",
          ocrSuccess: !isManualCsvImport,
          manualImport: isManualCsvImport,
          totalLines: parsed.lines.length,
          autoMatched: isManualCsvImport ? 0 : autoMatched,
          reviewRequired: isManualCsvImport
            ? parsed.lines.length
            : reviewRequired,
          unknownSku,
        };
      } catch (err: any) {
        await db
          .update(ingestionJobs)
          .set({ status: "failed", errorMessage: err.message })
          .where(eq(ingestionJobs.id, input.jobId));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
        });
      }
    }),

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
      const conditions: any[] = [];
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
      const conditions: any[] = [
        eq(ocrExtractedLines.ingestionJobId, input.jobId),
      ];
      if (input.matchStatus)
        conditions.push(eq(ocrExtractedLines.matchStatus, input.matchStatus));
      const lines = await db
        .select()
        .from(ocrExtractedLines)
        .where(and(...conditions))
        .orderBy(ocrExtractedLines.lineNo);
      const lineIds = lines.map((l: any) => l.id);
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
        lines: lines.map((line: any) => ({
          ...line,
          candidates: candidates.filter((c: any) => c.ocrLineId === line.id),
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
      const u: any = { reviewedBy: ctx.user.id, reviewedAt: new Date() };
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
        const productId =
          u.mappedProductId ??
          u.matchedProductId ??
          line.mappedProductId ??
          line.matchedProductId;
        const [product] = productId
          ? await db
              .select()
              .from(products)
              .where(eq(products.id, productId))
              .limit(1)
          : [];
        const mergedLine = { ...line, ...u };
        assertRuntimeGate(
          validatePurchaseLineMaster({
            product: product ? productToMasterLike(product) : null,
            productId,
            batchNo: mergedLine.batchNo,
            expiryDate: mergedLine.expiryDate,
            mrp: mergedLine.mrp,
            purchaseRate: mergedLine.purchaseRate,
            hsnCode: mergedLine.hsnCode,
            gstRate: mergedLine.gstRate,
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
      const u: any = {
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
      const conditions: any[] = [];
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
      assertOcrDraftApprovedForHandoff(draft, lines as any);
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
        await db
          .insert(purchaseLines)
          .values({
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
});
