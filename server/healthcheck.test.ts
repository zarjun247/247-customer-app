import { describe, expect, it } from "vitest";
import { createHealthReport, createLivenessReport, readinessSummary } from "./services/healthcheck";

function makeDb(rows: Array<Record<string, unknown>> = [{ count: 0 }]) {
  const calls: unknown[] = [];
  return {
    calls,
    db: {
      execute: async (statement: unknown) => {
        calls.push(statement);
        return [rows];
      },
    } as any,
  };
}

const fixedNow = () => new Date("2026-05-08T00:00:00.000Z");

describe("healthcheck service", () => {
  it("public liveness is minimal and does not expose secrets", () => {
    process.env.RAZORPAY_KEY_SECRET = "super-secret";
    const report = createLivenessReport(fixedNow());
    const text = JSON.stringify(report);

    expect(report).toMatchObject({ status: "healthy", service: "247-customer-app", scope: "public" });
    expect(Object.keys(report.components)).toEqual(["app"]);
    expect(text).not.toContain("super-secret");
    expect(text).not.toContain("DATABASE_URL");
  });

  it("reports DB unavailable safely when connection is missing", async () => {
    const report = await createHealthReport("readiness", { getDb: async () => null, now: fixedNow, env: {}, migrationDir: "/missing" });
    expect(report.components.db.status).toBe("unhealthy");
    expect(JSON.stringify(report)).not.toContain("DATABASE_URL");
  });

  it("does not mark unconfigured providers healthy or expose env secret values", async () => {
    const { db } = makeDb();
    const report = await createHealthReport("admin", {
      getDb: async () => db,
      now: fixedNow,
      migrationDir: "/missing",
      env: {
        STORAGE_PROVIDER_ENABLED: "true",
        BUILT_IN_FORGE_API_KEY: "storage-secret",
        PAYMENT_PROVIDER_ENABLED: "true",
        RAZORPAY_KEY_ID: "rzp_id",
        RAZORPAY_KEY_SECRET: "razor-secret",
        SMS_PROVIDER_ENABLED: "true",
      },
    });

    expect(report.components.payment.status).toBe("degraded");
    expect(report.components.sms.status).toBe("not_configured");
    expect(report.components.storage.status).toBe("not_configured");
    const text = JSON.stringify(report);
    expect(text).not.toContain("storage-secret");
    expect(text).not.toContain("razor-secret");
    expect(text).not.toContain("rzp_id");
  });

  it("summarizes readiness to app, DB, and migrations only", async () => {
    const { db } = makeDb();
    const detailed = await createHealthReport("admin", { getDb: async () => db, now: fixedNow, env: {}, migrationDir: "/missing" });
    const summary = readinessSummary(detailed);
    expect(Object.keys(summary.components)).toEqual(["app", "db", "migrations"]);
    expect(summary.scope).toBe("readiness");
  });

  it("runs stock and reservation sanity checks through read-only execute calls", async () => {
    const { db, calls } = makeDb([{ count: 0 }]);
    const report = await createHealthReport("admin", { getDb: async () => db, now: fixedNow, env: {}, migrationDir: "/missing" });

    expect(report.components.stockSanity.details?.readOnly).toBe(true);
    expect(report.components.reservationSanity.details?.readOnly).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect((db as any).insert).toBeUndefined();
    expect((db as any).update).toBeUndefined();
    expect((db as any).delete).toBeUndefined();
  });

  it("keeps health route response shape stable", async () => {
    const { db } = makeDb();
    const report = await createHealthReport("admin", { getDb: async () => db, now: fixedNow, env: {}, migrationDir: "/missing" });
    expect(Object.keys(report).sort()).toEqual(["components", "scope", "service", "status", "timestamp"]);
    for (const component of Object.values(report.components)) {
      expect(["healthy", "degraded", "unhealthy", "not_configured", "disabled", "unknown"]).toContain(component.status);
    }
  });
});
