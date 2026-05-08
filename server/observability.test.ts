import { describe, expect, it, vi } from "vitest";
import { buildRequestLog, redactForLog, writeStructuredLog } from "./services/observability";

describe("observability structured logging", () => {
  it("redacts OTP, bearer tokens, cookies, payment signatures, API keys, and prescription payloads", () => {
    const redacted = redactForLog({
      otp: "123456",
      message: "otp: 654321 Bearer abc.def.ghi session=secret-cookie razorpay_signature=abcdef1234567890abcdef1234567890",
      nested: {
        apiKey: "secret-api-key",
        prescriptionImageBase64: "data:image/png;base64," + "a".repeat(120),
        medicalPayload: { diagnosis: "private" },
      },
    });

    const text = JSON.stringify(redacted);
    expect(text).toContain("[REDACTED]");
    expect(text).not.toContain("123456");
    expect(text).not.toContain("654321");
    expect(text).not.toContain("abc.def.ghi");
    expect(text).not.toContain("secret-cookie");
    expect(text).not.toContain("abcdef1234567890abcdef1234567890");
    expect(text).not.toContain("secret-api-key");
    expect(text).not.toContain("diagnosis");
  });

  it("emits stable request log fields without unsafe actor expansion", () => {
    const req = { requestId: "req-1", originalUrl: "/api/orders", url: "/api/orders", method: "GET", user: { id: 7, storeId: 3 } } as any;
    const res = { statusCode: 200 } as any;
    const log = buildRequestLog(req, res, Date.now() - 5);

    expect(log).toMatchObject({ requestId: "req-1", level: "info", event: "http.request.completed", route: "/api/orders", actorId: 7, storeId: 3, status: 200 });
    expect(typeof log.durationMs).toBe("number");
  });

  it("writes JSON logs after redaction", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    writeStructuredLog({ level: "info", event: "test", token: "secret-token", paymentSignature: "abcdef1234567890abcdef1234567890" });
    const line = String(spy.mock.calls[0]?.[0] ?? "");
    expect(line).toContain('"event":"test"');
    expect(line).toContain("[REDACTED]");
    expect(line).not.toContain("secret-token");
    spy.mockRestore();
  });
});
