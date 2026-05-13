import express from "express";
import http from "http";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => {
      throw new Error("no session");
    }),
  },
}));
vi.mock("./services/healthcheck", () => ({
  publicLiveness: vi.fn(() => ({
    status: "ok",
    timestamp: "2026-05-09T00:00:00.000Z",
  })),
  publicReadiness: vi.fn(async () => ({
    status: "ready",
    timestamp: "2026-05-09T00:00:00.000Z",
    checks: { database: "healthy", migrations: "healthy" },
  })),
  getHealthReport: vi.fn(async () => ({
    status: "healthy",
    generatedAt: "2026-05-09T00:00:00.000Z",
    app: { status: "healthy", uptimeSeconds: 1, environment: "test" },
    database: { status: "healthy" },
    migrations: { status: "healthy" },
    providers: { razorpay: { status: "not_configured" } },
    workerQueue: { status: "configured" },
    stockReservationSanity: { status: "healthy" },
  })),
}));

const sdkModule = await import("./_core/sdk");
const healthModule = await import("./services/healthcheck");
const { registerHealthRoutes } = await import("./routers/healthRouter");

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  registerHealthRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(err => (err ? reject(err) : resolve()))
    );
  }
}

describe("health router", () => {
  const oldNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = oldNodeEnv;
    vi.clearAllMocks();
  });

  it("/healthz and /api/healthz are minimal and secret-free", async () => {
    await withServer(async baseUrl => {
      for (const path of ["/healthz", "/api/healthz"]) {
        const response = await fetch(`${baseUrl}${path}`);
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(body).toEqual({
          status: "ok",
          timestamp: "2026-05-09T00:00:00.000Z",
        });
        expect(JSON.stringify(body).toLowerCase()).not.toContain("secret");
        expect(body).not.toHaveProperty("database");
        expect(body).not.toHaveProperty("providers");
      }
    });
  });

  it("/readyz and /api/readyz are secret-free and non-2xx when critical checks fail", async () => {
    vi.mocked(healthModule.publicReadiness).mockResolvedValueOnce({
      status: "not_ready",
      timestamp: "2026-05-09T00:00:00.000Z",
      checks: { database: "unhealthy", migrations: "healthy" },
    } as unknown);
    await withServer(async baseUrl => {
      const failed = await fetch(`${baseUrl}/readyz`);
      expect(failed.status).toBe(503);
      const body = await failed.json();
      expect(JSON.stringify(body).toLowerCase()).not.toContain("database_url");

      const ok = await fetch(`${baseUrl}/api/readyz`);
      expect(ok.status).toBe(200);
    });
  });

  it("detailed health is protected and fail-closed in production", async () => {
    process.env.NODE_ENV = "production";
    await withServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(404);
      expect(healthModule.getHealthReport).not.toHaveBeenCalled();
    });
  });

  it("detailed admin health returns safe report for staff/admin", async () => {
    vi.mocked(sdkModule.sdk.authenticateRequest).mockResolvedValueOnce({
      id: 1,
      role: "admin",
    } as unknown);
    await withServer(async baseUrl => {
      const response = await fetch(`${baseUrl}/api/admin/health`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.providers.razorpay.status).toBe("not_configured");
      expect(JSON.stringify(body).toLowerCase()).not.toContain("secret");
    });
  });
});
