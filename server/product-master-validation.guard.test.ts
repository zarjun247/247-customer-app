import { describe, it, expect } from "vitest";
import { validateProductForRegulatedSale } from "./services/productMasterValidation";

describe("product master validation guards", () => {
  it("detects missing statutory fields", () => {
    const r = validateProductForRegulatedSale({ name: "X" });
    expect(r.errors).toContain("missing_hsn");
    expect(r.errors).toContain("missing_gst_rate");
  });
});
