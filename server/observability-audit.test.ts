import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => {
      throw new Error("no session");
    }),
  },
}));
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));

const sdkModule = await import("./_core/sdk");
const { buildHttpRequestLog, initObservability } = await import(
  "./_core/observability"
);
const { registerObservabilityRoutes } = await import(
  "./routers/observabilityRouter"
);
const { OBSERVABILITY_METRIC_NAMES, getProviderVisibilitySummary } =
  await import("./services/operationalVisibility");

async function withServer<T>(
  configure: (app: express.Express) => void,
  fn: (baseUrl: string) => Promise<T>
): Promise<T> {
  const app = express();
  configure(app);
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

describe("observability audit guards", () => {
  const oldNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = oldNodeEnv;
    vi.clearAllMocks();
  });

  it("redacts sensitive and PHI-looking fields from structured HTTP logs", () => {
    const req = {
      method: "GET",
      path: "/api/customer/+919999999999/prescription/token/secret@example.com",
      traceId: "trace-safe-123456",
      correlationId: "corr-safe-123456",
    } as unknown;
    const res = { statusCode: 200 } as unknown;

    const entry = buildHttpRequestLog(req, res, 0.012);
    const serialized = JSON.stringify(entry).toLowerCase();

    expect(serialized).toContain("http_request");
    expect(serialized).not.toContain("+919999999999");
    expect(serialized).not.toContain("secret@example.com");
    expect(serialized).not.toContain("bearer ");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("otp");
  });

  it("gates observability JSON routes behind staff/admin authentication", async () => {
    process.env.NODE_ENV = "production";
    await withServer(
      app => registerObservabilityRoutes(app),
      async baseUrl => {
        const forbidden = await fetch(
          `${baseUrl}/api/observability/dashboards`
        );
        expect(forbidden.status).toBe(404);

        vi.mocked(sdkModule.sdk.authenticateRequest).mockResolvedValueOnce({
          id: 1,
          role: "admin",
        } as unknown);
        const allowed = await fetch(`${baseUrl}/api/observability/dashboards`);
        expect(allowed.status).toBe(200);
        const body = await allowed.json();
        expect(Array.isArray(body.dashboards)).toBe(true);
        expect(body.supportedMetrics).toEqual(
          expect.arrayContaining(["provider_dead_letter_total"])
        );
      }
    );
  });

  it("gates /metrics and exposes the expected Prometheus metric shape", async () => {
    process.env.NODE_ENV = "production";
    await withServer(
      app => initObservability(app),
      async baseUrl => {
        const forbidden = await fetch(`${baseUrl}/metrics`);
        expect(forbidden.status).toBe(404);

        vi.mocked(sdkModule.sdk.authenticateRequest).mockResolvedValueOnce({
          id: 2,
          role: "store_manager",
        } as unknown);
        const allowed = await fetch(`${baseUrl}/metrics`);
        expect(allowed.status).toBe(200);
        expect(allowed.headers.get("content-type")).toContain("text/plain");
        const text = await allowed.text();
        expect(text).toContain("# HELP api_latency_seconds");
        expect(text).toContain("# HELP provider_dead_letter_total");
        expect(text).toContain("# TYPE worker_job_backlog gauge");
      }
    );
  });

  it("keeps dashboard definitions free of fake or unsupported metric claims", () => {
    const supported = new Set<string>(
      OBSERVABILITY_METRIC_NAMES as readonly string[]
    );
    const dashboardDir = path.join(process.cwd(), "docs", "dashboards");
    const dashboards = fs
      .readdirSync(dashboardDir)
      .filter(file => file.endsWith(".json"));

    for (const file of dashboards) {
      const dashboard = JSON.parse(
        fs.readFileSync(path.join(dashboardDir, file), "utf8")
      );
      const metrics = Array.isArray(dashboard.metrics) ? dashboard.metrics : [];
      if (metrics.length === 0) {
        expect(dashboard.status).toMatch(/blocked/);
      }
      for (const metric of metrics) {
        expect(supported.has(metric.query)).toBe(true);
      }
      expect(JSON.stringify(dashboard).toLowerCase()).not.toContain(
        "placeholder"
      );
      expect(JSON.stringify(dashboard).toLowerCase()).not.toContain("fake");
    }
  });

  it("derives provider and dead-letter visibility from durable provider event tables, not mock telemetry", async () => {
    const summary = await getProviderVisibilitySummary();
    expect(summary.source).toBe("provider_event_tables");
    expect(summary.databaseConfigured).toBe(false);
    expect(summary.providerEvents.total).toBe(0);
    expect(summary.providerDeadLetters.total).toBe(0);
  });
});
