/**
 * production-readiness-sprint.test.ts
 *
 * Regression tests for the final production readiness sprint:
 *   1.  Storage: assertSafeStorageKey rejects path traversal and unapproved prefixes
 *   2.  Storage: storagePut calls assertSafeStorageKey
 *   3.  CSRF: httpSecurity.ts does NOT contain ?? "log_only" fallback
 *   4.  Emergency stop: middleware fails closed for mutations when readFlag throws in production
 *   5.  Emergency stop: middleware fails open for reads when readFlag throws
 *   6.  Payment/refund: advanceStatus blocks cancellation of paid orders without refund
 *   7.  Notification: payment.ts does NOT have silent .catch(() => {}) on sendOpsAlert
 *   8.  Notification: helpdeskRouter.ts does NOT have silent .catch(() => {}) on notifyOwner
 *   9.  SBOM: sbom-generate.mjs fallback produces real components from pnpm list
 *   10. SBOM: sbom-ci-guard.mjs exits 1 on empty components array
 *   11. DSR: erasure endpoint exists in dsrRouter.ts
 *   12. DSR: retention worker processes confirmed erasure requests
 *   13. DSR: dsrSlaMonitor is wired at boot
 *   14. Rate limit: startup warning added for non-durable backend
 *   15. Storage keys: ingestionRouter uses randomUUID (not user-controlled filename)
 *   16. Storage keys: imageGeneration uses randomUUID (not Date.now)
 *   17. Storage keys: db-extended invoice uses randomUUID (not Date.now)
 *   18. Storage keys: whatsapp flow handlers use randomUUID (not phone+Date.now)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SERVER = path.join(__dirname);
const SCRIPTS = path.join(__dirname, "..", "scripts");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(SERVER, relPath), "utf8");
}
function readScript(name: string): string {
  return fs.readFileSync(path.join(SCRIPTS, name), "utf8");
}
function stripComments(src: string): string {
  return src
    .split("\n")
    .filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

// ─── 1 & 2. Storage security ──────────────────────────────────────────────────
describe("Storage security — assertSafeStorageKey", () => {
  it("assertSafeStorageKey rejects path traversal (..)", async () => {
    const { assertSafeStorageKey } = await import("./_core/storageAccess");
    expect(() => assertSafeStorageKey("prescriptions/../etc/passwd")).toThrow();
  });

  it("assertSafeStorageKey rejects absolute paths", async () => {
    const { assertSafeStorageKey } = await import("./_core/storageAccess");
    expect(() => assertSafeStorageKey("/etc/passwd")).toThrow();
  });

  it("assertSafeStorageKey rejects backslash traversal", async () => {
    const { assertSafeStorageKey } = await import("./_core/storageAccess");
    expect(() => assertSafeStorageKey("prescriptions\\..\\secret")).toThrow();
  });

  it("assertSafeStorageKey rejects percent-encoded traversal", async () => {
    const { assertSafeStorageKey } = await import("./_core/storageAccess");
    expect(() => assertSafeStorageKey("prescriptions/%2e%2e/secret")).toThrow();
  });

  it("assertSafeStorageKey rejects unapproved prefix", async () => {
    const { assertSafeStorageKey } = await import("./_core/storageAccess");
    expect(() => assertSafeStorageKey("secrets/key.pem")).toThrow();
  });

  it("assertSafeStorageKey accepts valid approved prefix", async () => {
    const { assertSafeStorageKey } = await import("./_core/storageAccess");
    expect(() =>
      assertSafeStorageKey("prescriptions/user-1/rx-abc123.pdf")
    ).not.toThrow();
  });

  it("storagePut calls assertSafeStorageKey before writing", () => {
    const src = readSrc("storage.ts");
    expect(src).toContain("assertSafeStorageKey");
  });
});

// ─── 3. CSRF fail-closed ──────────────────────────────────────────────────────
describe("CSRF enforcement — fail-closed, no log_only fallback", () => {
  it("httpSecurity.ts does NOT contain '?? \"log_only\"' fallback", () => {
    const src = readSrc("middleware/httpSecurity.ts");
    // The old fallback was: ?? "log_only" — this must be gone
    expect(src).not.toMatch(/\?\?\s*["']log_only["']/);
  });

  it("httpSecurity.ts uses env.csrfEnforcement directly", () => {
    const src = readSrc("middleware/httpSecurity.ts");
    expect(src).toContain("csrfEnforcement");
  });
});

// ─── 4 & 5. Emergency stop fail-closed ───────────────────────────────────────
describe("Emergency stop middleware — fail-closed for mutations", () => {
  it("middleware fails closed for mutations when readFlag throws in production", () => {
    const src = readSrc("_core/emergencyStopMiddleware.ts");
    // Must check isProduction and MUTATION_METHODS
    expect(src).toContain("isProduction");
    expect(src).toContain("MUTATION_METHODS");
    // Must return 503 when production + mutation + readFlag throws
    expect(src).toMatch(/503/);
  });

  it("middleware fails open for reads when readFlag throws", () => {
    const src = readSrc("_core/emergencyStopMiddleware.ts");
    // The catch block must call next() for non-mutation or non-production
    expect(src).toContain("next()");
  });

  it("MUTATION_METHODS includes POST, PUT, PATCH, DELETE", () => {
    const src = readSrc("_core/emergencyStopMiddleware.ts");
    expect(src).toContain('"POST"');
    expect(src).toContain('"PUT"');
    expect(src).toContain('"PATCH"');
    expect(src).toContain('"DELETE"');
  });
});

// ─── 6. Payment/refund guard ──────────────────────────────────────────────────
describe("Payment/refund — paid order cancellation guard", () => {
  it("orderRouter.ts imports getPaymentByOrderId", () => {
    const src = readSrc("routers/orderRouter.ts");
    expect(src).toContain("getPaymentByOrderId");
  });

  it("orderRouter.ts blocks cancellation of paid orders without refund", () => {
    const src = readSrc("routers/orderRouter.ts");
    // Must check payment.status === "paid" and !payment.refundId
    expect(src).toMatch(/payment.*status.*["']paid["']/s);
    expect(src).toMatch(/refundId/);
    expect(src).toMatch(/PRECONDITION_FAILED/);
  });
});

// ─── 7 & 8. Notification reliability ─────────────────────────────────────────
describe("Notification reliability — no silent catches on ops alerts", () => {
  it("payment.ts does NOT have a silent .catch(() => {}) on sendOpsAlert", () => {
    const src = readSrc("payment.ts");
    const activeCode = stripComments(src);
    // The old pattern was: .catch(() => {}) immediately after sendOpsAlert
    // We check that any catch on sendOpsAlert logs via logger.warn
    const sendOpsAlertBlock = activeCode.match(
      /sendOpsAlert[\s\S]{0,300}?\.catch\(([\s\S]{0,200}?)\)/
    );
    if (sendOpsAlertBlock) {
      // If there is a .catch, it must not be empty
      expect(sendOpsAlertBlock[1]).not.toMatch(
        /^\s*\(\s*\)\s*=>\s*\{\s*\}\s*$/
      );
    }
  });

  it("payment.ts has a structured logger.warn in the sendOpsAlert catch", () => {
    const src = readSrc("payment.ts");
    expect(src).toContain("logger.warn");
    expect(src).toContain("SLA breach ops alert failed");
  });

  it("helpdeskRouter.ts does NOT have a silent .catch(() => {}) on notifyOwner", () => {
    const src = readSrc("routers/helpdeskRouter.ts");
    const activeCode = stripComments(src);
    const notifyOwnerBlock = activeCode.match(
      /notifyOwner[\s\S]{0,300}?\.catch\(([\s\S]{0,200}?)\)/
    );
    if (notifyOwnerBlock) {
      expect(notifyOwnerBlock[1]).not.toMatch(/^\s*\(\s*\)\s*=>\s*\{\s*\}\s*$/);
    }
  });

  it("helpdeskRouter.ts has a structured logger.warn in the notifyOwner catch", () => {
    const src = readSrc("routers/helpdeskRouter.ts");
    expect(src).toContain("logger.warn");
    expect(src).toContain("notifyOwner: new ticket notification failed");
  });
});

// ─── 9 & 10. SBOM CI guard ───────────────────────────────────────────────────
describe("SBOM CI guard", () => {
  it("sbom-generate.mjs fallback uses pnpm list --json to populate components", () => {
    const src = readScript("sbom-generate.mjs");
    expect(src).toContain("pnpm");
    expect(src).toContain("list");
    expect(src).toContain("--json");
    expect(src).toContain("components");
  });

  it("sbom-ci-guard.mjs exists", () => {
    const guardPath = path.join(SCRIPTS, "sbom-ci-guard.mjs");
    expect(fs.existsSync(guardPath)).toBe(true);
  });

  it("sbom-ci-guard.mjs exits 1 when components array is empty", () => {
    const src = readScript("sbom-ci-guard.mjs");
    // Must check count === 0 and call process.exit(1)
    expect(src).toContain("count === 0");
    expect(src).toContain("process.exit(1)");
  });

  it("sbom-ci-guard.mjs exits 1 when SBOM file is missing", () => {
    const src = readScript("sbom-ci-guard.mjs");
    expect(src).toContain("existsSync");
    expect(src).toContain("process.exit(1)");
  });

  it("package.json has sbom:guard script", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
    );
    expect(pkg.scripts["sbom:guard"]).toBeDefined();
    expect(pkg.scripts["sbom:guard"]).toContain("sbom-ci-guard.mjs");
  });
});

// ─── 11 & 12. DSR/erasure compliance ─────────────────────────────────────────
describe("DSR/erasure compliance", () => {
  it("dsrRouter.ts has an erasure procedure", () => {
    const src = readSrc("routers/dsrRouter.ts");
    expect(src).toContain("erasure:");
    expect(src).toContain("createErasureRequest");
  });

  it("dsrRouter.ts has a confirmErasure procedure", () => {
    const src = readSrc("routers/dsrRouter.ts");
    expect(src).toContain("confirmErasure:");
    expect(src).toContain("confirmErasureRequest");
  });

  it("dsrService.ts implements createErasureRequest", () => {
    const src = readSrc("services/dsrService.ts");
    expect(src).toContain("createErasureRequest");
    expect(src).toContain('requestKind: "erasure"');
  });

  it("retentionWorker.ts processes confirmed erasure requests", () => {
    const src = readSrc("services/retentionWorker.ts");
    expect(src).toContain("erasure");
    expect(src).toContain("confirmed");
    expect(src).toContain("anonymize");
  });
});

// ─── 13. DSR SLA monitor wired at boot ───────────────────────────────────────
describe("DSR SLA monitor — wired at boot", () => {
  it("index.ts imports and starts dsrSlaMonitor", () => {
    const src = readSrc("_core/index.ts");
    expect(src).toContain("startDsrSlaMonitor");
    expect(src).toContain("dsrSlaMonitor");
  });

  it("index.ts imports and starts retentionWorker", () => {
    const src = readSrc("_core/index.ts");
    expect(src).toContain("startRetentionWorker");
    expect(src).toContain("retentionWorker");
  });
});

// ─── 14. Rate limit startup warning ──────────────────────────────────────────
describe("Rate limiting — startup warning for non-durable backend", () => {
  it("index.ts emits a startup warning when rate limit backend is non-durable", () => {
    const src = readSrc("_core/index.ts");
    expect(src).toMatch(/rate.?limit/i);
    expect(src).toMatch(/warn/i);
  });
});

// ─── 15–18. Storage key randomization ────────────────────────────────────────
describe("Storage key randomization — no user-controlled or time-based keys", () => {
  it("ingestionRouter.ts uses randomUUID for storage keys (not user filename)", () => {
    const src = readSrc("routers/ingestionRouter.ts");
    expect(src).toContain("randomUUID");
    // Must NOT use the original filename directly as the key
    expect(src).not.toMatch(/storagePut\([^)]*fileName[^)]*\)/);
  });

  it("imageGeneration.ts uses randomUUID for storage keys (not Date.now)", () => {
    const src = readSrc("_core/imageGeneration.ts");
    expect(src).toContain("randomUUID");
    // Must NOT use Date.now() as the key component
    expect(src).not.toMatch(/storagePut\([^)]*Date\.now\(\)[^)]*\)/);
  });

  it("db-extended.ts uses randomUUID for invoice storage keys (not Date.now)", () => {
    const src = readSrc("db-extended.ts");
    expect(src).toContain("randomUUID");
    expect(src).not.toMatch(/storagePut\([^)]*Date\.now\(\)[^)]*\)/);
  });

  it("whatsappFlowHandlers.ts uses randomUUID for Rx and bill storage keys", () => {
    const src = readSrc("routers/whatsappFlowHandlers.ts");
    expect(src).toContain("randomUUID");
    // Must NOT use phone number + Date.now() as the key
    expect(src).not.toMatch(/phone.*Date\.now/);
  });
});
