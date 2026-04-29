/**
 * ocrIngestionRouter.ts
 * AI-powered purchase bill ingestion:
 *   1. uploadBill — accepts file URL, creates ingestion job, runs OCR via LLM
 *   2. listJobs   — lists ingestion jobs with status
 *   3. getJob     — returns job with extracted header + lines
 *   4. reviewLine — approve/reject/correct individual OCR lines
 *   5. commitDraft — commit approved draft to purchase invoice
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function requirePurchase(role: string) {
  if (!["admin", "super_admin", "store_manager", "purchase_manager", "inventory_operator", "pharmacist"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Purchase/pharmacy access required." });
  }
}

export const ocrIngestionRouter = router({
  // ── Upload bill and trigger OCR ───────────────────────────────────────────
  uploadBill: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      fileUrl: z.string().url(),
      fileKey: z.string(),
      filename: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { ingestionJobs, ocrExtractedHeaders, ocrExtractedLines, purchaseDrafts, purchaseDraftLines } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      // Create ingestion job
      const [jobResult] = await db.insert(ingestionJobs).values({
        storeId: input.storeId,
        jobType: "purchase_bill",
        status: "processing",
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        filename: input.filename,
        mimeType: input.mimeType,
        createdBy: ctx.user!.id,
      });
      const jobId = (jobResult as { insertId: number }).insertId;

      try {
        // Run OCR via LLM
        const { invokeLLM } = await import("../_core/llm");
        const ocrPrompt = `You are a pharmacy purchase bill OCR system. Extract all data from this purchase invoice image/PDF.

Return a JSON object with this exact structure:
{
  "header": {
    "supplierName": "string",
    "supplierGstin": "string or null",
    "invoiceNo": "string",
    "invoiceDate": "DD/MM/YYYY or null",
    "totalAmount": number or null,
    "confidence": 0-100
  },
  "lines": [
    {
      "lineNo": 1,
      "itemName": "string",
      "manufacturer": "string or null",
      "batchNo": "string or null",
      "expiryDate": "MM/YY or MM/YYYY or null",
      "mrp": number or null,
      "purchaseRate": number or null,
      "qty": number or null,
      "freeQty": number or 0,
      "discount": number or 0,
      "gstRate": number or null,
      "hsnCode": "string or null",
      "confidence": 0-100
    }
  ]
}

Rules:
- Extract ALL line items, even partial ones
- Set confidence 95+ only if clearly readable
- Set confidence 70-94 if partially readable
- Set confidence below 70 if guessed/unclear
- H/H1/X schedule items: set confidence to max 80 (always require human review)`;

        const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
          { type: "text", text: ocrPrompt },
        ];

        // Add image if it's an image file
        if (input.mimeType.startsWith("image/")) {
          contentParts.push({
            type: "image_url",
            image_url: { url: input.fileUrl, detail: "high" },
          });
        } else {
          // For PDFs, use text prompt only with URL reference
          contentParts[0].text = ocrPrompt + `\n\nDocument URL: ${input.fileUrl}`;
        }

        const response = await invokeLLM({
          messages: [
            {
              role: "user",
              content: contentParts as Parameters<typeof invokeLLM>[0]["messages"][0]["content"],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "purchase_bill_ocr",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  header: {
                    type: "object",
                    properties: {
                      supplierName: { type: "string" },
                      supplierGstin: { type: ["string", "null"] },
                      invoiceNo: { type: "string" },
                      invoiceDate: { type: ["string", "null"] },
                      totalAmount: { type: ["number", "null"] },
                      confidence: { type: "number" },
                    },
                    required: ["supplierName", "supplierGstin", "invoiceNo", "invoiceDate", "totalAmount", "confidence"],
                    additionalProperties: false,
                  },
                  lines: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        lineNo: { type: "number" },
                        itemName: { type: "string" },
                        manufacturer: { type: ["string", "null"] },
                        batchNo: { type: ["string", "null"] },
                        expiryDate: { type: ["string", "null"] },
                        mrp: { type: ["number", "null"] },
                        purchaseRate: { type: ["number", "null"] },
                        qty: { type: ["number", "null"] },
                        freeQty: { type: "number" },
                        discount: { type: "number" },
                        gstRate: { type: ["number", "null"] },
                        hsnCode: { type: ["string", "null"] },
                        confidence: { type: "number" },
                      },
                      required: ["lineNo", "itemName", "manufacturer", "batchNo", "expiryDate", "mrp", "purchaseRate", "qty", "freeQty", "discount", "gstRate", "hsnCode", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["header", "lines"],
                additionalProperties: false,
              },
            },
          },
        });

        const rawContent = response.choices[0].message.content;
        const parsed = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;

        // Store extracted header
        await db.insert(ocrExtractedHeaders).values({
          ingestionJobId: jobId,
          supplierName: parsed.header.supplierName,
          supplierGstin: parsed.header.supplierGstin,
          invoiceNo: parsed.header.invoiceNo,
          invoiceDate: parsed.header.invoiceDate,
          totalAmount: parsed.header.totalAmount?.toString(),
          confidence: parsed.header.confidence?.toString(),
        });

        // Store extracted lines
        for (const line of parsed.lines) {
          const matchStatus = line.confidence >= 95 ? "auto_matched" : line.confidence >= 70 ? "review_required" : "unknown_sku";
          await db.insert(ocrExtractedLines).values({
            ingestionJobId: jobId,
            lineNo: line.lineNo,
            itemName: line.itemName,
            manufacturer: line.manufacturer,
            batchNo: line.batchNo,
            expiryDate: line.expiryDate,
            mrp: line.mrp?.toString(),
            purchaseRate: line.purchaseRate?.toString(),
            qty: line.qty,
            freeQty: line.freeQty ?? 0,
            discount: line.discount?.toString(),
            gstRate: line.gstRate?.toString(),
            hsnCode: line.hsnCode,
            confidence: line.confidence?.toString(),
            matchStatus,
          });
        }

        // Create purchase draft
        const [draftResult] = await db.insert(purchaseDrafts).values({
          ingestionJobId: jobId,
          invoiceNo: parsed.header.invoiceNo,
          invoiceDate: parsed.header.invoiceDate,
          status: "draft",
        });
        const draftId = (draftResult as { insertId: number }).insertId;

        // Mark job complete
        await db.update(ingestionJobs).set({
          status: "ocr_complete",
          ocrRawText: JSON.stringify(parsed),
          ocrConfidence: parsed.header.confidence?.toString(),
          processedAt: new Date(),
        }).where(eq(ingestionJobs.id, jobId));

        return { jobId, draftId, linesExtracted: parsed.lines.length };
      } catch (err) {
        await db.update(ingestionJobs).set({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "OCR failed",
        }).where(eq(ingestionJobs.id, jobId));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "OCR processing failed" });
      }
    }),

  // ── List ingestion jobs ───────────────────────────────────────────────────
  listJobs: protectedProcedure
    .input(z.object({
      storeId: z.number().optional(),
      status: z.enum(["queued", "processing", "ocr_complete", "under_review", "committed", "failed"]).optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { ingestionJobs } = await import("../../drizzle/schema");
      const { eq, and, desc } = await import("drizzle-orm");
      const conditions = [];
      if (input.storeId) conditions.push(eq(ingestionJobs.storeId, input.storeId));
      if (input.status) conditions.push(eq(ingestionJobs.status, input.status));
      return db.select().from(ingestionJobs)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(ingestionJobs.createdAt))
        .limit(input.limit);
    }),

  // ── Get job details with extracted lines ──────────────────────────────────
  getJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { ingestionJobs, ocrExtractedHeaders, ocrExtractedLines, purchaseDrafts } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [job] = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, input.jobId));
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });

      const [header] = await db.select().from(ocrExtractedHeaders).where(eq(ocrExtractedHeaders.ingestionJobId, input.jobId));
      const lines = await db.select().from(ocrExtractedLines).where(eq(ocrExtractedLines.ingestionJobId, input.jobId));
      const [draft] = await db.select().from(purchaseDrafts).where(eq(purchaseDrafts.ingestionJobId, input.jobId));

      return { job, header, lines, draft };
    }),

  // ── Review / correct a line ───────────────────────────────────────────────
  reviewLine: protectedProcedure
    .input(z.object({
      lineId: z.number(),
      matchStatus: z.enum(["auto_matched", "review_required", "unknown_sku", "rejected"]),
      matchedProductId: z.number().optional(),
      corrections: z.object({
        itemName: z.string().optional(),
        batchNo: z.string().optional(),
        expiryDate: z.string().optional(),
        mrp: z.string().optional(),
        purchaseRate: z.string().optional(),
        qty: z.number().optional(),
        hsnCode: z.string().optional(),
        gstRate: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { ocrExtractedLines } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(ocrExtractedLines).set({
        matchStatus: input.matchStatus,
        matchedProductId: input.matchedProductId,
        reviewedBy: ctx.user!.id,
        reviewedAt: new Date(),
        ...(input.corrections ?? {}),
      }).where(eq(ocrExtractedLines.id, input.lineId));
      return { success: true };
    }),

  // ── Commit draft to purchase invoice ─────────────────────────────────────
  commitDraft: protectedProcedure
    .input(z.object({
      draftId: z.number(),
      supplierId: z.number(),
      storeId: z.number(),
      invoiceDate: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      requirePurchase(ctx.user!.role);
      const db = await getDbSafe();
      const { purchaseDrafts, ocrExtractedLines, purchaseInvoices, purchaseLines, ingestionJobs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const [draft] = await db.select().from(purchaseDrafts).where(eq(purchaseDrafts.id, input.draftId));
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });

      // Get approved lines
      const lines = await db.select().from(ocrExtractedLines)
        .where(eq(ocrExtractedLines.ingestionJobId, draft.ingestionJobId));

      const approvedLines = lines.filter(l => l.matchStatus === "auto_matched" && l.matchedProductId);
      if (!approvedLines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No approved lines to commit" });

      // Create purchase invoice
      const [invResult] = await db.insert(purchaseInvoices).values({
        supplierId: input.supplierId,
        storeId: input.storeId,
        invoiceNo: draft.invoiceNo ?? `OCR-${draft.id}`,
        invoiceDate: input.invoiceDate,
        status: "draft",
        createdBy: ctx.user!.id,
      });
      const invoiceId = (invResult as { insertId: number }).insertId;

      // Create purchase lines
      for (const line of approvedLines) {
        if (!line.matchedProductId) continue;
        await db.insert(purchaseLines).values({
          purchaseInvoiceId: invoiceId,
          productId: line.matchedProductId,
          batchNo: line.batchNo ?? "UNKNOWN",
          expiryDate: line.expiryDate ? new Date(line.expiryDate) : new Date(),
          mrp: line.mrp ?? "0",
          purchaseRate: line.purchaseRate ?? "0",
          qty: line.qty ?? 0,
          freeQty: line.freeQty ?? 0,
          schemeDiscount: line.discount ?? "0",
          gstRate: line.gstRate ?? "12",
          hsnCode: line.hsnCode ?? undefined,
        });
      }

      // Update draft status
      await db.update(purchaseDrafts).set({
        status: "committed",
        reviewedBy: ctx.user!.id,
        reviewedAt: new Date(),
        committedInvoiceId: invoiceId,
      }).where(eq(purchaseDrafts.id, input.draftId));

      // Update ingestion job
      await db.update(ingestionJobs).set({
        status: "committed",
        committedAt: new Date(),
      }).where(eq(ingestionJobs.id, draft.ingestionJobId));

      return { invoiceId, linesCommitted: approvedLines.length };
    }),
});
