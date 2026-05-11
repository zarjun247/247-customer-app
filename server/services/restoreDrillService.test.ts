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
  listDrills,
  getLastDrill,
  getDrillAge,
  recordDrill,
  type RestoreDrillRecord,
} from "./restoreDrillService";

function makeRecord(overrides: Partial<RestoreDrillRecord> = {}): RestoreDrillRecord {
  return {
    id: "restore-1",
    ts: new Date().toISOString(),
    actor: "test",
    backupFileRef: "backup-2026-05-11.sql",
    outcome: "success",
    durationMs: 5000,
    notes: "All checks passed",
    ...overrides,
  };
}

describe("restoreDrillService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getLastDrill returns null when no drills", async () => {
    const last = await getLastDrill();
    expect(last).toBeNull();
  });

  it("getDrillAge returns null when no drills", async () => {
    const age = await getDrillAge();
    expect(age).toBeNull();
  });

  it("records a drill and retrieves it as last", async () => {
    await recordDrill(makeRecord());
    const last = await getLastDrill();
    expect(last?.backupFileRef).toBe("backup-2026-05-11.sql");
  });

  it("getDrillAge returns withinSla=true for recent drill", async () => {
    await recordDrill(makeRecord({ ts: new Date().toISOString() }));
    const age = await getDrillAge();
    expect(age).not.toBeNull();
    expect(age!.withinSla).toBe(true);
    expect(age!.ageHours).toBeLessThan(1);
  });

  it("getDrillAge returns withinSla=false for old drill beyond SLA", async () => {
    const oldTs = new Date(Date.now() - 200 * 3_600_000).toISOString();
    await recordDrill(makeRecord({ ts: oldTs, id: "old-drill" }));
    const age = await getDrillAge();
    expect(age!.withinSla).toBe(false);
  });

  it("listDrills returns in reverse order", async () => {
    await recordDrill(makeRecord({ id: "r1", ts: new Date(Date.now() - 2000).toISOString() }));
    await recordDrill(makeRecord({ id: "r2", ts: new Date().toISOString() }));
    const drills = await listDrills(10);
    expect(drills[0].id).toBe("r2");
    expect(drills[1].id).toBe("r1");
  });
});
