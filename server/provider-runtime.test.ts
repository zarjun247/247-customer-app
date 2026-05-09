import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erpConnector, labelPrinterConnector, smsConnector } from "./connectors";
import { verifyGatewayPaymentSignature } from "./services/paymentGateway";
import {
  assertProviderOperationNotFakeSuccess,
  classifyProviderError,
  getProviderOperationStatus,
  markProviderFailure,
  markProviderNotConfigured,
  markProviderSuccess,
  recordProviderAttempt,
  resetProviderRuntimeForTests,
  sanitizeProviderText,
  shouldRetryProviderOperation,
} from "./services/providerRuntime";

const ORIGINAL_ENV = { ...process.env };

function setProdEnv(overrides: NodeJS.ProcessEnv = {}) {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: "production",
    PROVIDER_DEMO_MODE: undefined,
    DEMO_MODE: undefined,
    SMS_PROVIDER_API_KEY: undefined,
    WHATSAPP_PHONE_NUMBER_ID: undefined,
    WHATSAPP_API_TOKEN: undefined,
    PRINTER_HOST: undefined,
    ERP_BASE_URL: undefined,
    ERP_API_KEY: undefined,
    RAZORPAY_KEY_SECRET: undefined,
    ...overrides,
  };
}

describe("provider runtime attempt ledger", () => {
  beforeEach(() => {
    resetProviderRuntimeForTests();
    setProdEnv();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    resetProviderRuntimeForTests();
  });

  it("prevents unconfigured or disabled providers from reporting production success", () => {
    expect(() => assertProviderOperationNotFakeSuccess({ status: "sent", providerConfigured: false, env: process.env })).toThrow(/unconfigured/);
    expect(() => assertProviderOperationNotFakeSuccess({ status: "printed", providerEnabled: false, env: process.env })).toThrow(/disabled/);
    expect(() => assertProviderOperationNotFakeSuccess({ status: "verified", providerConfigured: true, env: process.env })).toThrow(/requires providerRef/);
  });

  it("records sanitized attempts and idempotency blocks duplicate side-effect attempts", async () => {
    const first = await recordProviderAttempt({
      providerType: "sms",
      operationType: "send",
      entityType: "otp_login",
      entityRef: "user-1",
      idempotencyKey: "otp:user-1:login",
      status: "failed",
      error: "OTP 123456 failed with api_key=secret-token and prescription payload",
      requestPayload: { otp: "123456", token: "secret-token", prescriptionText: "patient medicine" },
    });
    const second = await recordProviderAttempt({
      providerType: "sms",
      operationType: "send",
      entityType: "otp_login",
      entityRef: "user-1",
      idempotencyKey: "otp:user-1:login",
      status: "failed",
      error: "timeout 503",
    });
    const stored = await getProviderOperationStatus("otp:user-1:login");

    expect(second.id).toBe(first.id);
    expect(second.attemptCount).toBe(2);
    expect(stored?.lastErrorMessage).not.toContain("123456");
    expect(stored?.lastErrorMessage).not.toContain("secret-token");
    expect(stored?.lastErrorMessage).not.toContain("patient medicine");
    expect(stored?.requestHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("classifies retryable and non-retryable provider failures", () => {
    expect(classifyProviderError("network timeout 503")).toMatchObject({ retryable: true, code: "provider_retryable" });
    expect(classifyProviderError("invalid signature")).toMatchObject({ retryable: false, code: "provider_non_retryable" });
    expect(shouldRetryProviderOperation({ status: "failed", attemptCount: 1, error: "timeout 503" })).toBe(true);
    expect(shouldRetryProviderOperation({ status: "failed", attemptCount: 3, error: "timeout 503" })).toBe(false);
  });

  it("does not log or store raw token/API key/OTP/prescription payloads", async () => {
    const sanitized = sanitizeProviderText("Bearer token abc OTP 123456 prescription insulin");
    expect(sanitized).not.toContain("123456");
    expect(sanitized).not.toMatch(/Bearer token/i);
    expect(sanitized).not.toContain("insulin");
    await markProviderFailure({ providerType: "ocr", operationType: "parse", entityType: "prescription", entityRef: "rx-1", idempotencyKey: "ocr:rx-1", error: "prescription insulin token abc 123456" });
    expect((await getProviderOperationStatus("ocr:rx-1"))?.lastErrorMessage).not.toContain("insulin");
  });

  it("records explicit not_configured and success states only with proof", async () => {
    await markProviderNotConfigured({ providerType: "ocr", operationType: "parse", entityType: "invoice", entityRef: "inv-1", idempotencyKey: "ocr:inv-1" });
    await markProviderSuccess({ providerType: "storage", operationType: "upload", entityType: "file", entityRef: "file-1", idempotencyKey: "storage:file-1", status: "completed", providerRef: "s3://bucket/key" });
    expect((await getProviderOperationStatus("ocr:inv-1"))?.status).toBe("not_configured");
    expect((await getProviderOperationStatus("storage:file-1"))?.status).toBe("completed");
  });

  it("records invalid Razorpay signature as failed, never verified", async () => {
    process.env.RAZORPAY_KEY_SECRET = "secret";
    const valid = crypto.createHmac("sha256", "secret").update("order|pay").digest("hex");
    expect(valid).not.toBe("bad");
    const result = await verifyGatewayPaymentSignature({ gatewayOrderId: "order", gatewayPaymentId: "pay", signature: "bad" });
    expect(result).toMatchObject({ verified: false, status: "failed" });
    expect((await getProviderOperationStatus("payment:verify:order:pay"))?.status).not.toBe("verified");
  });

  it("unconfigured WhatsApp/SMS providers are not sent", async () => {
    await expect(smsConnector.sendSmsDetailed({ phone: "+919876543210", message: "OTP 123456" })).resolves.toMatchObject({ ok: false, status: "provider_unconfigured" });
    await expect(smsConnector.sendWhatsAppDetailed({ phone: "+919876543210", templateName: "otp", variables: ["123456"] })).resolves.toMatchObject({ ok: false, status: "provider_unconfigured" });
    expect((await getProviderOperationStatus("sms:send:phone:+919876543210"))?.status).toBe("not_configured");
    expect((await getProviderOperationStatus("whatsapp:send:phone:+919876543210"))?.status).toBe("not_configured");
  });

  it("unconfigured printer is not printed", async () => {
    const result = await labelPrinterConnector.printBatchLabelDetailed({ productName: "Paracetamol", batchNumber: "B001", expiryDate: "2027-01", mrp: "12.00" });
    expect(result.status).toBe("provider_unconfigured");
    expect(result.status).not.toBe("printed");
    expect((await getProviderOperationStatus("printer:print:batch:B001"))?.status).toBe("not_configured");
  });

  it("unconfigured Tally/ERP is not synced or imported", async () => {
    const result = await erpConnector.pushSalesOrder({ orderId: 101, storeId: 1, totalAmount: 250, items: [{ productName: "ORS", qty: 1, unitPrice: 250 }] });
    expect(result).toMatchObject({ ok: false, status: "provider_unconfigured", erpRef: null });
    expect(result.status).not.toBe("synced");
    expect((await getProviderOperationStatus("tally:sync:sales_order:101"))?.status).toBe("not_configured");
  });
});
