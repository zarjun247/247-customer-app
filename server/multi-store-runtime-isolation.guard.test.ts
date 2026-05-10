import { execSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
vi.mock("./services/jobQueue", () => ({
  getQueueStats: vi.fn(async () => ({
    queuedCount: 0,
    runningCount: 0,
    retryCount: 0,
    deadLetterCount: 0,
    staleRunningCount: 0,
    oldestQueuedAgeMs: null,
    oldestRetryAgeMs: null,
    generatedAt: "2026-05-10T00:00:00.000Z",
  })),
}));

const { appRouter } = await import("./routers");

const callerFor = (role: string, staffStoreId: number | null = 1) =>
  appRouter.createCaller({ user: { id: 11, role, staffStoreId }, req: { headers: {} }, res: {} } as any);

describe("multi-store runtime isolation hardening", () => {
  it("store staff cannot read another store runtime detail while admin roles can cross-store", async () => {
    await expect(callerFor("store_manager", 1).multiStoreRuntime.store({ storeId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor("store_manager", 1).multiStoreRuntime.store({ storeId: 1 })).resolves.toMatchObject({ status: "unknown" });
    await expect(callerFor("admin", 1).multiStoreRuntime.store({ storeId: 2 })).resolves.toMatchObject({ status: "unknown" });
  });

  it("transfer endpoints explicitly enforce source/destination store scope instead of an unused storeId input", () => {
    const source = fs.readFileSync("server/routers/inventoryRouter.ts", "utf8");
    const stockInvariant = fs.readFileSync("server/services/stockInvariant.ts", "utf8");
    expect(source).toContain("requireTransferEndpointAccess");
    expect(source).toContain("Source batch does not belong to fromStoreId");
    expect(stockInvariant).toContain("receiveTransferStockAtomic");
    expect(stockInvariant).toContain("Transfer reservation missing or already released");
    expect(stockInvariant).toContain("db.transaction(async (tx: any) =>");
    const transferSlice = source.slice(source.indexOf("const transferRouter"), source.indexOf("// ─── Audit Router"));
    expect(transferSlice).not.toContain("if ((input as any).storeId !== undefined) requireStoreAccess(ctx.user, Number((input as any).storeId));");
  });

  it("non-admin transfer and stock audit list paths fail closed to the caller store when no storeId filter is provided", () => {
    const out = execSync("rg -n 'requireStoreScopedFilter\\(ctx.user, input.storeId\\)' server/routers/inventoryRouter.ts", { encoding: "utf8" }).trim();
    expect(out.split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("documents unsupported store-scoped provider/dead-letter proof instead of inventing it", () => {
    const status = fs.readFileSync("MULTI_STORE_RUNTIME_STATUS.md", "utf8").toLowerCase();
    const simulation = fs.readFileSync("MULTI_STORE_SIMULATION_STATUS.md", "utf8").toLowerCase();
    expect(`${status}\n${simulation}`).toContain("unsupported/not-yet-proven");
    expect(`${status}\n${simulation}`).toContain("provider dead-letter tables do not yet carry a first-class storeid");
    expect(`${status}\n${simulation}`).not.toContain("multi-store production proven");
  });
});
