import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

describe("sealed path assertions", () => {
  it("refund settlement uses transactional append (no best-effort)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "services", "commercialTruthSeams.ts"), "utf8");
    const fn = src.match(/settleProviderRefundExactlyOnce\s*\(/);
    expect(fn).toBeTruthy();
    // ensure transactional helper used
    expect(src.includes("appendCommercialEventWithDb")).toBe(true);
    // ensure best-effort not used in refund settle
    expect(src.includes("appendCommercialEventBestEffort") && src.includes("refund_completed")).toBe(false);
  });

  it("payment confirm uses transactional append (no best-effort)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "payment.ts"), "utf8");
    expect(src.includes("appendCommercialEventWithDb")).toBe(true);
    expect(src.includes("appendCommercialEventBestEffort") && src.includes("payment_verified")).toBe(false);
  });
});
