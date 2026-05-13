import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

describe("sealed path assertions", () => {
  it("refund settlement uses transactional append (no best-effort)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "services", "commercialTruthSeams.ts"),
      "utf8"
    );
    const fnMatch = src.match(
      /function\s+settleProviderRefundExactlyOnce\s*\([\s\S]*?\)\s*\{([\s\S]*?)\n\}/
    );
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch ? fnMatch[1] : src;
    // ensure transactional helper used in the function body
    expect(fnBody.includes("appendCommercialEventWithDb")).toBe(true);
    // ensure best-effort is not used inside the refund settlement function body
    expect(fnBody.includes("appendCommercialEventBestEffort")).toBe(false);
  });

  it("payment confirm uses transactional append (no best-effort)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "payment.ts"),
      "utf8"
    );
    const fnMatch = src.match(
      /export async function confirmPaymentRecord\s*\([\s\S]*?\)\s*\{([\s\S]*?)\n\}/
    );
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch ? fnMatch[1] : src;
    expect(fnBody.includes("appendCommercialEventWithDb")).toBe(true);
    expect(fnBody.includes("appendCommercialEventBestEffort")).toBe(false);
  });
});
