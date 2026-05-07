import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { detectPotentialDuplicateProducts } from "./services/productNormalization";
import { validateBarcodeRuntimeLabel, validateProductForRegulatedSale, validatePurchaseRuntimeLine } from "./services/productMasterValidation";

const completeRxProduct = {
  id: 1,
  name: "Schedule H Tablet",
  genericName: "Drug",
  strength: "10 mg",
  form: "tablet",
  packSize: "10 tab",
  companyName: "Acme Pharma",
  hsnCode: "30049099",
  gstRate: "12.00",
  schedule: "H",
  requiresPrescription: true,
  barcode: "8901234567890",
};

describe("product master runtime gates", () => {
  it("blocks regulated sale when schedule is missing and never defaults to OTC", () => {
    const result = validateProductForRegulatedSale({ ...completeRxProduct, schedule: null, requiresPrescription: true });
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("regulated_unknown_schedule_fail_closed");
    expect(result.errors).toContain("regulated_missing_schedule");
  });

  it("requires prescription flag for known regulated schedules", () => {
    const result = validateProductForRegulatedSale({ ...completeRxProduct, schedule: "H", requiresPrescription: false });
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("regulated_requires_prescription_flag_missing");
  });

  it("blocks missing HSN/GST for statutory sale paths", () => {
    const result = validateProductForRegulatedSale({ ...completeRxProduct, hsnCode: null, gstRate: null });
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("missing_hsn");
    expect(result.errors).toContain("missing_gst_rate");
  });

  it("rejects purchase line when batch expiry MRP or cost are missing", () => {
    const result = validatePurchaseRuntimeLine({ product: completeRxProduct, batchNo: "", expiryDate: null, mrp: "0", purchaseRate: "" });
    expect(result.status).toBe("incomplete_master");
    expect(result.errors).toEqual(expect.arrayContaining(["missing_batch_no", "missing_expiry", "invalid_mrp", "invalid_cost"]));
  });

  it("returns incomplete_master for unsafe barcode label creation", () => {
    const result = validateBarcodeRuntimeLabel({ product: { ...completeRxProduct, hsnCode: null }, batchNo: null, expiryDate: null, mrp: "0", internalBarcode: "PHX-1" });
    expect(result.status).toBe("incomplete_master");
    expect(result.errors).toEqual(expect.arrayContaining(["missing_batch_no", "missing_expiry", "invalid_mrp", "product_missing_hsn"]));
  });

  it("reports duplicate candidates without auto-merge fields", () => {
    const [candidate] = detectPotentialDuplicateProducts([
      { id: 1, genericName: "Para", strength: "500 mg", dosageForm: "tablet", packSize: "10 tab", manufacturer: "A" },
      { id: 2, genericName: "Para", strength: "500 mg", dosageForm: "tablet", packSize: "10 tab", manufacturer: "A" },
    ]);
    expect(candidate).toMatchObject({ candidateProductIds: [1, 2], reason: "canonical_product_match", reviewStatus: "review_required" });
    expect(JSON.stringify(candidate).toLowerCase()).not.toContain("merge");
  });

  it("wires OCR approval and commit through purchase runtime validation", () => {
    const src = fs.readFileSync("server/routers/ocrIngestionRouter.ts", "utf8");
    expect(src).toContain("validatePurchaseRuntimeLine");
    expect(src).toContain("OCR draft approval blocked by incomplete product master");
    expect(src).toContain("OCR draft commit blocked by incomplete product master");
  });
});
