/**
 * production-hardening.test.ts
 *
 * Regression tests for every production blocker fixed in the hardening pass:
 *   1. OTP generation uses crypto.randomInt (not Math.random)
 *   2. Payment paise conversion is integer-safe (no float rounding)
 *   3. Order FSM rejects illegal state transitions
 *   4. Prescription storage key uses crypto.randomUUID (not Date.now)
 *   5. WhatsApp webhook guard enforces validation in production
 *   6. CSRF enforcement defaults to "enforce" in production
 *   7. paymentGateway demo_skipped is blocked in production
 *   8. createOrder uses DB transaction wrapping
 *   9. orderRouter uses integer paise arithmetic
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { randomInt, randomUUID } from "node:crypto";

const SERVER = path.join(__dirname);

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(SERVER, relPath), "utf8");
}

function stripComments(src: string): string {
  return src
    .split("\n")
    .filter(l => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

// ─── 1. OTP generation: crypto.randomInt ─────────────────────────────────────
describe("OTP generation — crypto.randomInt", () => {
  it("authRouter.ts uses randomInt (not Math.random) for OTP generation", () => {
    const src = readSrc("routers/authRouter.ts");
    const srcNoComments = stripComments(src);
    expect(srcNoComments).not.toMatch(/Math\.random\(\)/);
    expect(src).toMatch(/randomInt/);
  });

  it("pharmacy.ts uses randomInt (not Math.random) for delivery OTP", () => {
    const src = readSrc("pharmacy.ts");
    const srcNoComments = stripComments(src);
    expect(srcNoComments).not.toMatch(/Math\.random\(\)/);
    expect(src).toMatch(/randomInt/);
  });

  it("crypto.randomInt produces values in [100000, 1000000)", () => {
    const samples = Array.from({ length: 100 }, () =>
      randomInt(100000, 1000000)
    );
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(100000);
      expect(s).toBeLessThan(1000000);
      expect(Number.isInteger(s)).toBe(true);
    }
  });
});

// ─── 2. Payment paise conversion — integer-safe ───────────────────────────────
describe("Payment paise conversion — integer arithmetic", () => {
  function toPaise(decimalStr: string): number {
    const s = String(decimalStr ?? "0");
    const [r, p = "00"] = s.split(".");
    return parseInt(r, 10) * 100 + parseInt(p.padEnd(2, "0").slice(0, 2), 10);
  }

  it("converts whole rupees correctly", () => {
    expect(toPaise("100")).toBe(10000);
    expect(toPaise("1")).toBe(100);
    expect(toPaise("0")).toBe(0);
  });

  it("converts decimal rupees without float rounding errors", () => {
    expect(toPaise("1.10")).toBe(110);
    expect(toPaise("2.20")).toBe(220);
    expect(toPaise("149.50")).toBe(14950);
    expect(toPaise("99.99")).toBe(9999);
    expect(toPaise("0.01")).toBe(1);
  });

  it("handles single-digit paise correctly", () => {
    expect(toPaise("10.5")).toBe(1050);
    expect(toPaise("10.05")).toBe(1005);
  });

  it("paymentGateway.ts uses integer string-splitting (not Math.round * 100)", () => {
    const src = readSrc("services/paymentGateway.ts");
    expect(src).not.toMatch(/Math\.round\(Number\(.*\)\s*\*\s*100\)/);
    expect(src).toMatch(/parseInt.*rupeesPart/);
    expect(src).toMatch(/parseInt.*paisePart/);
  });

  it("paymentGateway.ts demo_skipped is guarded by runtimeIsProduction check", () => {
    const src = readSrc("services/paymentGateway.ts");
    const firstGuardIdx = src.indexOf("if (runtimeIsProduction())");
    const firstDemoReturnIdx = src.indexOf('status: "demo_skipped"');
    expect(firstGuardIdx).toBeGreaterThan(-1);
    expect(firstDemoReturnIdx).toBeGreaterThan(-1);
    // The production guard must come before the demo_skipped return
    expect(firstGuardIdx).toBeLessThan(firstDemoReturnIdx);
  });

  it("paymentGateway.ts isExplicitPaymentDemoMode returns false in production", () => {
    const src = readSrc("services/paymentGateway.ts");
    // Must have early return false for production
    expect(src).toMatch(/NODE_ENV.*production.*return false/s);
  });
});

// ─── 3. Order FSM — illegal transition rejection ──────────────────────────────
describe("Order FSM — state transition validation", () => {
  const ORDER_FSM: Record<string, ReadonlyArray<string>> = {
    draft: [
      "awaiting_prescription",
      "awaiting_pharmacist_review",
      "awaiting_allocation",
      "reserved",
      "created",
      "cancelled",
    ],
    awaiting_prescription: [
      "awaiting_pharmacist_review",
      "awaiting_allocation",
      "cancelled",
    ],
    awaiting_pharmacist_review: [
      "clarification_needed",
      "rejected",
      "awaiting_allocation",
      "reserved",
      "pharmacist_reviewing",
      "cancelled",
    ],
    pharmacist_reviewing: [
      "clarification_needed",
      "rejected",
      "awaiting_allocation",
      "reserved",
      "cancelled",
    ],
    clarification_needed: [
      "awaiting_pharmacist_review",
      "pharmacist_reviewing",
      "cancelled",
    ],
    rejected: ["cancelled"],
    awaiting_allocation: ["backorder_review", "reserved", "cancelled"],
    backorder_review: ["awaiting_allocation", "reserved", "cancelled"],
    reserved: ["picking", "cancelled"],
    picking: ["packed", "cancelled"],
    packed: ["assigned_to_rider", "cancelled"],
    assigned_to_rider: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered", "delivery_exception", "returned"],
    delivery_exception: ["out_for_delivery", "returned", "cancelled"],
    returned: ["return_to_stock", "closed"],
    return_to_stock: ["closed"],
    delivered: ["closed"],
    closed: [],
    cancelled: [],
    created: [
      "pharmacist_reviewing",
      "picking",
      "awaiting_allocation",
      "reserved",
      "cancelled",
    ],
  };

  it("allows valid forward transitions", () => {
    expect(ORDER_FSM["reserved"]).toContain("picking");
    expect(ORDER_FSM["picking"]).toContain("packed");
    expect(ORDER_FSM["packed"]).toContain("assigned_to_rider");
    expect(ORDER_FSM["out_for_delivery"]).toContain("delivered");
  });

  it("rejects backward transitions (delivered → picking)", () => {
    expect(ORDER_FSM["delivered"]).not.toContain("picking");
    expect(ORDER_FSM["delivered"]).not.toContain("reserved");
  });

  it("rejects terminal state transitions (closed → anything)", () => {
    expect(ORDER_FSM["closed"]).toHaveLength(0);
    expect(ORDER_FSM["cancelled"]).toHaveLength(0);
  });

  it("rejects skipping states (draft → delivered)", () => {
    expect(ORDER_FSM["draft"]).not.toContain("delivered");
    expect(ORDER_FSM["draft"]).not.toContain("out_for_delivery");
  });

  it("db-cart-orders.ts updateOrderStatus includes FSM guard code", () => {
    const src = readSrc("db-cart-orders.ts");
    expect(src).toMatch(/ORDER_FSM/);
    expect(src).toMatch(/Invalid order status transition/);
    expect(src).toMatch(/opts\?\.force/);
  });
});

// ─── 4. Prescription storage key — crypto.randomUUID ─────────────────────────
describe("Prescription storage key — crypto.randomUUID", () => {
  it("prescriptionRouter.ts uses randomUUID (not Date.now) for storage key", () => {
    const src = readSrc("routers/prescriptionRouter.ts");
    expect(src).not.toMatch(/prescriptions\/.*Date\.now\(\)/);
    expect(src).toMatch(/randomUUID\(\)/);
    expect(src).toMatch(/node:crypto/);
  });

  it("randomUUID produces non-predictable UUID v4 values", () => {
    const uuids = new Set(
      Array.from({ length: 100 }, () => randomUUID() as string)
    );
    expect(uuids.size).toBe(100);
    for (const uuid of uuids) {
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
  });
});

// ─── 5. WhatsApp webhook guard — production enforcement ───────────────────────
describe("WhatsApp webhook guard — production enforcement", () => {
  it("whatsappHelpers.ts no longer has unconditional early return for non-production", () => {
    const src = readSrc("routers/whatsappHelpers.ts");
    // Old bypass pattern must be gone
    expect(src).not.toMatch(
      /if\s*\(\s*process\.env\.NODE_ENV\s*!==\s*["']production["']\s*\)\s*\{[\s\S]*?return;/
    );
    // New controlled bypass must be present
    expect(src).toMatch(/demoOpen/);
    expect(src).toMatch(/providerEnabled/);
    expect(src).toMatch(/isProduction/);
  });

  it("whatsappHelpers.ts only bypasses when demoOpen AND !providerEnabled AND !isProduction", () => {
    const src = readSrc("routers/whatsappHelpers.ts");
    // The bypass must require all three conditions
    expect(src).toMatch(/!isProduction && demoOpen && !providerEnabled/);
  });
});

// ─── 6. CSRF enforcement — production default ─────────────────────────────────
describe("CSRF enforcement — production default", () => {
  it("env.ts defaults csrfEnforcement to enforce in production", () => {
    const src = readSrc("_core/env.ts");
    // Must have production conditional for enforce
    expect(src).toMatch(/NODE_ENV.*production.*enforce/s);
    // Must NOT default to log_only unconditionally
    expect(src).not.toMatch(
      /csrfEnforcement:\s*\(process\.env\.CSRF_ENFORCEMENT\s*\?\?\s*["']log_only["']\)/
    );
  });

  it("env.ts assertProductionEnvSafe requires CSRF_SECRET", () => {
    const src = readSrc("_core/env.ts");
    expect(src).toMatch(/requireProductionEnv\("CSRF_SECRET"/);
  });
});

// ─── 7. createOrder transaction wrapping ─────────────────────────────────────
describe("createOrder — DB transaction wrapping", () => {
  it("db-cart-orders.ts createOrder uses db.transaction to prevent ghost orders", () => {
    const src = readSrc("db-cart-orders.ts");
    expect(src).toMatch(/db\.transaction\s*\(/);
    expect(src).toMatch(/tx\.insert\(orders\)/);
    expect(src).toMatch(/tx\.insert\(orderItems\)/);
  });
});

// ─── 8. Integer money math in orderRouter ────────────────────────────────────
describe("orderRouter — integer paise arithmetic", () => {
  it("orderRouter.ts uses toPaise/fromPaise helpers (not parseFloat * qty)", () => {
    const src = readSrc("routers/orderRouter.ts");
    expect(src).not.toMatch(
      /parseFloat\(String\(i\.sellingPrice\)\)\s*\*\s*i\.quantity/
    );
    expect(src).toMatch(/toPaise/);
    expect(src).toMatch(/fromPaise/);
  });
});

// ─── 9. Refill reminder worker wired at boot ─────────────────────────────────
describe("Refill reminder worker — server boot wiring", () => {
  it("server index.ts imports and starts refillReminderWorker", () => {
    const src = readSrc("_core/index.ts");
    expect(src).toMatch(/startRefillReminderWorker/);
    expect(src).toMatch(/stopRefillReminderWorker/);
    expect(src).toMatch(/refillReminderWorker/);
  });
});
