import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertProviderSuccess,
  assertRealProviderSuccess,
  buildProviderRuntimeHealthSummary,
  classifyProviderResult,
  executeProviderOperation,
  getProviderOperationPolicy,
  normalizeProviderResult,
  redactProviderPayload,
} from "./services/providerRuntime";
import { clearProviderRuntimeMemoryForTests, listProviderDeadLetters } from "./services/providerDeadLetter";
import { normalizeProviderResult as normalizeNotificationProviderResult } from "./services/notificationService";
import { verifyGatewayPaymentSignature } from "./services/paymentGateway";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  clearProviderRuntimeMemoryForTests();
  process.env = { ...ORIGINAL_ENV, NODE_ENV: "production", RAZORPAY_KEY_SECRET: undefined };
});

afterEach(() => {
  clearProviderRuntimeMemoryForTests();
  process.env = { ...ORIGINAL_ENV };
});

describe("provider runtime enforcement", () => {
  it("provider_unconfigured is not success", () => {
    const result = classifyProviderResult(normalizeProviderResult({ status: "provider_unconfigured", ok: false }, { provider: "sms", operation: "sms.send", idempotencyKey: "sms-1" }));
    expect(result.status).toBe("dead_letter");
    expect(result.realSuccess).toBe(false);
    expect(() => assertProviderSuccess(result)).toThrow(/did not succeed/);
  });

  it("demo_skipped is not success", () => {
    const result = normalizeProviderResult({ status: "skipped_demo", ok: false, demo: true }, { provider: "sms", operation: "sms.send", idempotencyKey: "sms-demo" });
    expect(result.status).toBe("demo_skipped");
    expect(result.ok).toBe(false);
    expect(() => assertRealProviderSuccess(result)).toThrow(/not a real provider success/);
  });

  it("preview_only printer result is not printed success", () => {
    const result = normalizeProviderResult({ status: "preview_only", ok: true, zpl: "^XA^XZ" }, { provider: "printer_label_printing", operation: "printer.printBatchLabel", idempotencyKey: "print-preview" });
    expect(result.status).toBe("preview_only");
    expect(result.realSuccess).toBe(false);
    expect(() => assertRealProviderSuccess(result)).toThrow();
  });

  it("successful real provider result passes assertion", () => {
    const result = normalizeProviderResult({ status: "sent", ok: true, providerMessageId: "msg_1" }, { provider: "whatsapp", operation: "whatsapp.send", idempotencyKey: "wa-1" });
    expect(assertRealProviderSuccess(result).status).toBe("success");
  });

  it("failed provider result becomes retry according to policy", () => {
    const result = classifyProviderResult(normalizeProviderResult({ status: "failed", ok: false, failureType: "network" }, { provider: "sms", operation: "sms.send", idempotencyKey: "sms-retry", attemptNo: 1 }));
    expect(result.status).toBe("retry_scheduled");
    expect(result.retryable).toBe(true);
  });

  it("retryable failure schedules retry metadata", async () => {
    const result = await executeProviderOperation({
      provider: "sms",
      operation: "sms.send",
      idempotencyKey: "sms-runtime-retry",
      call: async () => ({ status: "failed", ok: false, failureType: "timeout", reason: "socket timeout" }),
    });
    expect(result.status).toBe("retry_scheduled");
    expect(result.nextRetryAt).toBeInstanceOf(Date);
    expect(result.retryable).toBe(true);
  });

  it("non-retryable failure becomes dead-letter", () => {
    const result = classifyProviderResult(normalizeProviderResult({ status: "failed", ok: false, failureType: "provider_4xx", reason: "bad template" }, { provider: "whatsapp", operation: "whatsapp.send", idempotencyKey: "wa-400" }));
    expect(result.status).toBe("dead_letter");
    expect(result.deadLetterReason).toBe("bad template");
  });

  it("max retry exceeded becomes dead-letter", () => {
    const policy = getProviderOperationPolicy("sms.send");
    const result = classifyProviderResult(normalizeProviderResult({ status: "failed", ok: false, failureType: "network" }, { provider: "sms", operation: "sms.send", idempotencyKey: "sms-exhaust", attemptNo: policy.maxRetryCount + 1 }), policy);
    expect(result.status).toBe("dead_letter");
  });

  it("provider payload redaction removes tokens/secrets/signatures", () => {
    const redacted = redactProviderPayload({
      Authorization: "Bearer token",
      nested: { apiKey: "abc", signature: "sig", safe: "value" },
      headers: { authkey: "msg91" },
    });
    expect(redacted).toMatchObject({
      Authorization: "[REDACTED]",
      nested: { apiKey: "[REDACTED]", signature: "[REDACTED]", safe: "value" },
      headers: { authkey: "[REDACTED]" },
    });
    expect(JSON.stringify(redacted)).not.toContain("Bearer token");
    expect(JSON.stringify(redacted)).not.toContain("msg91");
  });

  it("notification service does not mark provider_unconfigured as sent", () => {
    const result = normalizeNotificationProviderResult({ status: "provider_unconfigured", ok: false, error: "missing provider" });
    expect(result.status).toBe("provider_unconfigured");
    expect(result.status).not.toBe("sent");
  });

  it("provider health summary does not expose secrets", () => {
    process.env.SMS_PROVIDER_API_KEY = "secret-sms-key";
    process.env.WHATSAPP_API_TOKEN = "secret-wa-token";
    const summary = buildProviderRuntimeHealthSummary(process.env);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("secret-sms-key");
    expect(serialized).not.toContain("secret-wa-token");
    expect(serialized).toContain("missingEnvVarCount");
  });

  it("payment verification behavior is not weakened", async () => {
    process.env.NODE_ENV = "production";
    process.env.PAYMENT_DEMO_MODE = undefined;
    process.env.LOCAL_DEMO_MODE = undefined;
    process.env.RAZORPAY_KEY_SECRET = undefined;
    await expect(verifyGatewayPaymentSignature({ gatewayOrderId: "order_1", gatewayPaymentId: "pay_1", signature: "sig" })).resolves.toMatchObject({
      verified: false,
      status: "provider_unconfigured",
    });
  });

  it("no provider operation records fake synced/imported/printed/sent success", async () => {
    const preview = await executeProviderOperation({
      provider: "printer_label_printing",
      operation: "printer.printDispatchLabel",
      idempotencyKey: "print-fake",
      call: async () => ({ status: "preview_only", ok: true }),
    });
    const demo = await executeProviderOperation({
      provider: "tally_erp_export",
      operation: "tally.export",
      idempotencyKey: "tally-demo",
      call: async () => ({ status: "demo_skipped", ok: false }),
    });
    const unconfigured = await executeProviderOperation({
      provider: "whatsapp",
      operation: "whatsapp.send",
      idempotencyKey: "wa-unconfigured",
      call: async () => ({ status: "provider_unconfigured", ok: false }),
    });
    expect([preview.status, demo.status, unconfigured.status]).not.toContain("success");
    const deadLetters = await listProviderDeadLetters();
    expect(deadLetters.some(row => row.idempotencyKey === "wa-unconfigured")).toBe(true);
  });
});
