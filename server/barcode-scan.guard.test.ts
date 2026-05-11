import { describe, it, expect } from "vitest";
import fs from "fs";
import {
  generateInternalBarcode,
  getBarcodeLabelPayload,
  normalizeBarcodeInput,
} from "./services/barcodeService";

describe("barcode scan guards", () => {
  it("normalizes scanner wedge input", () =>
    expect(normalizeBarcodeInput(" ab 12\n")).toBe("AB12"));
  it("deterministic internal barcode", () =>
    expect(
      generateInternalBarcode({ productId: 1, batchId: 2, storeId: 3 })
    ).toBe(generateInternalBarcode({ productId: 1, batchId: 2, storeId: 3 })));
  it("label payload excludes customer fields", () => {
    const payload = getBarcodeLabelPayload({
      productName: "X",
      internalBarcode: "PHX-1",
    }) as any;
    expect(payload.customerName).toBeUndefined();
    expect(payload.patientName).toBeUndefined();
  });
  it("scan routes do not call stockInvariant mutation directly", () => {
    const sales = fs.readFileSync("server/routers/salesRouter.ts", "utf8");
    expect(sales).toContain("scanBarcodeForSale");
    expect(
      sales.includes("decreaseStockForSaleConfirmation") &&
        sales.includes("confirmSale")
    ).toBe(true);
  });
  it("scan routes mention compliance/margin checks remain at confirm", () => {
    const sales = fs.readFileSync("server/routers/salesRouter.ts", "utf8");
    expect(sales).toContain('complianceGate: "checked_at_confirm"');
    expect(sales).toContain('marginGuard: "checked_at_confirm"');
  });

  it("scan route bodies are lookup-only and do not mutate stock", () => {
    const sales = fs.readFileSync("server/routers/salesRouter.ts", "utf8");
    const inventory =
      fs.readFileSync("server/routers/inventoryRouter.ts", "utf8") +
      fs.readFileSync("server/routers/inventoryRouterExtension.ts", "utf8");
    const saleScanBody = sales.slice(
      sales.indexOf("scanBarcodeForSale"),
      sales.indexOf("// ─── Product Search")
    );
    const returnScanBody = sales.slice(
      sales.indexOf("scanBarcodeForReturn"),
      sales.indexOf("// ─── Product Search")
    );
    const auditStart = inventory.indexOf("scanBarcodeForAudit");
    const auditScanBody = inventory.slice(
      auditStart,
      inventory.indexOf("list:", auditStart)
    );
    for (const body of [saleScanBody, returnScanBody, auditScanBody]) {
      expect(body).toContain("resolveBarcode");
      expect(body).not.toMatch(
        /decreaseStock|reverseStock|insert\(stockMovements|update\(batchLedger|qtyOnHand/
      );
    }
  });
  it("no vendor scanner sdk dependency introduced", () => {
    const code = fs.readFileSync("server/services/barcodeService.ts", "utf8");
    expect(/zebra|honeywell|datalogic|sdk/i.test(code)).toBe(false);
  });
});
