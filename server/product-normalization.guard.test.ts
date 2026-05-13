import { describe, it, expect } from "vitest";
import {
  buildCanonicalProductKey,
  detectPotentialDuplicateProducts,
} from "./services/productNormalization";

describe("product normalization guards", () => {
  it("builds canonical key", () => {
    expect(
      buildCanonicalProductKey({
        genericName: "Paracetamol",
        strength: "500 mg",
        dosageForm: "tab",
        packSize: "10 tab",
        manufacturer: "Acme Pvt Ltd",
      })
    ).toContain("PARACETAMOL");
  });
  it("detects duplicates", () => {
    const rows = [
      {
        id: 1,
        genericName: "Para",
        strength: "500 mg",
        dosageForm: "tablet",
        packSize: "10 tab",
        manufacturer: "A",
      },
      {
        id: 2,
        genericName: "Para",
        strength: "500 mg",
        dosageForm: "tablet",
        packSize: "10 tab",
        manufacturer: "A",
      },
    ];
    expect(detectPotentialDuplicateProducts(rows).length).toBeGreaterThan(0);
  });
});
