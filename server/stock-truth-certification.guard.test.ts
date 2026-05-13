import fs from "node:fs";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  APPROVED_STOCK_MUTATION_GATEWAYS,
  buildStockTruthReconciliationReport,
  calculateAvailability,
  scanStockMutationContent,
  selectFefoBatch,
} from "./services/stockTruthCertification";

const barcodeService = readFileSync(
  "server/services/barcodeService.ts",
  "utf8"
);
const ocrRouter = readFileSync("server/routers/ocrIngestionRouter.ts", "utf8");
const ocrService = readFileSync(
  "server/services/ocrPurchaseInwarding.ts",
  "utf8"
);
const purchaseRouter =
  readFileSync("server/routers/purchaseRouter.ts", "utf8") +
  readFileSync("server/routers/purchaseReturnsRouter.ts", "utf8");
const salesRouter = readFileSync("server/routers/salesRouter.ts", "utf8");
const stockInvariant = readFileSync(
  "server/services/stockInvariant.ts",
  "utf8"
);
const reservationService = readFileSync(
  "server/services/reservationService.ts",
  "utf8"
);

describe("stock truth final audit certification", () => {
  it("scanner detects rogue direct stock mutation", () => {
    const violations = scanStockMutationContent([
      {
        path: "server/routers/rogueRouter.ts",
        content:
          "await db.update(batchLedger).set({ qtyOnHand: qtyOnHand - 1 })",
      },
      {
        path: "server/routers/rogueReservations.ts",
        content:
          "await db.delete(stockReservations).where(eq(stockReservations.id, id))",
      },
    ]);
    expect(violations.map(v => v.path)).toEqual([
      "server/routers/rogueRouter.ts",
      "server/routers/rogueRouter.ts",
      "server/routers/rogueReservations.ts",
    ]);
  });

  it("scanner allowlists approved stockInvariant mutation", () => {
    const violations = scanStockMutationContent([
      { path: "server/services/stockInvariant.ts", content: stockInvariant },
    ]);
    expect(violations).toEqual([]);
    expect(APPROVED_STOCK_MUTATION_GATEWAYS).toContain(
      "sale confirmation -> decreaseStockForSaleConfirmation/applyStockMovement"
    );
  });

  it("barcode scan remains lookup-only", () => {
    expect(barcodeService).toContain("getCanonicalAvailability");
    // cross-platform search: look in barcode service and router files for disallowed mutation patterns
    const barcodeFiles = [
      "server/services/barcodeService.ts",
      ...fs
        .readdirSync("server/routers")
        .filter(f => f.endsWith(".ts"))
        .map(f => `server/routers/${f}`),
    ];
    const pattern =
      /(scanBarcodeForSale|scanBarcodeForReturn|resolveBarcodeForStockAudit)[\s\S]{0,1200}(insert\(stockMovements\)|update\(batchLedger\)|update\(storeSkus\)|qtyOnHand\s*:)/;
    let outFound = false;
    for (const p of barcodeFiles) {
      if (!fs.existsSync(p)) throw new Error(`Watched file missing: ${p}`);
      const c = fs.readFileSync(p, "utf8");
      if (pattern.test(c)) {
        outFound = true;
        break;
      }
    }
    const out = outFound ? "matches" : "";
    expect(out).toBe("");
  });

  it("OCR draft commit does not directly mutate stock", () => {
    expect(ocrService).toContain("assertOcrDraftApprovedForHandoff");
    expect(`${ocrRouter}\n${ocrService}`).not.toMatch(
      /insert\(stockMovements\)|update\(batchLedger\)|increaseStockForPurchaseCommit|applyStockMovement|syncStoreSkuAggregate/
    );
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

  it("canonical physical reservation accounting is centralized and guarded", () => {
    expect(reservationService).toContain("reserveBatchAtomic");
    expect(reservationService).toContain("releaseReservationAtomic");
    expect(reservationService).toContain("consumeReservationAtomic");
    expect(reservationService).toContain(
      "Reservation release would make reserved stock negative"
    );
    expect(reservationService).toContain(
      "Reservation consume would make on-hand stock negative"
    );
    // cross-platform: scan server and scripts directories (excluding reservationService and stockInvariant) for qtyReserved updates
    const searchPattern =
      /(?:db|tx)\.update\(batchLedger\)\.set\(\{[^}]*qtyReserved/;
    const dirs = ["server", "scripts"];
    let found = false;
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue;
      const files = fs.readdirSync(d).map(f => `${d}/${f}`);
      for (const f of files) {
        if (f.endsWith(".ts")) {
          if (
            f.endsWith("server/services/reservationService.ts") ||
            f.endsWith("server/services/stockInvariant.ts")
          )
            continue;
          if (!fs.existsSync(f)) throw new Error(`Watched file missing: ${f}`);
          const c = fs.readFileSync(f, "utf8");
          if (searchPattern.test(c)) {
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
    const out = found ? "matches" : "";
    expect(out).toBe("");
  });

  it("canonical availability subtracts active reservations", () => {
    expect(
      calculateAvailability({ onHand: 10, activeReserved: 4 })
        .calculatedAvailable
    ).toBe(6);
  });

  it("canonical availability subtracts quarantined/unavailable stock", () => {
    const availability = calculateAvailability({
      onHand: 10,
      activeReserved: 1,
      quarantined: 2,
      unavailable: 3,
      expired: 1,
    });
    expect(availability.calculatedAvailable).toBe(3);
    expect(availability.formula).toBe(
      "available = onHand - activeReserved - quarantined/unavailable - blocked/expired where applicable"
    );
  });

  it("expired/quarantined batch is not FEFO-selected", () => {
    const selected = selectFefoBatch(
      [
        { batchId: "expired", expiryDate: "2020-01-01", onHand: 10 },
        {
          batchId: "quarantined",
          expiryDate: "2027-01-01",
          onHand: 10,
          quarantined: 10,
        },
        { batchId: "valid", expiryDate: "2028-01-01", onHand: 10 },
      ],
      { asOf: new Date("2026-05-08") }
    );
    expect(selected?.batchId).toBe("valid");
  });

  it("FEFO picks earliest valid expiry batch", () => {
    const selected = selectFefoBatch(
      [
        { batchId: "late", expiryDate: "2028-01-01", onHand: 10 },
        { batchId: "early", expiryDate: "2027-01-01", onHand: 10 },
      ],
      { asOf: new Date("2026-05-08") }
    );
    expect(selected?.batchId).toBe("early");
  });

  it("reconciliation report detects negative stock", () => {
    const report = buildStockTruthReconciliationReport([
      {
        productId: 1,
        storeId: 1,
        batchId: 1,
        onHand: -1,
        ledgerMovementTotal: -1,
      },
    ]);
    expect(report.rows[0].anomalyType).toContain("negative_on_hand");
  });

  it("reconciliation report detects reserved > onHand", () => {
    const report = buildStockTruthReconciliationReport([
      {
        productId: 1,
        storeId: 1,
        batchId: 1,
        onHand: 2,
        activeReserved: 3,
        ledgerMovementTotal: 2,
      },
    ]);
    expect(report.rows[0].anomalyType).toContain("reserved_exceeds_on_hand");
    expect(report.rows[0].anomalyType).toContain("negative_available");
  });

  it("reconciliation report returns rows/totals/csvData", () => {
    const report = buildStockTruthReconciliationReport([
      {
        productId: 1,
        storeId: 1,
        batchLedgerId: 1,
        onHand: 10,
        activeReserved: 2,
        quarantined: 1,
        expired: 1,
        appVisibleAvailable: 6,
        ledgerMovementTotal: 10,
      },
    ]);
    expect(report.rows).toHaveLength(1);
    expect(report.totals).toMatchObject({
      rowCount: 1,
      onHand: 10,
      activeReserved: 2,
      calculatedAvailable: 6,
    });
    expect(report.csvData).toEqual(report.rows);
  });

  it("no Number(uuid) / entityId:0 introduced in stock audit refs", () => {
    const stPath = "server/services/stockTruthCertification.ts";
    let out = "";
    if (!fs.existsSync(stPath))
      throw new Error(`Watched file missing: ${stPath}`);
    const c = fs.readFileSync(stPath, "utf8");
    if (/Number\([^)]*uuid/.test(c) || /entityId:\s*0/.test(c)) out = "matches";
    expect(out).toBe("");
  });
});
