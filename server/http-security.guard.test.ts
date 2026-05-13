import { describe, expect, it } from "vitest";
import fs from "fs";
import {
  NORMAL_JSON_LIMIT,
  RAW_WEBHOOK_LIMIT,
  accessLogMiddleware,
  applyHttpSecurity,
  buildAccessLogEntry,
  corsAllowlistMiddleware,
  isSafeRequestId,
  parseOriginAllowlist,
  rateLimitScaffold,
} from "./middleware/httpSecurity";
import { redactSensitive } from "./_core/redact";

describe("http security middleware guards", () => {
  it("wires Helmet/security middleware into the Express entrypoint", () => {
    const entrypoint = fs.readFileSync("server/_core/index.ts", "utf8");
    const middleware = fs.readFileSync(
      "server/middleware/httpSecurity.ts",
      "utf8"
    );

    expect(entrypoint).toContain("applyHttpSecurity(app)");
    expect(middleware).toContain("helmet(");
    expect(middleware).toContain("contentSecurityPolicy: false");
    expect(middleware).toContain("crossOriginEmbedderPolicy: false");
  });

  it("production CORS uses an env allowlist and never wildcard origin", () => {
    const allowlist = parseOriginAllowlist(
      {
        NODE_ENV: "production",
        CORS_ALLOWED_ORIGINS: "https://app.example.com, *",
        APP_ORIGIN: "https://customer.example.com",
        ADMIN_ORIGIN: "https://admin.example.com",
      } as NodeJS.ProcessEnv,
      true
    );

    expect(allowlist.has("https://app.example.com")).toBe(true);
    expect(allowlist.has("https://customer.example.com")).toBe(true);
    expect(allowlist.has("https://admin.example.com")).toBe(true);
    expect(allowlist.has("*")).toBe(false);
    expect(allowlist.has("http://localhost:5173")).toBe(false);

    const middlewareSource = fs.readFileSync(
      "server/middleware/httpSecurity.ts",
      "utf8"
    );
    expect(middlewareSource).not.toContain('Access-Control-Allow-Origin", "*"');
    expect(middlewareSource).not.toContain("Access-Control-Allow-Origin', '*'");
  });

  it("request IDs accept only safe inbound values and otherwise generate a safe header", () => {
    expect(isSafeRequestId("req_abcdefghi-abc.DEF:trace")).toBe(true);
    expect(isSafeRequestId("short")).toBe(false);
    expect(isSafeRequestId("bad\r\nheader: injected")).toBe(false);
  });

  it("structured logging records metadata while redacting sensitive payload summaries", () => {
    const startedAt = process.hrtime.bigint();
    const req = {
      method: "POST",
      path: "/api/trpc/auth.verifyOtp",
      ip: "203.0.113.9",
      requestId: "req_abcdefghi",
      user: { id: 42, staffStoreId: 7 },
      header: (name: string) =>
        name.toLowerCase() === "user-agent" ? "vitest-agent" : undefined,
    } as unknown;
    const res = {
      statusCode: 401,
      locals: { requestId: "req_abcdefghi" },
    } as unknown;

    const entry = buildAccessLogEntry(
      req,
      res,
      startedAt,
      new Error("otp=123456 gatewaySignature=secret cookie=session-token")
    );
    const serialized = redactSensitive(JSON.stringify(entry));

    expect(serialized).toContain("req_abcdefghi");
    expect(serialized).toContain('"userId":"42"');
    expect(serialized).toContain('"storeId":"7"');
    expect(serialized).not.toContain("otp=123456");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("session-token");
    expect(serialized).not.toContain("prescriptionImage");
  });

  it("does not use a broad global 50mb parser and preserves raw webhook parser ordering", () => {
    const entrypoint = fs.readFileSync("server/_core/index.ts", "utf8");
    const middleware = fs.readFileSync(
      "server/middleware/httpSecurity.ts",
      "utf8"
    );

    expect(entrypoint).not.toContain('express.json({ limit: "50mb" })');
    expect(entrypoint).not.toContain('express.urlencoded({ limit: "50mb"');
    expect(NORMAL_JSON_LIMIT).toBe("1mb");
    expect(RAW_WEBHOOK_LIMIT).toBe("2mb");
    const applyBody = middleware.slice(
      middleware.indexOf("export function applyHttpSecurity")
    );
    expect(applyBody.indexOf("registerRawWebhookParsers(app)")).toBeLessThan(
      applyBody.indexOf("normalJsonParser()")
    );
    expect(middleware).toContain('"/api/webhooks/razorpay"');
    expect(middleware).toContain('"/api/webhooks/whatsapp"');
    expect(middleware).toContain("express.raw");
  });

  it("documents route-level rate-limit scaffolding for high-risk boundaries", () => {
    expect(rateLimitScaffold.map(policy => policy.id)).toEqual(
      expect.arrayContaining([
        "auth-otp",
        "login-auth",
        "prescription-upload",
        "checkout-cart-mutation",
        "public-product-search",
        "webhook-provider",
      ])
    );
    expect(
      rateLimitScaffold.filter(policy => policy.productionBackendRequired)
        .length
    ).toBeGreaterThanOrEqual(5);
  });

  it("exports middleware functions used by the server boundary", () => {
    expect(typeof applyHttpSecurity).toBe("function");
    expect(typeof corsAllowlistMiddleware).toBe("function");
    expect(typeof accessLogMiddleware).toBe("function");
  });
});
