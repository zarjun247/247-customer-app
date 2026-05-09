import express from "express";
import http from "http";
import fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerHealthRoutes } from "./routers/healthRouter";
import { checkMigrations, getHealthReport, toPublicLiveness, toPublicReadiness } from "./services/healthcheck";

const SECRET_VALUES = {
  DATABASE_URL: "mysql://user:password@localhost:3306/private_db",
  RAZORPAY_KEY_SECRET: "rzp_secret_private",
  AWS_SECRET_ACCESS_KEY: "aws_secret_private",
  WHATSAPP_TOKEN: "whatsapp_private_token",
};

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  registerHealthRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function assertNoSecrets(serialized: string) {
  for (const secret of Object.values(SECRET_VALUES)) expect(serialized).not.toContain(secret);
  expect(serialized).not.toContain("Bearer raw-bearer-token");
}

describe("production health checks", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv, NODE_ENV: "production", ...SECRET_VALUES };
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.HEALTHCHECK_INTERNAL_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("/healthz and /readyz are public-safe and do not expose secrets", async () => {
    await withServer(async (baseUrl) => {
      const healthz = await fetch(`${baseUrl}/healthz`, { headers: { authorization: "Bearer raw-bearer-token" } });
      const readyz = await fetch(`${baseUrl}/readyz`);
      const healthText = await healthz.text();
      const readyText = await readyz.text();
      expect([200, 503]).toContain(healthz.status);
      expect([200, 503]).toContain(readyz.status);
      expect(healthText).toContain("requestIdSupported");
      expect(readyText).toContain("checks");
      assertNoSecrets(healthText);
      assertNoSecrets(readyText);
      expect(healthText).not.toContain("providers");
      expect(readyText).not.toContain("RAZORPAY");
    });
  });

  it("/api/healthz and /api/readyz are available aliases", async () => {
    await withServer(async (baseUrl) => {
      expect([200, 503]).toContain((await fetch(`${baseUrl}/api/healthz`)).status);
      expect([200, 503]).toContain((await fetch(`${baseUrl}/api/readyz`)).status);
    });
  });

  it("detailed health fails closed in production without an explicit internal token", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/health`);
      const adminResponse = await fetch(`${baseUrl}/api/admin/health`);
      expect(response.status).toBe(403);
      expect(adminResponse.status).toBe(403);
      assertNoSecrets(await response.text());
      assertNoSecrets(await adminResponse.text());
    });
  });

  it("detailed health can be accessed with the explicit internal token and remains redacted", async () => {
    process.env.HEALTHCHECK_INTERNAL_TOKEN = "safe-internal-token";
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/health`, { headers: { "x-healthcheck-token": "safe-internal-token" } });
      expect([200, 503]).toContain(response.status);
      const text = await response.text();
      expect(text).toContain("providers");
      assertNoSecrets(text);
    });
  });

  it("does not mark unconfigured providers healthy", async () => {
    const report = await getHealthReport();
    expect(report.providers.razorpay.status).not.toBe("healthy");
    expect(report.providers.razorpay.status).toBe("disabled");
    expect(report.providers.whatsapp.status).not.toBe("healthy");
  });

  it("database failure is reported safely without crashing", async () => {
    process.env.DATABASE_URL = "not-a-valid-db-url";
    const report = await getHealthReport();
    expect(["degraded", "unhealthy"]).toContain(report.database.status);
    assertNoSecrets(JSON.stringify(report));
  });

  it("migration health is static and read-only", () => {
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    const appendSpy = vi.spyOn(fs, "appendFileSync");
    const result = checkMigrations();
    expect(["healthy", "unhealthy", "unknown"]).toContain(result.status);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(appendSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain("static_filename_read_only");
  });

  it("worker and stock/reservation health checks are marked read-only", async () => {
    delete process.env.DATABASE_URL;
    const report = await getHealthReport();
    expect(report.workerQueue.details?.readOnly).toBe(true);
    expect(report.stockReservationSanity.details?.readOnly).toBe(true);
  });

  it("public serializers do not include private internals", async () => {
    const report = await getHealthReport();
    const liveness = JSON.stringify(toPublicLiveness(report));
    const readiness = JSON.stringify(toPublicReadiness(report));
    expect(liveness).not.toContain("providers");
    expect(readiness).not.toContain("workerQueue");
    assertNoSecrets(liveness);
    assertNoSecrets(readiness);
  });
});
