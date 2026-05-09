import { describe, expect, it } from "vitest";
import { buildStructuredLog, createRequestId, redactForObservability, redactText, serializeSafe } from "./services/observability";

describe("observability redaction", () => {
  it("creates safe request IDs", () => {
    expect(createRequestId("req-safe_1234")).toBe("req-safe_1234");
    expect(createRequestId("bad bearer token")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("redacts OTPs, bearer tokens, cookies, payment signatures, DB URLs, and prescription base64", () => {
    const raw = `otp: 123456 Authorization: Bearer sk_live_secret app_session_id=abc123 DATABASE_URL=mysql://user:pass@host/db razorpay_signature=verySecretPaymentSignature data:image/png;base64,${"A".repeat(120)} patient@example.com +919876543210`;
    const redacted = redactText(raw);
    expect(redacted).not.toContain("123456");
    expect(redacted).not.toContain("sk_live_secret");
    expect(redacted).not.toContain("abc123");
    expect(redacted).not.toContain("mysql://user:pass@host/db");
    expect(redacted).not.toContain("verySecretPaymentSignature");
    expect(redacted).not.toContain("A".repeat(80));
    expect(redacted).not.toContain("patient@example.com");
    expect(redacted).not.toContain("+919876543210");
  });

  it("redacts sensitive object keys recursively", () => {
    const safe = redactForObservability({
      user: { email: "patient@example.com", phone: "+919876543210" },
      password: "secret-password",
      headers: { cookie: "app_session_id=abc", authorization: "Bearer token-value" },
      razorpaySignature: "payment-signature",
      prescriptionImage: `data:image/jpeg;base64,${"B".repeat(100)}`,
      medicalNotes: "diagnosis details",
      nested: [{ whatsappToken: "wa-secret" }],
    });
    const serialized = JSON.stringify(safe);
    expect(serialized).not.toContain("secret-password");
    expect(serialized).not.toContain("token-value");
    expect(serialized).not.toContain("payment-signature");
    expect(serialized).not.toContain("diagnosis details");
    expect(serialized).not.toContain("wa-secret");
    expect(serialized).not.toContain("patient@example.com");
    expect(serialized).not.toContain("+919876543210");
  });

  it("builds structured logs without leaking unsafe data", () => {
    const entry = buildStructuredLog({
      level: "info",
      event: "http.request",
      requestId: "req-12345678",
      data: { token: "secret-token", prescriptionBlob: "data:image/png;base64,AAAA" },
    });
    const serialized = serializeSafe(entry);
    expect(serialized).toContain("http.request");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("data:image/png;base64");
  });
});
