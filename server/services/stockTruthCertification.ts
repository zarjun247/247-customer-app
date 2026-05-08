import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const APPROVED_STOCK_MUTATION_GATEWAYS = [
  "purchase commit -> increaseStockForPurchaseCommit/applyStockMovement",
  "sale confirmation -> decreaseStockForSaleConfirmation/applyStockMovement",
  "resaleable sale return -> reverseStockForSaleReturn/applyStockMovement",
  "stock adjustment approval -> adjustStock/applyStockAuditCorrection",
  "purchase return commit -> decreaseStockForPurchaseReturn/applyStockMovement",
  "quarantine on-hand decrement -> quarantineBatch/applyStockMovement",
  "disposal on-hand decrement -> disposeBatch/applyStockMovement",
  "transfer receive -> transferStock",
  "release quarantine -> releaseQuarantine",
  "opening stock/batch create -> createBatchWithOpeningStock",
  "stock audit correction movement -> applyStockAuditCorrection",
  "reservation create/release/consume -> reservationService durable reservation gateway",
] as const;

export const STOCK_MUTATION_SCANNER_PATTERNS = [
  /qtyOnHand\s*:/,
  /stockQty\s*:/,
  /availableQty\s*:/,
  /qtyReserved\s*:/,
  /qtyQuarantined\s*:/,
  /insert\s*\(\s*stockMovements\s*\)/,
  /update\s*\(\s*stockMovements\s*\)/,
  /insert\s*\(\s*stockReservations\s*\)/,
  /update\s*\(\s*stockReservations\s*\)/,
  /delete\s*\(\s*stockReservations\s*\)/,
  /insert\s*\(\s*batchLedger\s*\)/,
  /update\s*\(\s*batchLedger\s*\)/,
  /update\s*\(\s*batches\s*\)/,
  /update\s*\(\s*storeSkus\s*\)/,
  /inventory\.(adjustment|audit|quarantine|dispose|transfer).*update\s*\(/,
] as const;

const DEFAULT_ALLOWED_PATHS = [
  "server/services/stockInvariant.ts",
  "server/services/reservationService.ts",
  "server/services/stockTruthCertification.ts",
  "server/testUtils/",
  "server/stock-truth-certification.guard.test.ts",
  "drizzle/",
  "scripts/seed",
] as const;

export type StockMutationScanFile = { path: string; content: string };
export type StockMutationViolation = { path: string; line: number; pattern: string; text: string };

function normalized(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isApprovedStockMutationPath(path: string, allowlist: readonly string[] = DEFAULT_ALLOWED_PATHS) {
  const clean = normalized(path);
  return allowlist.some((allowed) => clean === allowed || clean.startsWith(allowed));
}

export function scanStockMutationContent(files: StockMutationScanFile[], allowlist: readonly string[] = DEFAULT_ALLOWED_PATHS): StockMutationViolation[] {
  const violations: StockMutationViolation[] = [];
  for (const file of files) {
    if (isApprovedStockMutationPath(file.path, allowlist)) continue;
    const lines = file.content.split(/\r?\n/);
    lines.forEach((lineText, index) => {
      const line = lineText.trim();
      if (!line || line.startsWith("//") || line.startsWith("*")) return;
      for (const pattern of STOCK_MUTATION_SCANNER_PATTERNS) {
        if (pattern.test(line)) violations.push({ path: normalized(file.path), line: index + 1, pattern: pattern.source, text: line });
      }
    });
  }
  return violations;
}

export function collectStockMutationScanFiles(rootDir = process.cwd()): StockMutationScanFile[] {
  const roots = ["server", "scripts"].map((dir) => join(rootDir, dir));
  const files: StockMutationScanFile[] = [];
  const visit = (path: string) => {
    const st = statSync(path);
    if (st.isDirectory()) {
      const base = path.split(/[\\/]/).pop();
      if (base === "node_modules" || base === ".git" || base === "dist") return;
      for (const entry of readdirSync(path)) visit(join(path, entry));
      return;
    }
    if (!/\.(ts|tsx|js|mjs|sql)$/.test(path)) return;
    const rel = normalized(relative(rootDir, path));
    if (rel.endsWith(".test.ts")) return;
    files.push({ path: rel, content: readFileSync(path, "utf8") });
  };
  for (const root of roots) {
    try { visit(root); } catch { /* optional roots */ }
  }
  return files;
}

export type CanonicalAvailabilityInput = {
  onHand: number;
  activeReserved?: number;
  quarantined?: number;
  unavailable?: number;
  blocked?: number;
  expired?: number;
  appVisibleAvailable?: number;
};

export function calculateAvailability(input: CanonicalAvailabilityInput) {
  const onHand = Number(input.onHand ?? 0);
  const activeReserved = Number(input.activeReserved ?? 0);
  const quarantined = Number(input.quarantined ?? 0) + Number(input.unavailable ?? 0);
  const blocked = Number(input.blocked ?? 0) + Number(input.expired ?? 0);
  const rawAvailable = onHand - activeReserved - quarantined - blocked;
  return {
    onHand,
    activeReserved,
    quarantined,
    blocked,
    expired: Number(input.expired ?? 0),
    rawAvailable,
    calculatedAvailable: Math.max(0, rawAvailable),
    appVisibleAvailable: input.appVisibleAvailable == null ? Math.max(0, rawAvailable) : Number(input.appVisibleAvailable),
    formula: "available = onHand - activeReserved - quarantined/unavailable - blocked/expired where applicable",
  };
}

export type FefoBatch = {
  batchId: number | string;
  productId?: number | string | null;
  storeId?: number | string | null;
  expiryDate: string | Date;
  onHand: number;
  activeReserved?: number;
  quarantined?: number;
  unavailable?: number;
  expired?: number;
  blocked?: boolean;
  status?: string | null;
  nearExpiryWarning?: boolean;
};

function expiryTime(expiryDate: string | Date) { return new Date(expiryDate).getTime(); }
function isExpired(batch: FefoBatch, asOf: Date) { return expiryTime(batch.expiryDate) <= asOf.getTime() || (batch.expired ?? 0) > 0 || batch.status === "expired"; }
function isQuarantined(batch: FefoBatch) { return (batch.quarantined ?? 0) > 0 || batch.status === "quarantined" || batch.status === "recalled" || batch.status === "damaged"; }

export function selectFefoBatch(batches: FefoBatch[], options: { qty?: number; asOf?: Date } = {}) {
  const qty = options.qty ?? 1;
  const asOf = options.asOf ?? new Date();
  return batches
    .map((batch) => ({ batch, availability: calculateAvailability({ onHand: batch.onHand, activeReserved: batch.activeReserved, quarantined: batch.quarantined, unavailable: batch.unavailable, expired: batch.expired, blocked: batch.blocked ? batch.onHand : 0 }) }))
    .filter(({ batch, availability }) => !isExpired(batch, asOf) && !isQuarantined(batch) && availability.calculatedAvailable >= qty)
    .sort((a, b) => expiryTime(a.batch.expiryDate) - expiryTime(b.batch.expiryDate))[0]?.batch ?? null;
}

export function assertFefoPick(input: { pickedBatchId: string | number; batches: FefoBatch[]; qty?: number; asOf?: Date; overrideReason?: string | null }) {
  const expected = selectFefoBatch(input.batches, { qty: input.qty, asOf: input.asOf });
  if (!expected) return { ok: false, deviationType: "no_valid_batch", expectedBatchId: null, requiresAudit: true };
  if (String(expected.batchId) === String(input.pickedBatchId)) return { ok: true, deviationType: null, expectedBatchId: expected.batchId, requiresAudit: false };
  return { ok: Boolean(input.overrideReason), deviationType: "manual_override", expectedBatchId: expected.batchId, requiresAudit: !input.overrideReason };
}

export function buildFefoDeviationReport(picks: Array<{ pickedBatchId: string | number; batches: FefoBatch[]; qty?: number; asOf?: Date; overrideReason?: string | null }>) {
  const rows = picks.map((pick) => ({ ...pick, result: assertFefoPick(pick) }));
  return { rows, totals: { rowCount: rows.length, deviationCount: rows.filter((row) => !row.result.ok).length, overrideAuditRequired: rows.filter((row) => row.result.requiresAudit).length }, csvData: rows };
}

export type StockTruthAnomalyType =
  | "negative_on_hand"
  | "negative_available"
  | "reserved_exceeds_on_hand"
  | "batch_ledger_mismatch"
  | "store_sku_mismatch"
  | "expired_marked_available"
  | "quarantined_marked_available"
  | "missing_batch_ref"
  | "direct_mutation_suspected";

export type StockTruthReconciliationInputRow = {
  productId: number | string;
  storeId: number | string;
  batchId?: number | string | null;
  batchLedgerId?: number | string | null;
  onHand: number;
  activeReserved?: number;
  quarantined?: number;
  unavailable?: number;
  expired?: number;
  blocked?: number;
  appVisibleAvailable?: number;
  ledgerMovementTotal?: number;
  directMutationSuspected?: boolean;
};

export function buildStockTruthReconciliationReport(inputRows: StockTruthReconciliationInputRow[]) {
  const rows = inputRows.map((row) => {
    const availability = calculateAvailability({ onHand: row.onHand, activeReserved: row.activeReserved, quarantined: row.quarantined, unavailable: row.unavailable, blocked: row.blocked, expired: row.expired, appVisibleAvailable: row.appVisibleAvailable });
    const ledgerMovementTotal = Number(row.ledgerMovementTotal ?? row.onHand ?? 0);
    const varianceQty = Number(row.onHand ?? 0) - ledgerMovementTotal;
    const anomalyType: StockTruthAnomalyType[] = [];
    if (row.onHand < 0) anomalyType.push("negative_on_hand");
    if (availability.rawAvailable < 0) anomalyType.push("negative_available");
    if (Number(row.activeReserved ?? 0) > Number(row.onHand ?? 0)) anomalyType.push("reserved_exceeds_on_hand");
    if (varianceQty !== 0) anomalyType.push("batch_ledger_mismatch");
    if (availability.appVisibleAvailable !== availability.calculatedAvailable) anomalyType.push("store_sku_mismatch");
    if (Number(row.expired ?? 0) > 0 && availability.appVisibleAvailable > 0) anomalyType.push("expired_marked_available");
    if ((Number(row.quarantined ?? 0) + Number(row.unavailable ?? 0)) > 0 && availability.appVisibleAvailable > 0) anomalyType.push("quarantined_marked_available");
    if (row.batchId == null && row.batchLedgerId == null) anomalyType.push("missing_batch_ref");
    if (row.directMutationSuspected) anomalyType.push("direct_mutation_suspected");
    return {
      productId: row.productId,
      storeId: row.storeId,
      batchId: row.batchId ?? null,
      batchLedgerId: row.batchLedgerId ?? row.batchId ?? null,
      onHand: Number(row.onHand ?? 0),
      activeReserved: Number(row.activeReserved ?? 0),
      quarantined: Number(row.quarantined ?? 0) + Number(row.unavailable ?? 0),
      expired: Number(row.expired ?? 0),
      calculatedAvailable: availability.calculatedAvailable,
      appVisibleAvailable: availability.appVisibleAvailable,
      ledgerMovementTotal,
      varianceQty,
      anomalyType,
    };
  });
  return {
    rows,
    totals: {
      rowCount: rows.length,
      onHand: rows.reduce((s, r) => s + r.onHand, 0),
      activeReserved: rows.reduce((s, r) => s + r.activeReserved, 0),
      quarantined: rows.reduce((s, r) => s + r.quarantined, 0),
      expired: rows.reduce((s, r) => s + r.expired, 0),
      calculatedAvailable: rows.reduce((s, r) => s + r.calculatedAvailable, 0),
      varianceQty: rows.reduce((s, r) => s + r.varianceQty, 0),
      anomalyCount: rows.filter((row) => row.anomalyType.length > 0).length,
    },
    csvData: rows,
  };
}
