import express from "express";
import http from "http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestLogger } from "./middleware/requestLogger";
import { createStructuredLog, getOrCreateRequestId, isSafeRequestId, redactForLog, redactString } from "./services/observability";

async function withLoggedApp<T>(incomingRequestId: string | undefined, fn: (response: Response, logs: unknown[]) => Promise<T>) {
  const app = express();
  app.use(requestLogger);
  app.get("/probe", (_req, res) => res.json({ ok: true }));
  const logs: unknown[] = [];
  const spy = vi.spyOn(console, "info").mockImplementation((entry: unknown) => { logs.push(entry); });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  try {
    const headers: Record<string, string> = incomingRequestId ? { "x-request-id": incomingRequestId } : {};
    const response = await fetch(`http://127.0.0.1:${address.port}/probe`, { headers });
    return await fn(response, logs);
  } finally {
    spy.mockRestore();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe("observability request IDs, redaction, and logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("generates request IDs and rejects unsafe incoming IDs", async () => {
    expect(isSafeRequestId("safe-ABC_123:trace.1")).toBe(true);
    expect(isSafeRequestId("unsafe/request/id")).toBe(false);
    const generated = getOrCreateRequestId("unsafe/request/id");
    expect(generated).not.toBe("unsafe/request/id");
    expect(isSafeRequestId(generated)).toBe(true);

    await withLoggedApp("unsafe/request/id", async response => {
      expect(response.headers.get("x-request-id")).not.toBe("unsafe/request/id");
    });
  });

  it("accepts safe incoming request IDs", async () => {
    await withLoggedApp("customer-api-req_123", async response => {
      expect(response.headers.get("x-request-id")).toBe("customer-api-req_123");
    });
  });

  it("redacts OTP/token/payment/prescription/blob data and masks contact fields", () => {
    const redacted = redactForLog({
      otp: "123456",
      authorization: "Bearer abc.def.ghi",
      password: "secret-password",
      paymentSignature: "pay_sig",
      razorpaySecret: "rzp_secret",
      whatsappToken: "wa_token",
      prescriptionImageBase64: "data:image/png;base64," + "a".repeat(160),
      notes: "Customer test@example.com phone +919876543210 token=visible-secret",
    });
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("abc.def.ghi");
    expect(serialized).not.toContain("secret-password");
    expect(serialized).not.toContain("pay_sig");
    expect(serialized).not.toContain("rzp_secret");
    expect(serialized).not.toContain("wa_token");
    expect(serialized).not.toContain("data:image/png;base64");
    expect(serialized).not.toContain("test@example.com");
    expect(serialized).not.toContain("+919876543210");
  });

  it("redacts sensitive strings without throwing", () => {
    expect(redactString("Bearer token123 cookie=abc otp:123456 prescriptionImage=data:image/png;base64,aaaa")).toContain("[REDACTED]");
  });

  it("emits safe structured request logger shape", async () => {
    await withLoggedApp(undefined, async (_response, logs) => {
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        event: "http_request",
        requestId: expect.any(String),
        method: "GET",
        path: "/probe",
        statusCode: 200,
        durationMs: expect.any(Number),
      });
      expect(JSON.stringify(logs[0])).not.toMatch(/cookie|Bearer|password|otp|prescription/i);
    });
  });

  it("creates only the documented structured fields", () => {
    const log = createStructuredLog({ requestId: "req", method: "POST", path: "/x", statusCode: 201, durationMs: 4, actorId: "user@example.com", actorRole: "admin", storeId: 7, errorCode: "E_TEST", password: "bad" });
    expect(Object.keys(log).sort()).toEqual(["actorId", "actorRole", "durationMs", "errorCode", "event", "method", "path", "requestId", "route", "statusCode", "storeId"]);
    expect(JSON.stringify(log)).not.toContain("bad");
  });
});
