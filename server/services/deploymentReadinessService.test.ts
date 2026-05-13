import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("fs", () => {
  const store: Record<string, string> = {};
  return {
    default: {
      readFileSync: (p: string) => {
        if (store[p]) return store[p];
        throw new Error("ENOENT");
      },
      writeFileSync: (p: string, data: string) => {
        store[p] = data;
      },
      renameSync: (src: string, dst: string) => {
        store[dst] = store[src];
        delete store[src];
      },
    },
    readFileSync: (p: string) => {
      if (store[p]) return store[p];
      throw new Error("ENOENT");
    },
    writeFileSync: (p: string, data: string) => {
      store[p] = data;
    },
    renameSync: (src: string, dst: string) => {
      store[dst] = store[src];
      delete store[src];
    },
  };
});

vi.mock("pino", () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  listReadinessRecords,
  getCurrentReadiness,
  recordReadiness,
  type ReadinessRecord,
} from "./deploymentReadinessService";

function makeRecord(overrides: Partial<ReadinessRecord> = {}): ReadinessRecord {
  return {
    id: "rec-1",
    ts: new Date().toISOString(),
    env: "staging",
    actor: "test",
    commitSha: "abc123",
    checks: [{ name: "typecheck", status: "pass" }],
    overall: "pass",
    ...overrides,
  };
}

describe("deploymentReadinessService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns unknown when no records exist for env", async () => {
    const result = await getCurrentReadiness("staging");
    expect(result.status).toBe("unknown");
  });

  it("records a validation and returns ready", async () => {
    const rec = makeRecord({ overall: "pass" });
    await recordReadiness(rec);
    const result = await getCurrentReadiness("staging");
    expect(result.status).toBe("ready");
    expect(result.lastRecord?.commitSha).toBe("abc123");
  });

  it("returns failed when latest record is fail", async () => {
    await recordReadiness(makeRecord({ overall: "fail", id: "rec-fail" }));
    const result = await getCurrentReadiness("staging");
    expect(result.status).toBe("failed");
  });

  it("returns stale when latest record is older than 24h", async () => {
    const oldTs = new Date(Date.now() - 25 * 3_600_000).toISOString();
    await recordReadiness(
      makeRecord({ ts: oldTs, overall: "pass", id: "rec-stale" })
    );
    const result = await getCurrentReadiness("staging");
    expect(result.status).toBe("stale");
    expect(result.ageHours).toBeGreaterThan(24);
  });

  it("listReadinessRecords returns records in reverse order", async () => {
    await recordReadiness(
      makeRecord({ id: "a", ts: new Date(Date.now() - 1000).toISOString() })
    );
    await recordReadiness(
      makeRecord({ id: "b", ts: new Date().toISOString() })
    );
    const recs = await listReadinessRecords(10);
    expect(recs[0].id).toBe("b");
    expect(recs[1].id).toBe("a");
  });
});
