import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./services/jobQueue", () => ({
  getQueueStats: vi.fn(async () => ({
    queuedCount: 0,
    runningCount: 0,
    retryCount: 0,
    deadLetterCount: 0,
    staleRunningCount: 0,
    oldestQueuedAgeMs: null,
    oldestRetryAgeMs: null,
    generatedAt: new Date().toISOString(),
  })),
}));

const dbModule = await import("./db");
const jobQueue = await import("./services/jobQueue");
const health = await import("./services/healthcheck");

describe("healthcheck service", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PAYMENT_PROVIDER_ENABLED;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("does not mark unconfigured providers healthy", () => {
    const providers = health.checkProviders({
      PAYMENT_PROVIDER_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(providers.razorpay.status).toBe("not_configured");
    expect(providers.razorpay.status).not.toBe("healthy");
  });

  it("marks configured providers as configured, not healthy", () => {
    const providers = health.checkProviders({
      PAYMENT_PROVIDER_ENABLED: "true",
      RAZORPAY_KEY_ID: "rzp",
      RAZORPAY_KEY_SECRET: "secret",
    } as NodeJS.ProcessEnv);
    expect(providers.razorpay.status).toBe("configured");
    expect(providers.razorpay.status).not.toBe("healthy");
  });

  it("returns unhealthy safely when the database query fails", async () => {
    vi.mocked(dbModule.getDb).mockResolvedValue({
      execute: vi.fn(async () => {
        throw new Error("mysql://user:pass@host/db");
      }),
    } as unknown);
    const result = await health.checkDatabase();
    expect(result.status).toBe("unhealthy");
    expect(JSON.stringify(result)).not.toContain("mysql://user:pass");
  });

  it("detects duplicate migration prefixes using read-only filesystem inspection", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
    fs.writeFileSync(path.join(dir, "0001_first.sql"), "select 1;");
    fs.writeFileSync(path.join(dir, "0001_second.sql"), "select 1;");
    const result = health.checkMigrations(dir);
    expect(result.status).toBe("unhealthy");
    expect(result.message).toBe("duplicate_migration_prefix");
  });

  it("worker health check is read-only and returns counts only", async () => {
    vi.mocked(jobQueue.getQueueStats).mockResolvedValueOnce({
      queuedCount: 1,
      runningCount: 0,
      retryCount: 0,
      deadLetterCount: 0,
      staleRunningCount: 0,
      oldestQueuedAgeMs: 10,
      oldestRetryAgeMs: null,
      generatedAt: "2026-05-09T00:00:00.000Z",
    });
    const result = await health.checkWorkerQueue();
    expect(jobQueue.getQueueStats).toHaveBeenCalledTimes(1);
    expect(result.details).toMatchObject({
      queuedCount: 1,
      deadLetterCount: 0,
    });
    expect(JSON.stringify(result)).not.toContain("payloadJson");
  });

  it("stock/reservation sanity check is read-only and reports unknown if not safely queryable", async () => {
    vi.mocked(dbModule.getDb).mockResolvedValue(null);
    const result = await health.checkStockReservationSanity();
    expect(result.status).toBe("unknown");
  });

  it("serialized health output contains no secret-looking configured keys", async () => {
    vi.mocked(dbModule.getDb).mockResolvedValue(null);
    const report = await health.getHealthReport();
    const serialized = JSON.stringify(report).toLowerCase();
    expect(serialized).not.toContain("database_url");
    expect(serialized).not.toContain("razorpay_key_secret");
    expect(serialized).not.toContain("aws_secret_access_key");
    expect(serialized).not.toContain("whatsapp_access_token");
  });
});
