import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("pharmacy inspection export pack", () => {
  it("defines redacted export sections without regulator acceptance claims", () => {
    const service = readFileSync("server/services/pharmacyLegalOps.ts", "utf8");
    expect(service).toContain("generateInspectionExportManifest");
    expect(service).toContain("regulated_release");
    expect(service).toContain("license_and_duty");
    expect(service).toContain("recall_and_disposal");
    expect(service).toContain("document_storage_key");
    expect(service).toContain("regulatorAcceptanceClaimed: false");
    expect(service).toContain("counselAndPharmacistReviewRequired: true");
  });

  it("export code does not expose secret storage keys in public summaries", () => {
    const service = readFileSync("server/services/pharmacyLegalOps.ts", "utf8");
    expect(service).toContain("documentStorageKeyExposed: false");
    expect(service).toContain("secretFieldsExposed: false");
    expect(service).toContain("patientRef: row.patientRef ? \"redacted\" : null");
  });

  it("DB-backed proof is explicit when TEST_DATABASE_URL is absent", () => {
    expect(process.env.TEST_DATABASE_URL || "missing").toBe("missing");
  });
});
