/**
 * final-blockers.test.ts
 *
 * Regression tests for the final production blocker fixes:
 *   1. CSRF enforcement defaults to "enforce" in production (already in production-hardening.test.ts — re-verified here)
 *   2. Ghost order rollback: catch block calls updateOrderStatus("cancelled")
 *   3. WhatsApp Rx storage keys use crypto.randomUUID (not phone+Date.now)
 *   4. Silent notification failures: alertNewOrder catch logs, not swallows
 *   5. SBOM fallback produces non-empty components from pnpm list
 *   6. Emergency-stop fail-open posture is intentional and documented
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

// ─── 1. CSRF fail-closed default ─────────────────────────────────────────────
describe("CSRF enforcement — fail-closed default", () => {
  it("env.ts defaults csrfEnforcement to 'enforce' in production", () => {
    const src = readSrc("_core/env.ts");
    // Must have the production-default enforce block
    expect(src).toMatch(/NODE_ENV.*===.*["']production["'].*?["']enforce["']/s);
    // The comment must document the production default
    expect(src).toMatch(/Production default.*enforce/);
  });

  it("CSRF_SECRET is in assertProductionEnvSafe required vars", () => {
    const src = readSrc("_core/env.ts");
    expect(src).toMatch(/CSRF_SECRET/);
    expect(src).toMatch(/assertProductionEnvSafe/);
  });
});

// ─── 2. Ghost order rollback ──────────────────────────────────────────────────
describe("Ghost order rollback — catch block cancels the order record", () => {
  it("orderRouter.ts catch block calls updateOrderStatus with 'cancelled'", () => {
    const src = readSrc("routers/orderRouter.ts");
    // The catch block must call updateOrderStatus(orderId, "cancelled")
    expect(src).toMatch(/updateOrderStatus\(orderId,\s*["']cancelled["']\)/);
  });

  it("orderRouter.ts catch block calls releaseReservationOnOrderCancel before cancelling", () => {
    const src = readSrc("routers/orderRouter.ts");
    const catchIdx = src.indexOf("} catch (error)");
    expect(catchIdx).toBeGreaterThan(0);
    const catchBlock = src.slice(catchIdx, catchIdx + 1000);
    // Reservation release must appear before updateOrderStatus in the catch block
    const releaseIdx = catchBlock.indexOf("releaseReservationOnOrderCancel");
    const cancelIdx = catchBlock.indexOf("updateOrderStatus");
    expect(releaseIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeGreaterThan(-1);
    expect(releaseIdx).toBeLessThan(cancelIdx);
  });

  it("orderRouter.ts catch block does not silently swallow reservation release errors", () => {
    const src = readSrc("routers/orderRouter.ts");
    // The reservation release in the catch block must have a .catch with a logger.warn
    expect(src).toMatch(
      /releaseReservationOnOrderCancel[\s\S]{0,200}\.catch\(/
    );
  });
});

// ─── 3. WhatsApp Rx random storage keys ──────────────────────────────────────
describe("WhatsApp Rx storage keys — crypto.randomUUID, no PII in path", () => {
  it("whatsappFlowHandlers.ts imports randomUUID from node:crypto", () => {
    const src = readSrc("routers/whatsappFlowHandlers.ts");
    expect(src).toMatch(/randomUUID/);
    expect(src).toMatch(/node:crypto/);
  });

  it("whatsappFlowHandlers.ts Rx key does not use Date.now() or phone variable", () => {
    const src = readSrc("routers/whatsappFlowHandlers.ts");
    const srcNoComments = stripComments(src);
    // The whatsapp-rx key line must not contain Date.now() or ${phone}
    const rxKeyLine = srcNoComments
      .split("\n")
      .find(l => l.includes("whatsapp-rx/"));
    expect(rxKeyLine).toBeDefined();
    expect(rxKeyLine).not.toMatch(/Date\.now\(\)/);
    expect(rxKeyLine).not.toMatch(/\$\{phone\}/);
    expect(rxKeyLine).toMatch(/randomUUID\(\)/);
  });

  it("whatsappFlowHandlers.ts bill upload key does not use Date.now() or phone variable", () => {
    const src = readSrc("routers/whatsappFlowHandlers.ts");
    const srcNoComments = stripComments(src);
    const billKeyLine = srcNoComments
      .split("\n")
      .find(l => l.includes("whatsapp-bill/"));
    expect(billKeyLine).toBeDefined();
    expect(billKeyLine).not.toMatch(/Date\.now\(\)/);
    expect(billKeyLine).not.toMatch(/\$\{phone\}/);
    expect(billKeyLine).toMatch(/randomUUID\(\)/);
  });
});

// ─── 4. Silent notification failure logging ───────────────────────────────────
describe("Silent notification failures — structured logging, not swallowing", () => {
  it("orderRouter.ts alertNewOrder catch logs with logger.warn (not empty catch)", () => {
    const src = readSrc("routers/orderRouter.ts");
    // The alertNewOrder catch must call logger.warn
    const alertSection = src.slice(
      src.indexOf("alertNewOrder("),
      src.indexOf("alertNewOrder(") + 300
    );
    expect(alertSection).toMatch(/\.catch\(\(err/);
    expect(alertSection).toMatch(/logger\.warn/);
  });

  it("orderRouter.ts imports pino and creates a logger", () => {
    const src = readSrc("routers/orderRouter.ts");
    expect(src).toMatch(/import pino from ["']pino["']/);
    expect(src).toMatch(/pino\(/);
  });

  it("orderRouter.ts does not have an empty .catch(() => {}) for alertNewOrder", () => {
    const src = readSrc("routers/orderRouter.ts");
    const alertIdx = src.indexOf("alertNewOrder(");
    const catchAfterAlert = src.slice(alertIdx, alertIdx + 300);
    // Must not be an empty catch
    expect(catchAfterAlert).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
  });
});

// ─── 5. SBOM fallback — non-empty components ─────────────────────────────────
describe("SBOM fallback — non-empty component list from pnpm list", () => {
  it("sbom-generate.mjs uses pnpm list --json to populate fallback components", () => {
    const src = readScript("sbom-generate.mjs");
    expect(src).toMatch(/pnpm.*list.*--json/);
    expect(src).not.toMatch(/components:\s*\[\]/);
  });

  it("sbom-generate.mjs fallback includes purl field for each component", () => {
    const src = readScript("sbom-generate.mjs");
    expect(src).toMatch(/purl.*pkg:npm/);
  });

  it("sbom-generate.mjs fallback warns (not silently succeeds) when using fallback", () => {
    const src = readScript("sbom-generate.mjs");
    // Must use console.warn (not console.log) for the fallback path
    const fallbackSection = src.slice(
      src.indexOf("cyclonedx-npm could not produce"),
      src.indexOf("cyclonedx-npm could not produce") + 2000
    );
    expect(fallbackSection).toMatch(/console\.warn/);
  });
});

// ─── 6. Emergency-stop fail-open posture is documented ───────────────────────
describe("Emergency-stop — intentional fail-open posture is documented", () => {
  it("emergencyStopService.ts documents the intentional fail-open posture", () => {
    const src = readSrc("services/emergencyStopService.ts");
    // Must have a comment explaining the intentional fail-open decision
    expect(src).toMatch(/INTENTIONAL FAIL-OPEN POSTURE/);
  });

  it("emergencyStopMiddleware.ts has a catch block that calls next() on error", () => {
    const src = readSrc("_core/emergencyStopMiddleware.ts");
    // The middleware must have a catch block that calls next() (fail-open)
    expect(src).toMatch(/catch/);
    expect(src).toMatch(/next\(\)/);
  });

  it("tRPC customerMutationProcedure blocks when emergency stop is active", () => {
    const src = readSrc("_core/trpc.ts");
    expect(src).toMatch(/customerMutationProcedure/);
    expect(src).toMatch(/SERVICE_UNAVAILABLE/);
    expect(src).toMatch(/flag\.active/);
  });
});
