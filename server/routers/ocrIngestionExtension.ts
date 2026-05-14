/**
 * ocrIngestionExtension — processJob procedure + matching helpers
 * Extracted from ocrIngestionRouter to keep files under 600 counted lines.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { logAudit } from "../services/audit";
import { protectedProcedure } from "../_core/trpc";
import { eq, and, like } from "drizzle-orm";
import {
  approvalStatusForException,
  classifyOcrLineException,
} from "../services/ocrPurchaseInwarding";
import { normalizeProductName } from "../services/productNormalization";
import {
  assertRealOcrEvidence,
  getOcrProviderReadiness,
  parseManualCsvImport,
} from "../services/ocrProductionSafety";
import type { getDb as _getDbType } from "../db";

type OcrDb = NonNullable<Awaited<ReturnType<typeof _getDbType>>>;

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

export function decideMatchStatus(
  confidence: number,
  scheduleCode?: string | null
): "auto_matched" | "review_required" | "unknown_sku" {
  if (scheduleCode && SCHEDULE_GATE_CODES.includes(scheduleCode.toUpperCase()))
    return "review_required";
  if (confidence >= AUTO_MATCH_THRESHOLD) return "auto_matched";
  if (confidence >= REVIEW_THRESHOLD) return "review_required";
  return "unknown_sku";
}

export async function matchProduct(
  db: OcrDb,
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
    const words = name.split(/\s+/).filter(w => w.length >= 3);
    for (const word of words.slice(0, 2)) {
      const fuzzy = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(like(products.name, `%${word}%`))
        .limit(5);
      for (const m of fuzzy) {
        if (!candidates.find(c => c.productId === m.id)) {
          const pw = m.name.toLowerCase().split(/\s+/);
          const iw = name.split(/\s+/);
          const overlap = iw.filter(w =>
            pw.some(p => p.includes(w) || w.includes(p))
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
      if (!candidates.find(c => c.productId === m.id))
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

export const processJobProcedure = protectedProcedure
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
              ] as unknown as string,
            },
          ],
        });
        const raw = response.choices[0]?.message?.content;
        if (!raw)
          throw new Error(
            "manual_required: OCR provider returned no parse payload"
          );
        const providerParsed = (
          typeof raw === "string" ? JSON.parse(raw) : raw
        ) as {
          header?: Record<string, unknown> & { confidence?: number };
          lines?: unknown[];
        };
        parsed = {
          header: {
            ...providerParsed.header,
            confidence: providerParsed.header?.confidence ?? 0,
          },
          lines: providerParsed.lines ?? [],
        } as ReturnType<typeof parseManualCsvImport>;
        if (!parsed.lines.length)
          throw new Error(
            "manual_required: OCR provider returned no invoice line items"
          );
      }
      const [_header] = await db
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
        await db.insert(ocrReviewTasks).values({
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
          await db.insert(ocrMatchCandidates).values({
            ocrLineId: lineId,
            productId: candidate.productId,
            matchScore: String(candidate.score),
            matchMethod: candidate.method as
              | "barcode"
              | "exact_name"
              | "fuzzy_name"
              | "hsn_gst"
              | "supplier_alias"
              | "previous_mapping"
              | "manufacturer_strength",
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
        await db.insert(aiDecisions).values({
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
          await db.insert(ocrReviewTasks).values({
            ingestionJobId: input.jobId,
            ocrLineId: lineId,
            taskType:
              exceptionReason === "low_confidence"
                ? "low_confidence"
                : "line_review",
            priority:
              exceptionReason || combinedConfidence < 75 ? "high" : "medium",
            status: "pending",
            notes: exceptionReason,
          });
        } else if (matchStatus === "unknown_sku") {
          unknownSku++;
          await db.insert(ocrReviewTasks).values({
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
          reviewLines: isManualCsvImport ? parsed.lines.length : reviewRequired,
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
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Processing failed";
      await db
        .update(ingestionJobs)
        .set({ status: "failed", errorMessage: errMsg })
        .where(eq(ingestionJobs.id, input.jobId));
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: errMsg,
      });
    }
  });
