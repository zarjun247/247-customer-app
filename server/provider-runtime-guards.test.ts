import { describe, expect, it } from "vitest";
import { scanVirtualFiles } from "../scripts/ci-governance-guards.mjs";
import { assertProviderOperationNotFakeSuccess } from "./services/providerRuntime";
import { verifyGatewayPaymentSignature } from "./services/paymentGateway";

const ORIGINAL_ENV = { ...process.env };

describe("provider runtime guardrails", () => {
  it("blocks provider-specific fake success examples", () => {
    const fakeSuccesses = [
      ["whatsapp", "send", "sent"],
      ["sms", "send", "sent"],
      ["otp", "verify", "verified"],
      ["printer", "print", "printed"],
      ["ocr", "parse", "completed"],
      ["tally", "sync", "synced"],
      ["storage", "upload", "completed"],
      ["maps", "healthcheck", "completed"],
    ] as const;

    for (const [providerType, operationType, status] of fakeSuccesses) {
      expect(() =>
        assertProviderOperationNotFakeSuccess({
          providerType,
          operationType,
          status,
          configured: false,
          enabled: true,
          runtime: "production",
        })
      ).toThrow();
    }
  });

  it("allows explicit fail-closed states", () => {
    for (const status of [
      "not_configured",
      "disabled",
      "manual_required",
      "queued",
      "pending",
      "failed",
      "dead_letter",
    ] as const) {
      expect(() =>
        assertProviderOperationNotFakeSuccess({
          providerType: "whatsapp",
          operationType: "send",
          status,
          configured: false,
          enabled: false,
          runtime: "production",
        })
      ).not.toThrow();
    }
  });

  it("does not verify invalid Razorpay payment signatures", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      RAZORPAY_KEY_SECRET: "real-secret",
      DATABASE_URL: undefined,
    };
    await expect(
      verifyGatewayPaymentSignature({
        gatewayOrderId: "order_123",
        gatewayPaymentId: "pay_123",
        signature: "invalid",
      })
    ).resolves.toMatchObject({ verified: false, status: "failed" });
    process.env = { ...ORIGINAL_ENV };
  });

  it("governance scan catches fake provider success and allows fail-closed states", () => {
    const badFindings = scanVirtualFiles({
      "server/fake-provider.ts":
        "const result = { status: 'provider_unconfigured', sent: true };",
    });
    expect(
      badFindings.some(finding => finding.category === "provider-risk")
    ).toBe(true);

    const allowedFindings = scanVirtualFiles({
      "server/fail-closed-provider.ts":
        "const result = { status: 'not_configured', ok: false }; const retry = { status: 'dead_letter', ok: false };",
    });
    expect(allowedFindings).toHaveLength(0);
  });
});
