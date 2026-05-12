/**
 * TypeScript shim re-exporting the scanning logic from ci-governance-guards.mjs
 * for use in vitest test files that cannot statically import .mjs modules.
 *
 * Keep in sync with ci-governance-guards.mjs — the logic here mirrors the exports
 * used by tests (scanVirtualFiles, scanText, scanMigrationText, scanMigrationNames).
 */
import path from "node:path";

const SCANNED_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const TEST_PATH_RE =
  /(^|\/)(__fixtures__|fixtures|test|tests|__tests__)\/|\.(guard\.)?test\.[cm]?[jt]sx?$/i;
const DOC_PATH_RE = /(^|\/)(docs\/.*|.*\.md)$/i;
const EXAMPLE_PATH_RE =
  /(^|\/)(\.env\.example|.*\.example(\.|$)|config\/secrets\.json\.example$)/i;
const STOCK_ALLOWED_RE =
  /(^|\/)(server\/.*(stock|inventory|reservation).*(service|ledger)\.[jt]s|server\/services\/stockTruthCertification\.[jt]s|server\/.*stock.*invariant.*\.[jt]s|server\/.*reservation.*truth.*\.[jt]s|server\/stockTruth\.[jt]s|server\/stock-invariant.*\.[jt]s|server\/routers\/(inventoryRouter|purchaseRouter)\.[jt]s)$/i;
const RUNTIME_PATH_RE = /(^|\/)(client|server|shared|scripts)\//;
const GOVERNANCE_RULE_PATH_RE =
  /^scripts\/(ci-governance-guards|ci-governance-guards-shim|check-runtime-placeholders)\.[cm]?[jt]sx?$/;

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isTestPath(filePath: string) {
  return TEST_PATH_RE.test(normalizePath(filePath));
}
function isDocPath(filePath: string) {
  return DOC_PATH_RE.test(normalizePath(filePath));
}
function isExamplePath(filePath: string) {
  return EXAMPLE_PATH_RE.test(normalizePath(filePath));
}
function isRuntimePath(filePath: string) {
  return RUNTIME_PATH_RE.test(normalizePath(filePath)) && !isDocPath(filePath);
}
function isStockAllowedPath(filePath: string) {
  return STOCK_ALLOWED_RE.test(normalizePath(filePath));
}

type Finding = {
  category: string;
  filePath: string;
  line: number;
  message: string;
  evidence: string;
};

function addFinding(
  findings: Finding[],
  category: string,
  filePath: string,
  line: number,
  message: string,
  evidence?: string
) {
  findings.push({
    category,
    filePath: normalizePath(filePath),
    line,
    message,
    evidence: evidence?.trim() ?? "",
  });
}

function scanLines(
  filePath: string,
  text: string,
  visitor: (line: string, lineNumber: number, lines: string[]) => void
) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => visitor(line, index + 1, lines));
}

export function scanText(filePath: string, text: string): Finding[] {
  const findings: Finding[] = [];
  const normalized = normalizePath(filePath);
  const testPath = isTestPath(normalized);
  const docPath = isDocPath(normalized);
  const governanceRulePath = GOVERNANCE_RULE_PATH_RE.test(normalized);
  const runtimePath = isRuntimePath(normalized);

  scanLines(normalized, text, (line, lineNumber, lines) => {
    if (/^(<<<<<<<|=======|>>>>>>>)($|\s)/.test(line))
      addFinding(
        findings,
        "merge-corruption",
        normalized,
        lineNumber,
        "Unresolved merge conflict marker found.",
        line
      );
    if (
      !governanceRulePath &&
      /\b(FIXME_PRODUCTION|TEMP_SKIP_SECURITY)\b/i.test(line)
    )
      addFinding(
        findings,
        "merge-corruption",
        normalized,
        lineNumber,
        "Unresolved production/security TODO marker found.",
        line
      );
    if (
      /production\s+(ready|readiness)\s*(is|:)?\s*10\s*\/\s*10/i.test(line) &&
      !/without|never|do not|must not/i.test(line)
    )
      addFinding(
        findings,
        "merge-corruption",
        normalized,
        lineNumber,
        "Stale production-ready 10/10 claim requires proof.",
        line
      );
    if (testPath || governanceRulePath) return;
    const providerWindow = line;
    if (
      runtimePath &&
      /\b(fake success|stub success|mock success in production)\b/i.test(line)
    )
      addFinding(
        findings,
        "provider-risk",
        normalized,
        lineNumber,
        "Fake/stub/mock production success language found.",
        line
      );
    if (
      runtimePath &&
      /provider_unconfigured/i.test(providerWindow) &&
      /(status\s*[:=]\s*["'`](sent|synced|verified|complete|completed)["'`]|\b(sent|synced|verified|imported|complete|completed)\s*[:=]\s*true\b)/i.test(
        providerWindow
      ) &&
      !/type\s+\w+\s*=/.test(providerWindow)
    )
      addFinding(
        findings,
        "provider-risk",
        normalized,
        lineNumber,
        "provider_unconfigured appears to be treated as sent/synced/verified/imported/complete.",
        line
      );
    if (
      runtimePath &&
      /demo_skipped/i.test(providerWindow) &&
      /(status\s*[:=]\s*["'`](sent|synced|verified|complete|completed)["'`]|\b(sent|synced|verified|imported|complete|completed)\s*[:=]\s*true\b)/i.test(
        providerWindow
      ) &&
      !/type\s+\w+\s*=/.test(providerWindow)
    )
      addFinding(
        findings,
        "provider-risk",
        normalized,
        lineNumber,
        "demo_skipped appears to be treated as real success.",
        line
      );
    if (
      runtimePath &&
      /(provider|gateway|erp|tally|export|import)/i.test(
        normalized + " " + providerWindow
      ) &&
      /\b(imported|synced)\s*[:=]\s*true\b/i.test(line) &&
      !/(provider|gateway|erp|tally|response|proof|confirmed|verified)/i.test(
        providerWindow
      )
    )
      addFinding(
        findings,
        "provider-risk",
        normalized,
        lineNumber,
        "Imported/synced true appears without nearby provider proof.",
        line
      );
    if (
      runtimePath &&
      !/^server\/services\/(stockInvariant|reservationService)\.[jt]s$/i.test(
        normalized
      )
    ) {
      if (
        /\b(?:db|tx)\.update\(batchLedger\)\.set\(\{[^}]*\bqtyReserved\s*:/i.test(
          line
        )
      )
        addFinding(
          findings,
          "stock-mutation-risk",
          normalized,
          lineNumber,
          "Direct qtyReserved batch ledger mutation outside stockInvariant/reservationService.",
          line
        );
    }
    if (runtimePath && !isStockAllowedPath(normalized)) {
      if (
        /\b(update|insert|delete|set)\b.*(\bbatches\.qtyOnHand\b|\bstoreSkus\.availableQty\b)|\binsert\s*\(\s*(stockMovements|stock_movements|batchLedger|batch_ledger)\s*\)|\b(stock_reservations|stockReservations)\b.*\b(update|insert|delete|set)\b|\b(update|insert|delete)\b.*\b(stock_reservations|stockReservations)\b/i.test(
          line
        )
      )
        addFinding(
          findings,
          "stock-mutation-risk",
          normalized,
          lineNumber,
          "Direct stock mutation outside an allowed stock/reservation service.",
          line
        );
    }
    if (
      runtimePath &&
      /\b(entityId\s*:\s*0|Number\s*\(\s*(line\.id|saleId|orderId|uuid)\s*\)|parseInt\s*\(\s*uuid\s*\))/i.test(
        line
      )
    )
      addFinding(
        findings,
        "audit-reference-risk",
        normalized,
        lineNumber,
        "Unsafe numeric coercion or sentinel entity ID in an audit-sensitive runtime path.",
        line
      );
    if (
      runtimePath &&
      /<Route\b[^>]*path\s*=\s*["'`][^"'`]*(admin|pharmacy)[^"'`]*["'`]/i.test(
        line
      )
    ) {
      const routeBlock = lines
        .slice(lineNumber - 1, Math.min(lines.length, lineNumber + 4))
        .join(" ");
      if (
        !/\b(AdminRoute|StaffRoute|RestrictedRoute|requireAdmin|requireStaff|RBAC|roleGuard|allow=)/i.test(
          routeBlock
        )
      )
        addFinding(
          findings,
          "admin-auth-bypass-risk",
          normalized,
          lineNumber,
          "Admin/pharmacy route lacks a visible route-level admin/staff/RBAC guard.",
          line
        );
    }
    if (
      runtimePath &&
      /\b(app|router)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*["'`]\/[^"'`]*(admin|pharmacy)[^"'`]*["'`]/i.test(
        line
      )
    ) {
      const routeBlock = lines
        .slice(lineNumber - 1, Math.min(lines.length, lineNumber + 5))
        .join(" ");
      if (
        !/\b(requireAdmin|requireStaff|AdminRoute|StaffRoute|RestrictedRoute|RBAC|withRole|adminProcedure|staffProcedure|protectedProcedure)\b/i.test(
          routeBlock
        )
      )
        addFinding(
          findings,
          "admin-auth-bypass-risk",
          normalized,
          lineNumber,
          "Admin/pharmacy API route lacks a visible admin/staff/RBAC guard.",
          line
        );
    }
    if (!docPath && !isExamplePath(normalized)) {
      if (/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i.test(line))
        addFinding(
          findings,
          "secret-leakage",
          normalized,
          lineNumber,
          "Private key material found.",
          line
        );
      if (
        /\b(?:RAZORPAY_(?:KEY_SECRET|WEBHOOK_SECRET)|WHATSAPP_(?:API_TOKEN|ACCESS_TOKEN|WEBHOOK_SECRET)|JWT_SECRET|DATABASE_URL|AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY)|S3_(?:ACCESS_KEY|SECRET_KEY))\b\s*[:=]\s*["'`][^"'`\s]{8,}["'`]/i.test(
          line
        )
      )
        addFinding(
          findings,
          "secret-leakage",
          normalized,
          lineNumber,
          "Likely committed secret assignment found.",
          line
        );
      if (
        /\b(?:api[_-]?key|secret[_-]?key|access[_-]?token)\b\s*[:=]\s*["'`](?!process\.env|<|your_|REPLACE|example|test_|demo_|dummy)[A-Za-z0-9_./+=:-]{20,}["'`]/i.test(
          line
        )
      )
        addFinding(
          findings,
          "secret-leakage",
          normalized,
          lineNumber,
          "Likely hard-coded API key/token/secret found.",
          line
        );
    }
    if (runtimePath) {
      const placeholderWindow = lines
        .slice(lineNumber - 1, Math.min(lines.length, lineNumber + 3))
        .join(" ");
      if (/TODO:\s*implement later/i.test(line))
        addFinding(
          findings,
          "placeholder-production-risk",
          normalized,
          lineNumber,
          "Runtime placeholder TODO remains.",
          line
        );
      if (
        /not implemented/i.test(placeholderWindow) &&
        /(return\s+true\b|return\s*\{\s*success\s*:\s*true\s*\})/i.test(
          placeholderWindow
        )
      )
        addFinding(
          findings,
          "placeholder-production-risk",
          normalized,
          lineNumber,
          "Not-implemented path appears to return success.",
          line
        );
      if (
        /return\s*\{\s*success\s*:\s*true\s*\}/i.test(line) &&
        /(placeholder|stub|mock|TODO|implement later|not implemented)/i.test(
          placeholderWindow
        )
      )
        addFinding(
          findings,
          "placeholder-production-risk",
          normalized,
          lineNumber,
          "Placeholder/stub path returns success true.",
          line
        );
      if (
        /preview_only/i.test(placeholderWindow) &&
        /(printed\s*[:=]\s*true|status\s*[:=]\s*["'`]printed["'`])/i.test(
          placeholderWindow
        )
      )
        addFinding(
          findings,
          "placeholder-production-risk",
          normalized,
          lineNumber,
          "preview_only appears to be marked printed.",
          line
        );
      if (
        /provider_unconfigured/i.test(placeholderWindow) &&
        /(complete\s*[:=]\s*true|completed\s*[:=]\s*true|status\s*[:=]\s*["'`](complete|completed)["'`])/i.test(
          placeholderWindow
        )
      )
        addFinding(
          findings,
          "placeholder-production-risk",
          normalized,
          lineNumber,
          "provider_unconfigured appears to be marked complete.",
          line
        );
      if (
        /ocr|ingestion|invoice|purchase/i.test(normalized) &&
        /(placeholder|mock|demo):\/\//i.test(line)
      )
        addFinding(
          findings,
          "placeholder-production-risk",
          normalized,
          lineNumber,
          "OCR/invoice runtime contains a placeholder evidence URL scheme.",
          line
        );
      if (
        /ocr|ingestion|invoice|purchase/i.test(normalized) &&
        /example\.(com|org|net)/i.test(line) &&
        /(fileUrl|storageUrl|evidence|invoice)/i.test(placeholderWindow)
      )
        addFinding(
          findings,
          "placeholder-production-risk",
          normalized,
          lineNumber,
          "OCR/invoice runtime contains example-domain evidence.",
          line
        );
      if (
        /ocr|ingestion|invoice|purchase/i.test(normalized) &&
        /provider_unconfigured/i.test(placeholderWindow) &&
        /(success\s*[:=]\s*true|parsed\s*[:=]\s*true|uploaded\s*[:=]\s*true)/i.test(
          placeholderWindow
        )
      )
        addFinding(
          findings,
          "provider-risk",
          normalized,
          lineNumber,
          "OCR provider_unconfigured path appears to claim successful parse/upload.",
          line
        );
    }
  });
  return findings;
}

export function scanMigrationNames(filePaths: string[]): Finding[] {
  const findings: Finding[] = [];
  const migrationFiles = filePaths
    .map(normalizePath)
    .filter(fp => /^drizzle\/\d{4}_.+\.sql$/i.test(fp))
    .sort();
  const byNumber = new Map<string, string[]>();
  for (const fp of migrationFiles) {
    const number = fp.match(/^drizzle\/(\d{4})_/i)?.[1];
    if (!number) continue;
    const existing = byNumber.get(number) ?? [];
    existing.push(fp);
    byNumber.set(number, existing);
  }
  for (const [number, files] of byNumber.entries()) {
    if (files.length > 1) {
      for (const fp of files)
        addFinding(
          findings,
          "migration-risk",
          fp,
          1,
          `Duplicate Drizzle migration number ${number}.`,
          files.join(", ")
        );
    }
  }
  const numbers = migrationFiles.map(fp =>
    Number(fp.match(/^drizzle\/(\d{4})_/i)?.[1])
  );
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] < numbers[i - 1])
      addFinding(
        findings,
        "migration-risk",
        migrationFiles[i],
        1,
        "Non-monotonic Drizzle migration ordering detected.",
        migrationFiles[i]
      );
  }
  return findings;
}

export function scanMigrationText(filePath: string, text: string): Finding[] {
  const findings: Finding[] = [];
  if (!/^drizzle\/.*\.sql$/i.test(normalizePath(filePath))) return findings;
  scanLines(filePath, text, (line, lineNumber) => {
    if (
      /\b(drop\s+table|drop\s+column|truncate\s+table|delete\s+from)\b/i.test(
        line
      ) &&
      !/governance-approved|documented destructive migration|backfill/i.test(
        line
      )
    )
      addFinding(
        findings,
        "migration-risk",
        filePath,
        lineNumber,
        "Potential destructive migration statement lacks explicit documentation marker.",
        line
      );
    if (
      /schema\/migration mismatch|drizzle mismatch|FIXME_MIGRATION/i.test(line)
    )
      addFinding(
        findings,
        "migration-risk",
        filePath,
        lineNumber,
        "Schema/migration mismatch marker found.",
        line
      );
  });
  return findings;
}

export function scanVirtualFiles(files: Record<string, string>): Finding[] {
  const filePaths = Object.keys(files).map(normalizePath);
  return [
    ...filePaths.flatMap(fp => scanText(fp, files[fp])),
    ...filePaths.flatMap(fp => scanMigrationText(fp, files[fp])),
    ...scanMigrationNames(filePaths),
  ];
}
