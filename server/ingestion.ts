/**
 * Invoice Ingestion Engine
 *
 * Handles PDF/image invoice uploads, OCR via LLM, product matching,
 * duplicate detection, and human-review workflow.
 *
 * Flow:
 *   1. Operator uploads invoice PDF → storagePut → invoiceIngestions row created
 *   2. ocrJobs row queued → worker picks it up → invokeLLM extracts line items
 *   3. Each line item matched against products table (fuzzy name match)
 *   4. humanReviewItems rows created with match confidence + duplicate flag
 *   5. Human reviewer approves/rejects/merges each item
 *   6. On approveAll → batches/storeSkus updated (GRN flow)
 */

import { getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import {
  invoiceIngestions,
  ocrJobs,
  humanReviewItems,
  products,
  productVariants,
} from "../drizzle/schema";
import { eq, like, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedLineItem {
  rawLine: string;
  parsedName: string | null;
  parsedBatch: string | null;
  parsedExpiry: string | null;
  parsedQty: number | null;
  parsedUnitCost: number | null;
  parsedMrp: number | null;
  parsedBarcode: string | null;
}

export interface ProductMatch {
  productId: number;
  variantId: number | null;
  confidence: number; // 0–100
}

// ─── OCR Extraction ───────────────────────────────────────────────────────────

/**
 * Calls the LLM to extract structured line items from an invoice PDF/image URL.
 * Returns an array of ExtractedLineItem objects.
 */
export async function extractInvoiceItems(
  fileUrl: string,
  mimeType: string
): Promise<ExtractedLineItem[]> {
  const isPdf = mimeType === "application/pdf";

  const contentPart = isPdf
    ? {
        type: "file_url" as const,
        file_url: {
          url: fileUrl,
          mime_type: "application/pdf" as const,
        },
      }
    : {
        type: "image_url" as const,
        image_url: { url: fileUrl, detail: "high" as const },
      };

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a pharmacy invoice parser. Extract every line item from the invoice and return structured JSON.",
      },
      {
        role: "user",
        content: [
          contentPart,
          {
            type: "text" as const,
            text: "Extract all product line items from this pharmacy invoice. For each item return: rawLine (verbatim text), parsedName (product name), parsedBatch (batch/lot number), parsedExpiry (expiry date as string), parsedQty (integer quantity), parsedUnitCost (unit cost as number), parsedMrp (MRP as number), parsedBarcode (barcode/HSN if present, else null).",
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "invoice_items",
        strict: true,
        schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  rawLine: { type: "string" },
                  parsedName: { type: ["string", "null"] },
                  parsedBatch: { type: ["string", "null"] },
                  parsedExpiry: { type: ["string", "null"] },
                  parsedQty: { type: ["integer", "null"] },
                  parsedUnitCost: { type: ["number", "null"] },
                  parsedMrp: { type: ["number", "null"] },
                  parsedBarcode: { type: ["string", "null"] },
                },
                required: [
                  "rawLine",
                  "parsedName",
                  "parsedBatch",
                  "parsedExpiry",
                  "parsedQty",
                  "parsedUnitCost",
                  "parsedMrp",
                  "parsedBarcode",
                ],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) return [];

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return (parsed.items ?? []) as ExtractedLineItem[];
  } catch {
    return [];
  }
}

// ─── Product Matching ─────────────────────────────────────────────────────────

/**
 * Attempts to match a parsed product name against the products table.
 * Returns the best match with a confidence score (0–100).
 */
export async function matchProduct(
  parsedName: string | null
): Promise<ProductMatch | null> {
  if (!parsedName) return null;

  const db = await getDb();
  if (!db) return null;

  const name = parsedName.trim().toLowerCase();

  // Try exact match first (confidence 100)
  const exactMatches = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(like(products.name, parsedName))
    .limit(1);

  if (exactMatches.length > 0) {
    const variants = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, exactMatches[0].id))
      .limit(1);

    return {
      productId: exactMatches[0].id,
      variantId: variants[0]?.id ?? null,
      confidence: 100,
    };
  }

  // Partial match by first significant word
  const words = name.split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return null;

  const partialMatches = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(like(products.name, `%${words[0]}%`))
    .limit(10);

  if (partialMatches.length === 0) return null;

  let bestMatch = partialMatches[0];
  let bestScore = 0;

  for (const match of partialMatches) {
    const matchName = match.name.toLowerCase();
    const matchWords = matchName.split(/\s+/);
    const overlap = words.filter((w) =>
      matchWords.some((mw) => mw.includes(w) || w.includes(mw))
    ).length;
    const score = Math.round(
      (overlap / Math.max(words.length, matchWords.length)) * 90
    );
    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
    }
  }

  if (bestScore < 40) return null;

  const variants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(eq(productVariants.productId, bestMatch.id))
    .limit(1);

  return {
    productId: bestMatch.id,
    variantId: variants[0]?.id ?? null,
    confidence: bestScore,
  };
}

// ─── Duplicate Detection ──────────────────────────────────────────────────────

/**
 * Checks if an item with the same batch number already exists in this ingestion.
 * Returns the ID of the duplicate item, or null if no duplicate found.
 */
export async function detectDuplicate(
  ingestionId: number,
  parsedBatch: string | null,
  parsedName: string | null
): Promise<number | null> {
  if (!parsedBatch && !parsedName) return null;

  const db = await getDb();
  if (!db) return null;

  const condition = parsedBatch
    ? and(
        eq(humanReviewItems.ingestionId, ingestionId),
        eq(humanReviewItems.parsedBatch, parsedBatch)
      )
    : and(
        eq(humanReviewItems.ingestionId, ingestionId),
        like(humanReviewItems.parsedName, parsedName ?? "")
      );

  const existing = await db
    .select({ id: humanReviewItems.id })
    .from(humanReviewItems)
    .where(condition)
    .limit(1);

  return existing[0]?.id ?? null;
}

// ─── Full OCR Pipeline ────────────────────────────────────────────────────────

/**
 * Runs the full OCR pipeline for an ingestion:
 * 1. Marks OCR job as processing
 * 2. Calls LLM to extract items
 * 3. Matches each item against products
 * 4. Detects duplicates
 * 5. Creates humanReviewItems rows
 * 6. Updates ingestion status to under_review
 */
export async function runOcrPipeline(ingestionId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Fetch ingestion record
  const ingestionRows = await db
    .select()
    .from(invoiceIngestions)
    .where(eq(invoiceIngestions.id, ingestionId))
    .limit(1);

  if (ingestionRows.length === 0)
    throw new Error(`Ingestion ${ingestionId} not found`);
  const ingestion = ingestionRows[0];

  // Find the queued OCR job
  const jobRows = await db
    .select()
    .from(ocrJobs)
    .where(
      and(
        eq(ocrJobs.ingestionId, ingestionId),
        eq(ocrJobs.status, "queued")
      )
    )
    .limit(1);

  if (jobRows.length === 0)
    throw new Error(`No queued OCR job for ingestion ${ingestionId}`);
  const job = jobRows[0];

  // Mark as processing
  await db
    .update(ocrJobs)
    .set({
      status: "processing",
      startedAt: new Date(),
      attempts: job.attempts + 1,
    })
    .where(eq(ocrJobs.id, job.id));

  try {
    // Extract items via LLM
    const items = await extractInvoiceItems(ingestion.fileUrl, ingestion.mimeType);

    // Save raw response to OCR job
    await db
      .update(ocrJobs)
      .set({
        rawResponse: JSON.stringify(items),
        parsedJson: JSON.stringify(items),
      })
      .where(eq(ocrJobs.id, job.id));

    // Process each item: match + duplicate check
    const reviewRows: Parameters<typeof db.insert>[0] extends never
      ? never
      : Array<{
          ingestionId: number;
          rawLine: string;
          parsedName: string | null;
          parsedBatch: string | null;
          parsedExpiry: string | null;
          parsedQty: number | null;
          parsedUnitCost: string | null;
          parsedMrp: string | null;
          parsedBarcode: string | null;
          matchedProductId: number | null;
          matchedVariantId: number | null;
          matchConfidence: string | null;
          isDuplicate: boolean;
          duplicateOfId: number | null;
          status: "pending";
        }> = [];

    for (const item of items) {
      const match = await matchProduct(item.parsedName);
      const dupId = await detectDuplicate(
        ingestionId,
        item.parsedBatch,
        item.parsedName
      );

      reviewRows.push({
        ingestionId,
        rawLine: item.rawLine,
        parsedName: item.parsedName,
        parsedBatch: item.parsedBatch,
        parsedExpiry: item.parsedExpiry,
        parsedQty: item.parsedQty,
        parsedUnitCost: item.parsedUnitCost?.toString() ?? null,
        parsedMrp: item.parsedMrp?.toString() ?? null,
        parsedBarcode: item.parsedBarcode,
        matchedProductId: match?.productId ?? null,
        matchedVariantId: match?.variantId ?? null,
        matchConfidence: match ? match.confidence.toString() : null,
        isDuplicate: dupId !== null,
        duplicateOfId: dupId ?? null,
        status: "pending" as const,
      });
    }

    if (reviewRows.length > 0) {
      await db.insert(humanReviewItems).values(reviewRows);
    }

    // Update ingestion item count and status
    await db
      .update(invoiceIngestions)
      .set({
        ocrRawText: items.map((i) => i.rawLine).join("\n"),
        itemCount: reviewRows.length,
        status: "under_review",
      })
      .where(eq(invoiceIngestions.id, ingestionId));

    // Mark OCR job complete
    await db
      .update(ocrJobs)
      .set({ status: "complete", completedAt: new Date() })
      .where(eq(ocrJobs.id, job.id));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db
      .update(ocrJobs)
      .set({ status: "failed", errorMessage })
      .where(eq(ocrJobs.id, job.id));

    // Reset ingestion so worker can retry
    await db
      .update(invoiceIngestions)
      .set({ status: "pending_ocr" })
      .where(eq(invoiceIngestions.id, ingestionId));

    throw err;
  }
}
