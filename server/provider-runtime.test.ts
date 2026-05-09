import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertProviderOperationNotFakeSuccess,
  classifyProviderError,
  getProviderAttemptsForTests,
  getProviderOperationStatus,
  markProviderDisabled,
  markProviderFailure,
  markProviderManualRequired,
  markProviderNotConfigured,
  markProviderSuccess,
  recordProviderAttempt,
  resetProviderAttemptsForTests,
  sanitizeProviderPayload,
  shouldRetryProviderOperation,
} from "./services/providerRuntime";

const ORIGINAL_ENV = { ...process.env };

describe("provider runtime attempt lifecycle", () => {
  beforeEach(() => {
    resetProviderAttemptsForTests();
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "production",
      DATABASE_URL: undefined,
    };
  });

  afterEach(() => {
    resetProviderAttemptsForTests();
    process.env = { ...ORIGINAL_ENV };
  });

  it("rejects unconfigured or disabled fake success in production", async () => {
    expect(() =>
      assertProviderOperationNotFakeSuccess({
        providerType: "whatsapp",
        operationType: "send",
        status: "sent",
        configured: false,
        enabled: true,
        proof: { messageId: "wamid.real" },
      })
    ).toThrow(/not configured/);

    expect(() =>
      assertProviderOperationNotFakeSuccess({
        providerType: "printer",
        operationType: "print",
        status: "printed",
        configured: true,
        enabled: false,
        proof: { socketWriteCompleted: true },
      })
    ).toThrow(/disabled/);

    await expect(
      markProviderNotConfigured({
        providerType: "sms",
        operationType: "send",
        entityType: "phone",
        entityRef: "hash",
      })
    ).resolves.toMatchObject({ status: "not_configured" });

    await expect(
      markProviderDisabled({
        providerType: "otp",
        operationType: "send",
        entityType: "phone",
        entityRef: "hash",
      })
    ).resolves.toMatchObject({ status: "disabled" });
  });

  it("requires proof for production success states", async () => {
    await expect(
      markProviderSuccess({
        providerType: "ocr",
        operationType: "parse",
        entityType: "ingestion",
        entityRef: "1",
        status: "completed",
      })
    ).rejects.toThrow(/without provider confirmation/);

    await expect(
      markProviderSuccess({
        providerType: "ocr",
        operationType: "parse",
        entityType: "ingestion",
        entityRef: "1",
        status: "completed",
        providerRef: "ocr-job-1",
      })
    ).resolves.toMatchObject({ status: "completed", providerRef: "ocr-job-1" });
  });

  it("sanitizes provider payloads and errors before hashing/storing", async () => {
    const sanitized = sanitizeProviderPayload({
      authorization: "Bearer secret-token",
      razorpaySignature: "raw-signature",
      otpCode: "123456",
      prescriptionImageBase64: "a".repeat(300),
      safeStatus: "failed",
    });

    expect(JSON.stringify(sanitized)).not.toContain("secret-token");
    expect(JSON.stringify(sanitized)).not.toContain("raw-signature");
    expect(JSON.stringify(sanitized)).not.toContain("123456");
    expect(JSON.stringify(sanitized)).toContain("safeStatus");

    const attempt = await markProviderFailure({
      providerType: "payment",
      operationType: "verify",
      entityType: "gateway_order",
      entityRef: "order_1",
      requestPayload: sanitized,
      lastErrorMessage: "signature raw-signature mismatch with secret token",
      retryable: false,
    });

    expect(attempt.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(attempt.lastErrorMessage).not.toContain("Bearer");
  });

  it("deduplicates attempts by idempotency key", async () => {
    const first = await recordProviderAttempt({
      providerType: "storage",
      operationType: "upload",
      entityType: "invoice",
      entityRef: "INV-1",
      idempotencyKey: "storage:upload:INV-1",
    });
    const second = await recordProviderAttempt({
      providerType: "storage",
      operationType: "upload",
      entityType: "invoice",
      entityRef: "INV-1",
      idempotencyKey: "storage:upload:INV-1",
      status: "queued",
    });

    expect(second.id).toBe(first.id);
    expect(getProviderAttemptsForTests()).toHaveLength(1);
    await expect(
      getProviderOperationStatus({ idempotencyKey: "storage:upload:INV-1" })
    ).resolves.toBe("queued");
  });

  it("classifies retryable and non-retryable provider errors", () => {
    const retryable = classifyProviderError(
      new Error("HTTP 503 temporary provider timeout")
    );
    expect(retryable).toMatchObject({
      retryable: true,
      errorClass: "retryable",
    });
    expect(shouldRetryProviderOperation(retryable, 1, 3)).toBe(true);
    expect(shouldRetryProviderOperation(retryable, 3, 3)).toBe(false);

    const config = classifyProviderError("missing API key");
    expect(config).toMatchObject({
      retryable: false,
      errorClass: "configuration",
    });
  });

  it("models provider-specific fail-closed states without fake success", async () => {
    await expect(
      markProviderNotConfigured({
        providerType: "whatsapp",
        operationType: "send",
        entityType: "order",
        entityRef: "1",
      })
    ).resolves.toMatchObject({ status: "not_configured" });
    await expect(
      markProviderNotConfigured({
        providerType: "sms",
        operationType: "send",
        entityType: "order",
        entityRef: "1",
      })
    ).resolves.toMatchObject({ status: "not_configured" });
    await expect(
      markProviderNotConfigured({
        providerType: "otp",
        operationType: "verify",
        entityType: "phone",
        entityRef: "hash",
      })
    ).resolves.toMatchObject({ status: "not_configured" });
    await expect(
      markProviderManualRequired({
        providerType: "printer",
        operationType: "print",
        entityType: "order",
        entityRef: "1",
      })
    ).resolves.toMatchObject({ status: "manual_required" });
    await expect(
      markProviderManualRequired({
        providerType: "ocr",
        operationType: "parse",
        entityType: "ingestion",
        entityRef: "1",
      })
    ).resolves.toMatchObject({ status: "manual_required" });
    await expect(
      markProviderManualRequired({
        providerType: "tally",
        operationType: "sync",
        entityType: "export",
        entityRef: "1",
      })
    ).resolves.toMatchObject({ status: "manual_required" });
  });
});
