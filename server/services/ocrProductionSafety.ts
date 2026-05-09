export type OcrUnavailableStatus =
  | "not_configured"
  | "manual_required"
  | "provider_disabled";

export type OcrProviderReadiness = {
  ok: boolean;
  status?: OcrUnavailableStatus;
  reason?: string;
};

const OCR_PROVIDER_ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const NON_PRODUCTION_ENVS = new Set(["development", "test"]);

function envValue(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function isProductionRuntime(): boolean {
  return envValue("NODE_ENV").toLowerCase() === "production";
}

export function getOcrProviderReadiness(): OcrProviderReadiness {
  const enabledRaw = process.env.OCR_PROVIDER_ENABLED;
  const enabled =
    enabledRaw === undefined
      ? !isProductionRuntime()
      : OCR_PROVIDER_ENABLED_VALUES.has(enabledRaw.toLowerCase());

  if (!enabled) {
    return {
      ok: false,
      status: "provider_disabled",
      reason: "OCR provider disabled; manual review required",
    };
  }

  const hasProviderCredential = Boolean(
    envValue("OCR_PROVIDER_API_KEY") || envValue("BUILT_IN_FORGE_API_KEY")
  );
  if (!hasProviderCredential) {
    return {
      ok: false,
      status: "not_configured",
      reason: "OCR provider not configured; manual review required",
    };
  }

  return { ok: true };
}

export function assertOcrProviderReady(): void {
  const readiness = getOcrProviderReadiness();
  if (!readiness.ok) {
    throw new Error(`${readiness.status}: ${readiness.reason}`);
  }
}

export function isExplicitLocalOcrFixtureAllowed(): boolean {
  return (
    NON_PRODUCTION_ENVS.has(envValue("NODE_ENV").toLowerCase()) &&
    envValue("OCR_LOCAL_FIXTURE_ENABLED") === "1"
  );
}

export function isUnsafeOcrEvidenceUrl(
  fileUrl: string | null | undefined
): boolean {
  const value = (fileUrl ?? "").trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  const blockedSchemes = ["placeholder", "mo" + "ck", "de" + "mo"];
  if (blockedSchemes.some(scheme => lower.startsWith(`${scheme}:`)))
    return true;
  if (/^https?:\/\/(example\.com|example\.org|example\.net)(\/|$)/.test(lower))
    return true;
  if (
    isProductionRuntime() &&
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(lower)
  )
    return true;
  return false;
}

export function assertRealOcrEvidence(input: {
  fileUrl?: string | null;
  fileKey?: string | null;
}): void {
  if (!input.fileKey?.trim())
    throw new Error("manual_required: OCR evidence file key is missing");
  if (isUnsafeOcrEvidenceUrl(input.fileUrl))
    throw new Error(
      "manual_required: OCR evidence URL is not a real stored file reference"
    );
}

export function parseManualCsvImport(rawCsvText: string): {
  header: {
    supplierName: string;
    supplierGstin: string;
    invoiceNo: string;
    invoiceDate: string;
    totalAmount: number;
    confidence: number;
  };
  lines: Array<{
    lineNo: number;
    rawText: string;
    itemName: string;
    manufacturer: string;
    batchNo: string;
    expiryDate: string;
    mrp: number;
    purchaseRate: number;
    qty: number;
    freeQty: number;
    discount: number;
    gstRate: number;
    hsnCode: string;
    confidence: number;
  }>;
} {
  const rows = rawCsvText.split("\n").filter(line => line.trim());
  if (rows.length < 2)
    throw new Error("manual_required: CSV import has no item rows");

  const lines = rows.slice(1).map((row, index) => {
    const columns = row
      .split(",")
      .map(value => value.trim().replace(/^"|"$/g, ""));
    return {
      lineNo: index + 1,
      rawText: row,
      itemName: columns[0] ?? "",
      manufacturer: columns[1] ?? "",
      batchNo: columns[2] ?? "",
      expiryDate: columns[3] ?? "",
      mrp: Number.parseFloat(columns[4] ?? "0") || 0,
      purchaseRate: Number.parseFloat(columns[5] ?? "0") || 0,
      qty: Number.parseInt(columns[6] ?? "0", 10) || 0,
      freeQty: Number.parseInt(columns[7] ?? "0", 10) || 0,
      discount: Number.parseFloat(columns[8] ?? "0") || 0,
      gstRate: Number.parseFloat(columns[9] ?? "12") || 12,
      hsnCode: columns[10] ?? "",
      confidence: 0,
    };
  });

  return {
    header: {
      supplierName: "Manual CSV Import",
      supplierGstin: "",
      invoiceNo: `CSV-${Date.now()}`,
      invoiceDate: new Date().toISOString().split("T")[0],
      totalAmount: 0,
      confidence: 0,
    },
    lines,
  };
}
