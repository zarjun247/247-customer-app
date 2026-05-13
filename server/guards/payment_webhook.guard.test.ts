import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

describe("payment webhook wiring guard", () => {
  it("payment webhook lifecycle contains idempotencyKeyFor and settleProviderRefundExactlyOnce", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "services", "paymentWebhookLifecycle.ts"),
      "utf8"
    );
    expect(src.includes("idempotencyKeyFor")).toBe(true);
    expect(src.includes("recordWebhookEvent")).toBe(true);
    expect(src.includes("settleProviderRefundExactlyOnce")).toBe(true);
  });
});
