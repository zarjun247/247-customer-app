import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { getBarcodeLabelPayload } from "./services/barcodeService";
import { detectPotentialDuplicateProducts } from "./services/productNormalization";
import {
  validateProductForRegulatedSale,
  validatePurchaseLineMaster,
} from "./services/productMasterValidation";

const completeRegulated = {
  id: 1,
  name: "Rx Product 500 Tablet",
  genericName: "Rx Product",
  strength: "500mg",
  dosageForm: "tablet",
  packSize: "10 tablets",
  manufacturer: "Acme Pharma",
  hsnCode: "30049099",
  gstRate: "12.00",
  schedule: "H1",
  requiresPrescription: true,
  barcode: "8901234567890",
};

describe("product master runtime gates", () => {
  it("blocks regulated product with missing schedule and never defaults unknown schedule to OTC", () => {
    const result = validateProductForRegulatedSale({ ...completeRegulated, schedule: null });

    expect(result.errors).toContain("missing_schedule");
    expect(result.errors).toContain("regulated_unknown_schedule_fail_closed");
    expect(result.errors).not.toContain("otc_defaulted");
  });

  it("requires Rx flag when a regulated schedule is present", () => {
    const result = validateProductForRegulatedSale({ ...completeRegulated, requiresPrescription: false });

    expect(result.errors).toContain("regulated_schedule_requires_rx_flag");
  });

  it("blocks statutory sale path when HSN or GST are missing", () => {
    const result = validateProductForRegulatedSale({ ...completeRegulated, hsnCode: "", gstRate: null });

    expect(result.errors).toContain("missing_hsn");
    expect(result.errors).toContain("missing_gst_rate");
    expect(result.errors).toContain("statutory_missing_hsn");
    expect(result.errors).toContain("statutory_missing_gst");
  });

  it("rejects purchase lines with missing batch, expiry, MRP, and cost", () => {
    const result = validatePurchaseLineMaster({
      product: completeRegulated,
      productId: completeRegulated.id,
      batchNo: "",
      expiryDate: null,
      mrp: "0",
      purchaseRate: "",
      hsnCode: completeRegulated.hsnCode,
      gstRate: completeRegulated.gstRate,
    });

    expect(result.errors).toEqual(expect.arrayContaining(["missing_batch", "missing_expiry", "missing_mrp", "missing_cost"]));
    expect(validatePurchaseLineMaster({ product: null, productId: 404, batchNo: "B1", expiryDate: "2027-01-31", mrp: "10", purchaseRate: "7" }).errors).toContain("missing_product");
  });

  it("returns incomplete_master for barcode labels with incomplete core master or batch fields", () => {
    const payload = getBarcodeLabelPayload({ productName: "", batchNo: "", expiryDate: null, mrp: "0", internalBarcode: "" });

    expect(payload.status).toBe("incomplete_master");
    expect(payload.masterValidation.errors).toEqual(expect.arrayContaining(["missing_product_identity", "missing_batch", "missing_expiry", "missing_mrp", "missing_barcode_mapping"]));
  });

  it("emits duplicate candidates as review-only metadata and never auto-merges", () => {
    const candidates = detectPotentialDuplicateProducts([
      completeRegulated,
      { ...completeRegulated, id: 2, barcode: "8901234567899" },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      canonicalKey: expect.any(String),
      candidateProductIds: [1, 2],
      reviewStatus: "review_required",
    });
    expect(candidates[0]).not.toHaveProperty("autoMerged");
  });

  it("wires OCR approval and commit paths to product validation", () => {
    const source = readFileSync("server/routers/ocrIngestionRouter.ts", "utf8");

    expect(source).toContain("validatePurchaseLineMaster");
    expect(source).toContain("OCR line has incomplete product master or purchase metadata");
    expect(source).toContain("OCR approved draft has incomplete product master or purchase metadata");
    expect(source).toContain("assertOcrDraftApprovedForHandoff");
  });

  it("keeps POS addLine and confirmSale gates on persisted metadata", () => {
    const source = readFileSync("server/routers/salesRouter.ts", "utf8");

    expect(source).toContain("Persisted product metadata is required before adding to bill");
    expect(source).toContain("Product master is incomplete for product");
    expect(source).toContain("createOrVerifyH1RegisterEntry");
    expect(source).not.toContain("scheduleCode ?? 'OTC'");
  });
});
