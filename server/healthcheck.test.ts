import express from "express";
import http from "http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHealthRouter, requireAdminHealthAccess } from "./routers/healthRouter";
import { checkDatabase, checkProviders, getLivenessHealth, getReadinessHealth, normalizeHealthStatus } from "./services/healthcheck";

async function withApp<T>(fn: (baseUrl: string) => Promise<T>) {
  const app = express();
  app.use(createHealthRouter());
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe("healthcheck endpoints and services", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ADMIN_HEALTH_TOKEN;
    process.env.NODE_ENV = "test";
  });

  it("returns minimal liveness endpoint shape", async () => {
    await withApp(async baseUrl => {
      const response = await fetch(`${baseUrl}/healthz`);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(["service", "status", "timestamp", "version"]);
      expect(body.status).toBe("healthy");
      expect(body).not.toHaveProperty("components");
      expect(body).not.toHaveProperty("env");
      expect(body).not.toHaveProperty("databaseUrl");
    });
  });

  it("normalizes readiness component statuses", async () => {
    const readiness = await getReadinessHealth({
      dbFactory: async () => null,
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
    });
    expect(Object.keys(readiness.components)).toEqual([
      "app",
      "database",
      "migrations",
      "objectStorage",
      "payments",
      "messaging",
      "ocr",
      "workerQueue",
      "stock",
      "reservations",
    ]);
    for (const component of Object.values(readiness.components)) {
      expect(normalizeHealthStatus(component.status)).toBe(component.status);
    }
  });

  it("fails closed for admin health in production without token", async () => {
    process.env.NODE_ENV = "production";
    await withApp(async baseUrl => {
      const response = await fetch(`${baseUrl}/admin/health`);
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body.error).toBe("admin_health_token_not_configured");
    });
  });

  it("does not expose configured secrets in healthcheck payloads", async () => {
    process.env.RAZORPAY_KEY_SECRET = "rzp_secret_should_not_leak";
    process.env.WHATSAPP_API_TOKEN = "whatsapp_token_should_not_leak";
    const readiness = await getReadinessHealth({ dbFactory: async () => null, env: process.env });
    const serialized = JSON.stringify(readiness);
    expect(serialized).not.toContain("rzp_secret_should_not_leak");
    expect(serialized).not.toContain("whatsapp_token_should_not_leak");
    expect(serialized).not.toContain(process.env.DATABASE_URL ?? "mysql://");
  });

  it("returns degraded or unhealthy instead of crashing on database failure", async () => {
    const result = await checkDatabase(async () => ({ execute: async () => { throw new Error("boom"); } }));
    expect(["degraded", "unhealthy"]).toContain(result.status);
  });

  it("does not treat provider_unconfigured as healthy success", () => {
    const provider = checkProviders({ NODE_ENV: "production", PAYMENT_PROVIDER_ENABLED: "true" } as NodeJS.ProcessEnv);
    expect(provider.payments.status).toBe("not_configured");
    expect(JSON.stringify(provider.payments)).toContain("provider_unconfigured");
  });

  it("keeps liveness implementation minimal at service level", () => {
    expect(getLivenessHealth()).toMatchObject({ status: "healthy", service: expect.any(String), version: expect.any(String) });
  });

  it("contains no mutating SQL or data lifecycle calls in healthcheck files", async () => {
    const fs = await import("node:fs/promises");
    const files = ["server/services/healthcheck.ts", "server/routers/healthRouter.ts"];
    const source = (await Promise.all(files.map(file => fs.readFile(file, "utf8")))).join("\n");
    expect(source).not.toMatch(/\b(insert|update|delete|alter|drop|truncate)\s+/i);
    expect(source).not.toMatch(/processPayment|capture|refund|reserveStock|releaseReservation|createOrder|approvePrescription/i);
  });

  it("admin guard accepts configured token without exposing it", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_HEALTH_TOKEN = "safe-token";
    const req = { header: (name: string) => (name === "x-admin-health-token" ? "safe-token" : undefined) } as Parameters<typeof requireAdminHealthAccess>[0];
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Parameters<typeof requireAdminHealthAccess>[1];
    const next = vi.fn();
    requireAdminHealthAccess(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalledWith(expect.stringContaining("safe-token"));
  });
});
