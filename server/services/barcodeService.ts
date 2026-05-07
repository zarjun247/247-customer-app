import { and, asc, eq, or, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { batchLedger, labelPrintJobs, products, productBarcodes, barcodeAliases } from "../../drizzle/schema";
import { getCanonicalAvailability } from "./reservationService";

export function normalizeBarcodeInput(value: string) { return value.trim().replace(/\s+/g, "").toUpperCase(); }
export function generateInternalBarcode(seed: { productId: number; batchId?: number; storeId?: number }) {
  const raw = `${seed.productId}|${seed.batchId ?? 0}|${seed.storeId ?? 0}`;
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 10).toUpperCase();
  return `PHX-${hash}`;
}
export async function assertBarcodeUnique(barcode: string) {
  const db = await getDb(); if (!db) return;
  const code = normalizeBarcodeInput(barcode);
  const [a] = await db.select().from(barcodeAliases).where(eq(barcodeAliases.barcode, code)).limit(1);
  const [p] = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, code)).limit(1);
  if (a || p) throw new TRPCError({ code: "CONFLICT", message: "Barcode already exists" });
}
export async function registerBarcodeAlias(input: { barcode: string; productId?: number; batchId?: number; storeId?: number; aliasType: "manufacturer"|"internal"|"batch"|"shelf"|"legacy"; metadata?: any; }) {
  const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const barcode = normalizeBarcodeInput(input.barcode); await assertBarcodeUnique(barcode);
  const [row] = await db.insert(barcodeAliases).values({ ...input, barcode, isActive: true, metadata: input.metadata ? JSON.stringify(input.metadata): null });
  return row;
}
export async function resolveBarcode(barcodeInput: string, storeId?: number) {
  const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const barcode = normalizeBarcodeInput(barcodeInput);
  const [alias] = await db.select().from(barcodeAliases).where(and(eq(barcodeAliases.barcode, barcode), eq(barcodeAliases.isActive, true))).limit(1);
  const productId = alias?.productId ?? null;
  const q = db.select({ productId: products.id, name: products.name, requiresPrescription: products.requiresPrescription, schedule: products.schedule, batchId: batchLedger.id, batchNo: batchLedger.batchNo, expiryDate: batchLedger.expiryDate, mrp: batchLedger.mrp, batchAvailableQty: sql<number>`${batchLedger.qtyOnHand} - ${batchLedger.qtyReserved} - ${batchLedger.qtyQuarantined} - ${batchLedger.qtyExpired}` })
  .from(products).leftJoin(batchLedger, eq(batchLedger.productId, products.id))
  .where(productId ? eq(products.id, productId) : or(eq(products.barcode, barcode), eq(batchLedger.internalBarcode, barcode), eq(batchLedger.manufacturerBarcode, barcode))!);
  const rows = await q;
  const canonicalRows = await Promise.all(rows.map(async (row) => {
    if (!storeId || !row.productId) return { ...row, availableQty: Math.max(0, Number(row.batchAvailableQty ?? 0)) };
    const availability = await getCanonicalAvailability(storeId, row.productId, null);
    return { ...row, availableQty: availability.availableQty, canonicalAvailability: availability };
  }));
  return { barcode, rows: canonicalRows };
}
export const resolveBarcodeForSale = resolveBarcode;
export const resolveBarcodeForReturn = resolveBarcode;
export const resolveBarcodeForStockAudit = resolveBarcode;
export function getBarcodeLabelPayload(input: { productName: string; strength?: string|null; packSize?: string|null; batchNo?: string|null; expiryDate?: string|null; mrp?: string|number|null; internalBarcode: string; storeId?: number|null; }) {
  return { productName: input.productName, strength: input.strength ?? null, packSize: input.packSize ?? null, batchNo: input.batchNo ?? null, expiryDate: input.expiryDate ?? null, mrp: input.mrp ?? null, internalBarcode: input.internalBarcode, storeId: input.storeId ?? null };
}
export async function createLabelPrintJob(input: { barcodeAliasId?: number|null; productId?: number|null; batchId?: number|null; storeId?: number|null; labelType: "batch"|"shelf"|"mrp"|"return"|"audit"; payloadJson: any; printerName?: string|null; requestedBy?: number|null; }) {
  const db = await getDb(); if (!db) return null;
  const [r] = await db.insert(labelPrintJobs).values({ ...input, payloadJson: JSON.stringify(input.payloadJson), status: "queued" });
  return r;
}
export async function reprintLabel(id: number) { const db = await getDb(); if (!db) return; await db.update(labelPrintJobs).set({ status: "queued", error: null, printedAt: null }).where(eq(labelPrintJobs.id, id)); }
export async function getLabelPrintQueue(storeId?: number) { const db = await getDb(); if (!db) return []; return db.select().from(labelPrintJobs).where(storeId ? eq(labelPrintJobs.storeId, storeId) : sql`1=1`).orderBy(asc(labelPrintJobs.createdAt)); }
export async function markLabelPrinted(id: number, error?: string|null) { const db = await getDb(); if (!db) return; await db.update(labelPrintJobs).set({ status: error ? "failed" : "printed", error: error ?? null, printedAt: error ? null : new Date() }).where(eq(labelPrintJobs.id, id)); }
export async function recordScanEvent() { return; }
