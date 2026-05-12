import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs";
import { scanVirtualFiles } from "../scripts/ci-governance-guards-shim";
import {
  getOcrProviderReadiness,
  isUnsafeOcrEvidenceUrl,
  parseManualCsvImport,
} from "./services/ocrProductionSafety";

const ORIGINAL_ENV = { ...process.env };

function withEnv(overrides: NodeJS.ProcessEnv) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

function readRuntimeOcrFiles() {
  return [
    "server/routers/ocrIngestionRouter.ts",
    "server/routers/ingestionRouter.ts",
    "server/ingestion.ts",
    "server/services/ocrPurchaseInwarding.ts",
    "server/services/ocrProductionSafety.ts",
  ].map(file => ({ file, src: fs.readFileSync(file, "utf8") }));
}

describe("OCR production safety guards", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("production OCR cannot report provider success when credentials are absent", () => {
    withEnv({
      NODE_ENV: "production",
      OCR_PROVIDER_ENABLED: "true",
      OCR_PROVIDER_API_KEY: "",
      BUILT_IN_FORGE_API_KEY: "",
    });

    expect(getOcrProviderReadiness()).toMatchObject({
      ok: false,
      status: "not_configured",
    });
  });

  it("production OCR disabled state is explicit manual-required non-success", () => {
    withEnv({ NODE_ENV: "production", OCR_PROVIDER_ENABLED: "false" });

    expect(getOcrProviderReadiness()).toMatchObject({
      ok: false,
      status: "provider_disabled",
    });
  });

  it("blocks non-evidence URL schemes and example-domain evidence", () => {
    const badSchemes = ["placeholder", "mo" + "ck", "de" + "mo"];
    for (const scheme of badSchemes) {
      expect(isUnsafeOcrEvidenceUrl(`${scheme}://invoice`)).toBe(true);
    }
    expect(isUnsafeOcrEvidenceUrl("https://example.com/invoice.pdf")).toBe(
      true
    );
    expect(isUnsafeOcrEvidenceUrl("/manus-storage/invoices/real.pdf")).toBe(
      false
    );
    expect(
      isUnsafeOcrEvidenceUrl("https://storage.247.local/invoices/real.pdf")
    ).toBe(false);
  });

  it("manual CSV import is labelled manual import and not OCR success", () => {
    const parsed = parseManualCsvImport(
      "name,manufacturer,batch,expiry,mrp,cost,qty,free,discount,gst,hsn\nCalpol,GSK,B1,2027-01,25,18,10,0,0,12,3004"
    );

    expect(parsed.header.supplierName).toBe("Manual CSV Import");
    expect(parsed.header.confidence).toBe(0);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].confidence).toBe(0);
  });

  it("runtime OCR paths do not contain placeholder evidence URL literals", () => {
    const forbidden = [
      /placeholder:\/\//i,
      new RegExp("mo" + "ck" + "://", "i"),
      new RegExp("de" + "mo" + "://", "i"),
      /example\.com/i,
    ];
    const violations = readRuntimeOcrFiles().flatMap(({ file, src }) =>
      forbidden
        .filter(pattern => pattern.test(src))
        .map(pattern => `${file}:${pattern}`)
    );

    expect(violations).toEqual([]);
  });

  it("OCR router no longer contains local parser success fallback or stock mutation", () => {
    const router = fs.readFileSync(
      "server/routers/ocrIngestionRouter.ts",
      "utf8"
    );

    expect(router).not.toContain("mockOcrParse");
    expect(router).not.toContain("Mock Pharma Distributor");
    expect(router).not.toContain("increaseStockForPurchaseCommit");
    expect(router).toContain("manual_import_under_review");
    expect(router).toContain("success: false");
  });

  it("parse failures are manual-required and do not synthesize empty successful line items", () => {
    const engine = fs.readFileSync("server/ingestion.ts", "utf8");

    expect(engine).toContain("manual_required: OCR provider parse failed");
    expect(engine).toContain("Manual review required");
    expect(engine).not.toContain("return []");
  });

  it("governance scanner catches OCR fake success and placeholder evidence if reintroduced", () => {
    const findings = scanVirtualFiles({
      "server/ocr-provider.ts":
        "return { status: 'provider_unconfigured', success: true, parsed: true };\n",
      "server/invoice-ingestion.ts":
        "const fileUrl = 'placeholder://invoice-proof';\n",
    });

    expect(findings.map(finding => finding.category)).toEqual(
      expect.arrayContaining(["provider-risk", "placeholder-production-risk"])
    );
  });
});
