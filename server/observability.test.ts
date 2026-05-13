import { describe, expect, it, vi } from "vitest";
import {
  buildRequestLogEntry,
  requestLoggerMiddleware,
} from "./middleware/requestLogger";
import {
  createRequestId,
  redactObject,
  redactString,
  safeError,
  serializeSafeLog,
} from "./services/observability";

describe("production observability redaction", () => {
  it("redacts tokens, cookies, OTPs, passwords, payment signatures, DB URLs, AWS keys, and WhatsApp tokens", () => {
    const redacted = redactObject({
      authorization: "Bearer secret-token-123",
      cookie: "app_session_id=secret-cookie",
      otpCode: "123456",
      password: "p@ssw0rd",
      razorpay_signature: "pay_secret_signature",
      DATABASE_URL: "mysql://user:pass@example.com:3306/prod",
      awsAccessKeyId: "AKIAABCDEFGHIJKLMNOP",
      whatsappAccessToken: "whatsapp-secret-token",
      nested: {
        apiKey: "key",
        email: "patient@example.com",
        phone: "+919876543210",
      },
    }) as Record<string, unknown>;

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("secret-token-123");
    expect(serialized).not.toContain("secret-cookie");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("p@ssw0rd");
    expect(serialized).not.toContain("pay_secret_signature");
    expect(serialized).not.toContain("mysql://user:pass");
    expect(serialized).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(serialized).not.toContain("whatsapp-secret-token");
    expect(serialized).not.toContain("patient@example.com");
    expect(serialized).not.toContain("+919876543210");
  });

  it("redacts prescription base64/blob-like payloads and medical notes", () => {
    const redacted = redactObject({
      prescriptionImage: "data:image/png;base64," + "a".repeat(240),
      prescriptionBlob: Buffer.from("raw prescription"),
      medicalNotes: "Patient has a private diagnosis",
    });
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("data:image/png;base64");
    expect(serialized).not.toContain("raw prescription");
    expect(serialized).not.toContain("private diagnosis");
  });

  it("serializes errors safely without leaking secret-looking values", () => {
    const error = safeError(
      new Error(
        "failed token=abc123 database_url=mysql://u:p@host/db phone +919999999999"
      )
    );
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("mysql://");
    expect(serialized).not.toContain("+919999999999");
  });

  it("accepts safe inbound request IDs and generates unsafe ones", () => {
    expect(createRequestId("request_12345678")).toBe("request_12345678");
    expect(createRequestId("bad\nrequest")).not.toContain("\n");
  });

  it("request logger does not log raw body", () => {
    const req = {
      method: "POST",
      path: "/api/prescriptions",
      requestId: "request_12345678",
      body: {
        password: "secret",
        prescriptionImage: "data:image/png;base64," + "a".repeat(200),
      },
    } as unknown;
    const res = {
      statusCode: 200,
      locals: { requestId: "request_12345678" },
    } as unknown;
    const entry = buildRequestLogEntry(req, res, process.hrtime.bigint());
    const serialized = serializeSafeLog(entry);
    expect(serialized).toContain("/api/prescriptions");
    expect(serialized).not.toContain("body");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("base64");
  });

  it("request logger writes a safe serialized line", () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const listeners: Record<string, () => void> = {};
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const req = {
      method: "GET",
      path: "/healthz",
      header: () => undefined,
    } as any;
    const res = {
      locals: {},
      statusCode: 200,
      setHeader: vi.fn(),
      on: (event: string, cb: () => void) => {
        listeners[event] = cb;
      },
    } as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const next = vi.fn();
    requestLoggerMiddleware(logger)(req, res, next);
    listeners.finish();
    expect(next).toHaveBeenCalled();
    expect(logger.info.mock.calls[0][0]).not.toContain("cookie");
  });

  it("redacts secret-looking strings directly", () => {
    expect(
      redactString("Bearer abc.def.ghi mysql://u:p@host/db")
    ).not.toContain("abc.def.ghi");
  });
});
