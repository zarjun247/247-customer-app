import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const purchaseRouter =
  readFileSync("server/routers/purchaseRouter.ts", "utf8") +
  readFileSync("server/routers/purchaseReturnsRouter.ts", "utf8") +
  readFileSync("server/services/commercialTruthSeams.ts", "utf8");
const salesRouter =
  readFileSync("server/routers/salesRouter.ts", "utf8") +
  readFileSync("server/routers/salesReportsRouter.ts", "utf8") +
  readFileSync("server/routers/salesOpsExtension.ts", "utf8") +
  readFileSync("server/services/commercialTruthSeams.ts", "utf8");
const reportsRouter = readFileSync("server/routers/reportsRouter.ts", "utf8");
const complianceGate = readFileSync(
  "server/services/complianceGate.ts",
  "utf8"
);
const reservationService = readFileSync(
  "server/services/reservationService.ts",
  "utf8"
);

describe("commercial flow integration posture (service/router level)", () => {
  it("purchase commit path ties invoice -> stock -> payable and blocks duplicate commit", () => {
    expect(purchaseRouter).toContain("commitInvoice");
    expect(purchaseRouter).toContain('status !== "draft"');
    expect(purchaseRouter).toContain("increaseStockForPurchaseCommit");
    expect(purchaseRouter).toContain("recordSupplierPayable");
  });

  it("sale confirm path ties stock + payment/report hooks and duplicate protection", () => {
    expect(salesRouter).toContain("confirmSale");
    expect(salesRouter).toContain("decreaseStockForSaleConfirmation");
    expect(salesRouter).toContain('status !== "pending"');
    expect(salesRouter).toContain("withIdempotency");
  });

  it("barcode lookup is mutation-free until confirmation", () => {
    const scanExt = readFileSync("server/routers/salesOpsExtension.ts", "utf8");
    expect(scanExt).toContain("resolveBarcodeForSale");
    expect(scanExt).not.toContain("stockMovements");
  });

  it("report contracts retain normalized shape", () => {
    expect(reportsRouter).toContain("dailySale");
    expect(reportsRouter).toContain("gstSummary");
    expect(reportsRouter).toContain("rows");
    expect(reportsRouter).toContain("totals");
    expect(reportsRouter).toContain("csvData");
  });

  it("regulated gate exists and reservation canonical availability exists", () => {
    expect(complianceGate).toContain("assertCanConfirmSale");
    expect(complianceGate).toContain("createOrVerifyH1RegisterEntry");
    expect(reservationService).toContain("getCanonicalAvailability");
  });
});
