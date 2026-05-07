import { describe, expect, it } from "vitest";
import { canClaimSdkPrinted, getPrinterStatusText, type BarcodeLabelItem } from "./BarcodeLabelPreview";
import { deriveScanState, getCanonicalAvailabilityText, normalizeScannerValue, type BarcodeResolvedResult } from "./BarcodeScannerInput";
import fs from "fs";

describe("barcode scanner component helpers", () => {
  it("normalizes manual and keyboard-wedge scanner input before submit", () => {
    expect(normalizeScannerValue(" ab 12\n")).toBe("AB12");
  });

  it("handles not_found and error-safe states", () => {
    expect(deriveScanState({ rows: [] })).toBe("not_found");
    expect(deriveScanState({ status: "error", message: "lookup failed" })).toBe("error");
  });

  it("shows canonical availability only when endpoint returns it", () => {
    const resolved: BarcodeResolvedResult = { canonicalAvailability: { availableQty: 7 } };
    expect(getCanonicalAvailabilityText(resolved)).toBe("Canonical available: 7");
    expect(getCanonicalAvailabilityText({ rows: [] })).toBe("Canonical availability unavailable");
  });
});

describe("barcode label preview helpers", () => {
  it("supports batch/product/barcode label preview data", () => {
    const label: BarcodeLabelItem = { id: "1", productName: "Paracetamol", batchNo: "B1", expiryDate: "2027-01", mrp: "12.50", barcode: "PHX-1" };
    expect(`${label.productName} ${label.batchNo} ${label.barcode}`).toContain("Paracetamol B1 PHX-1");
  });

  it("printer unconfigured state does not claim printed success", () => {
    expect(getPrinterStatusText("not_configured")).toBe("Printer not configured");
    expect(canClaimSdkPrinted("not_configured")).toBe(false);
  });
});

describe("barcode UX static stock-mutation guard", () => {
  it("barcode UX files do not introduce direct stock mutations", () => {
    const files = [
      "client/src/components/barcode/BarcodeScannerInput.tsx",
      "client/src/components/barcode/BarcodeLabelPreview.tsx",
      "client/src/pages/sales/AdminCounterBilling.tsx",
      "client/src/pages/BarcodePrint.tsx",
    ];
    const forbidden = /decreaseStock|increaseStock|reverseStock|qtyOnHand\s*=|stockMovement|confirmSale\.mutateAsync\([^)]*barcode/i;
    for (const file of files) {
      expect(fs.readFileSync(file, "utf8"), file).not.toMatch(forbidden);
    }
  });

  it("UI scan action calls lookup route only", () => {
    const code = fs.readFileSync("client/src/pages/sales/AdminCounterBilling.tsx", "utf8");
    expect(code).toContain("scanBarcodeForSale.fetch");
    expect(code).not.toContain("scanBarcodeForSale.useMutation");
  });
});
