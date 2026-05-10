import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
vi.mock("./services/jobQueue", () => ({ getQueueStats: vi.fn(async () => ({ queuedCount: 0, runningCount: 0, retryCount: 0, deadLetterCount: 0, staleRunningCount: 0, oldestQueuedAgeMs: null, oldestRetryAgeMs: null, generatedAt: "2026-05-10T00:00:00.000Z" })) }));

const { appRouter } = await import("./routers");

const baseCtx = (role: string | undefined) => ({
  user: role ? { id: 7, role, staffStoreId: 1 } : null,
  req: { headers: {} },
  res: {},
});

describe("deployment runtime readiness routers", () => {
  it("registers deployment and multi-store routers on appRouter", () => {
    const source = fs.readFileSync("server/routers.ts", "utf8");
    expect(source).toContain("deploymentReadiness: deploymentReadinessRouter");
    expect(source).toContain("multiStoreRuntime: multiStoreRuntimeRouter");
  });

  it("staff/admin gates runtime visibility endpoints", async () => {
    const customerCaller = appRouter.createCaller(baseCtx("customer") as any);
    await expect(customerCaller.multiStoreRuntime.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(customerCaller.deploymentReadiness.summary()).rejects.toMatchObject({ code: "FORBIDDEN" });

    const staffCaller = appRouter.createCaller(baseCtx("admin") as any);
    await expect(staffCaller.multiStoreRuntime.overview()).resolves.toMatchObject({ status: "unknown" });
    await expect(staffCaller.deploymentReadiness.backupRestoreDrill()).resolves.toMatchObject({ destructiveRestoreScriptAvailable: false });
    await expect(staffCaller.deploymentReadiness.failureExercises()).resolves.toMatchObject({ status: "manual_required", proofClaim: "exercise_plan_only" });
  });

  it("exposes a safe degraded-mode exercise shape without success claims", async () => {
    const caller = appRouter.createCaller(baseCtx("ops_admin") as any);
    const matrix = await caller.deploymentReadiness.failureExercises();
    expect(matrix.exercises).toHaveLength(8);
    expect(matrix.exercises.every((exercise) => typeof exercise.degradedSignal === "string" && typeof exercise.manualFallback === "string")).toBe(true);
    expect(matrix.exercises.find((exercise) => exercise.name === "db_connection_degradation")).toMatchObject({ failClosed: true });
    expect(JSON.stringify(matrix).toLowerCase()).not.toContain("outage proven");
  });

  it("health/readiness outputs are safe and do not leak secrets", async () => {
    process.env.RAZORPAY_KEY_SECRET = "super-secret-value";
    process.env.DATABASE_URL = "mysql://user:password@db.local/app";
    const caller = appRouter.createCaller(baseCtx("ops_admin") as any);
    const [live, drill] = await Promise.all([caller.deploymentReadiness.liveness(), caller.deploymentReadiness.backupRestoreDrill()]);
    const text = JSON.stringify({ live, drill }).toLowerCase();
    expect(text).not.toContain("super-secret-value");
    expect(text).not.toContain("password@db");
    expect(text).not.toContain("database_url");
  });

  it("restore drill refuses destructive execution and redacts credentials", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-drill-"));
    const backup = path.join(dir, "backup.sql");
    fs.writeFileSync(backup, "select 1;");
    const result = spawnSync(process.execPath, ["scripts/restore-db-drill.mjs", "--execute", "--backup-file", backup], {
      env: { ...process.env, RESTORE_DATABASE_URL: "mysql://user:secret@nonprod.local/test_restore" },
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Destructive restore execution is not implemented");
    expect(`${result.stdout}${result.stderr}`).not.toContain("secret");
  });

  it("does not claim fake deployment proof", async () => {
    const caller = appRouter.createCaller(baseCtx("super_admin") as any);
    const summary = await caller.deploymentReadiness.summary();
    expect(JSON.stringify(summary).toLowerCase()).toContain("no production deployment proof is asserted");
    expect(JSON.stringify(summary).toLowerCase()).not.toContain("production verified");
  });

  it("documents runtime readiness without fake proof language", () => {
    for (const file of ["DEPLOYMENT_RUNTIME_STATUS.md", "CURRENT_MAIN_TRUTH.md", "OPEN_BLOCKERS.md"]) {
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8").toLowerCase() : "";
      expect(text).not.toContain("production verified");
      expect(text).not.toContain("deployment proven");
    }
  });
});
