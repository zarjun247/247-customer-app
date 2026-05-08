import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APPROVED_STOCK_MUTATION_GATEWAYS,
  buildStockTruthReconciliationReport,
  calculateAvailability,
  scanStockMutationContent,
  selectFefoBatch,
} from "./services/stockTruthCertification";

const barcodeService = readFileSync("server/services/barcodeService.ts", "utf8");
const ocrRouter = readFileSync("server/routers/ocrIngestionRouter.ts", "utf8");
const ocrService = readFileSync("server/services/ocrPurchaseInwarding.ts", "utf8");
const purchaseRouter = readFileSync("server/routers/purchaseRouter.ts", "utf8");
const salesRouter = readFileSync("server/routers/salesRouter.ts", "utf8");
const stockInvariant = readFileSync("server/services/stockInvariant.ts", "utf8");

describe("stock truth final audit certification", () => {
  it("scanner detects rogue direct stock mutation", () => {
    const violations = scanStockMutationContent([
      { path: "server/routers/rogueRouter.ts", content: "await db.update(batchLedger).set({ qtyOnHand: qtyOnHand - 1 })" },
      { path: "server/routers/rogueReservations.ts", content: "await db.delete(stockReservations).where(eq(stockReservations.id, id))" },
    ]);
    expect(violations.map((v) => v.path)).toEqual(["server/routers/rogueRouter.ts", "server/routers/rogueRouter.ts", "server/routers/rogueReservations.ts"]);
  });

  it("scanner allowlists approved stockInvariant mutation", () => {
    const violations = scanStockMutationContent([{ path: "server/services/stockInvariant.ts", content: stockInvariant }]);
    expect(violations).toEqual([]);
    expect(APPROVED_STOCK_MUTATION_GATEWAYS).toContain("sale confirmation -> decreaseStockForSaleConfirmation/applyStockMovement");
  });

  it("barcode scan remains lookup-only", () => {
    expect(barcodeService).toContain("getCanonicalAvailability");
    const out = execSync("rg -n \"(scanBarcodeForSale|scanBarcodeForReturn|resolveBarcodeForStockAudit)[\\s\\S]{0,1200}(insert\\(stockMovements\\)|update\\(batchLedger\\)|update\\(storeSkus\\)|qtyOnHand\\s*:)\" server/services/barcodeService.ts server/routers || true", { encoding: "utf8" }).trim();
    expect(out).toBe("");
  });

  it("OCR draft commit does not directly mutate stock", () => {
    expect(ocrService).toContain("assertOcrDraftApprovedForHandoff");
    expect(`${ocrRouter}\n${ocrService}`).not.toMatch(/insert\(stockMovements\)|update\(batchLedger\)|increaseStockForPurchaseCommit|applyStockMovement|syncStoreSkuAggregate/);
  });

  it("purchase commit routes through approved stock gateway", () => {
    expect(purchaseRouter).toContain("increaseStockForPurchaseCommit");
    expect(purchaseRouter).toContain("syncStoreSkuAggregate");
    expect(purchaseRouter).not.toMatch(/insert\(stockMovements\)/);
  });

  it("sale confirmation routes through approved stock gateway", () => {
    expect(salesRouter).toContain("decreaseStockForSaleConfirmation");
    expect(salesRouter).toContain("getCanonicalAvailability");
    expect(salesRouter).not.toMatch(/insert\(stockMovements\)/);
  });

  it("canonical availability subtracts active reservations", () => {
    expect(calculateAvailability({ onHand: 10, activeReserved: 4 }).calculatedAvailable).toBe(6);
  });

  it("canonical availability subtracts quarantined/unavailable stock", () => {
    const availability = calculateAvailability({ onHand: 10, activeReserved: 1, quarantined: 2, unavailable: 3, expired: 1 });
    expect(availability.calculatedAvailable).toBe(3);
    expect(availability.formula).toBe("available = onHand - activeReserved - quarantined/unavailable - blocked/expired where applicable");
  });

  it("expired/quarantined batch is not FEFO-selected", () => {
    const selected = selectFefoBatch([
      { batchId: "expired", expiryDate: "2020-01-01", onHand: 10 },
      { batchId: "quarantined", expiryDate: "2027-01-01", onHand: 10, quarantined: 10 },
      { batchId: "valid", expiryDate: "2028-01-01", onHand: 10 },
    ], { asOf: new Date("2026-05-08") });
    expect(selected?.batchId).toBe("valid");
  });

  it("FEFO picks earliest valid expiry batch", () => {
    const selected = selectFefoBatch([
      { batchId: "late", expiryDate: "2028-01-01", onHand: 10 },
      { batchId: "early", expiryDate: "2027-01-01", onHand: 10 },
    ], { asOf: new Date("2026-05-08") });
    expect(selected?.batchId).toBe("early");
  });

  it("reconciliation report detects negative stock", () => {
    const report = buildStockTruthReconciliationReport([{ productId: 1, storeId: 1, batchId: 1, onHand: -1, ledgerMovementTotal: -1 }]);
    expect(report.rows[0].anomalyType).toContain("negative_on_hand");
  });

  it("reconciliation report detects reserved > onHand", () => {
    const report = buildStockTruthReconciliationReport([{ productId: 1, storeId: 1, batchId: 1, onHand: 2, activeReserved: 3, ledgerMovementTotal: 2 }]);
    expect(report.rows[0].anomalyType).toContain("reserved_exceeds_on_hand");
    expect(report.rows[0].anomalyType).toContain("negative_available");
  });

  it("reconciliation report returns rows/totals/csvData", () => {
    const report = buildStockTruthReconciliationReport([{ productId: 1, storeId: 1, batchLedgerId: 1, onHand: 10, activeReserved: 2, quarantined: 1, expired: 1, appVisibleAvailable: 6, ledgerMovementTotal: 10 }]);
    expect(report.rows).toHaveLength(1);
    expect(report.totals).toMatchObject({ rowCount: 1, onHand: 10, activeReserved: 2, calculatedAvailable: 6 });
    expect(report.csvData).toEqual(report.rows);
  });

  it("no Number(uuid) / entityId:0 introduced in stock audit refs", () => {
    const out = execSync("rg -n \"Number\\([^)]*uuid|entityId:\\s*0\" server/services/stockTruthCertification.ts || true", { encoding: "utf8" }).trim();
    expect(out).toBe("");
  });
});
