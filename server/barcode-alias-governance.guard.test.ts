import { describe, it, expect } from "vitest";
import { normalizeBarcodeInput } from "./services/barcodeService";

describe("barcode alias governance guards", () => {
  it("barcode normalization is deterministic", () => {
    expect(normalizeBarcodeInput(" ab c ")).toBe("ABC");
  });
});
