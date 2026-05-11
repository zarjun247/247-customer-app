import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("fs", () => {
  const store: Record<string, string> = {};
  return {
    default: {
      readFileSync: (p: string) => {
        if (store[p]) return store[p];
        throw new Error("ENOENT");
      },
      writeFileSync: (p: string, data: string) => { store[p] = data; },
      renameSync: (src: string, dst: string) => { store[dst] = store[src]; delete store[src]; },
    },
    readFileSync: (p: string) => {
      if (store[p]) return store[p];
      throw new Error("ENOENT");
    },
    writeFileSync: (p: string, data: string) => { store[p] = data; },
    renameSync: (src: string, dst: string) => { store[dst] = store[src]; delete store[src]; },
  };
});

vi.mock("pino", () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  listScenarios,
  canTrigger,
  recordDrill,
  listDrillRecords,
  type ChaosDrillRecord,
} from "./chaosService";

function makeRecord(overrides: Partial<ChaosDrillRecord> = {}): ChaosDrillRecord {
  return {
    id: "drill-1",
    ts: new Date().toISOString(),
    actor: "test",
    scenario: "provider-webhook-fail",
    outcome: "success",
    observations: "Rejected as expected",
    durationMs: 200,
    ...overrides,
  };
}

describe("chaosService", () => {
  beforeEach(() => {
    delete process.env.CHAOS_DRILL_ENABLED;
    vi.resetModules();
  });

  it("listScenarios returns all 6 scenarios", () => {
    const scenarios = listScenarios();
    expect(scenarios).toHaveLength(6);
    expect(scenarios.map(s => s.name)).toContain("db-pool-exhaust");
  });

  it("canTrigger allows non-production by default", () => {
    const result = canTrigger("provider-webhook-fail", "staging");
    expect(result.allowed).toBe(true);
  });

  it("canTrigger blocks production without CHAOS_DRILL_ENABLED", () => {
    const result = canTrigger("db-pool-exhaust", "production");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("CHAOS_DRILL_ENABLED");
  });

  it("canTrigger allows production with CHAOS_DRILL_ENABLED=true", () => {
    process.env.CHAOS_DRILL_ENABLED = "true";
    const result = canTrigger("db-pool-exhaust", "production");
    expect(result.allowed).toBe(true);
  });

  it("canTrigger rejects unknown scenario", () => {
    const result = canTrigger("not-a-scenario", "staging");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("scenario_not_found");
  });

  it("recordDrill and listDrillRecords work end to end", async () => {
    await recordDrill(makeRecord({ id: "d1", scenario: "dead-letter-injection" }));
    await recordDrill(makeRecord({ id: "d2", scenario: "slo-budget-breach" }));
    const records = await listDrillRecords(10);
    expect(records[0].id).toBe("d2");
    expect(records[1].id).toBe("d1");
  });
});
