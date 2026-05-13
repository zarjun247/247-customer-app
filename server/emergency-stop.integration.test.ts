import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./services/auditHashChain", () => ({
  appendChainedAudit: vi
    .fn()
    .mockResolvedValue({ sequenceNumber: 1, rowHash: "abc" }),
}));

import { getDb } from "./db";
import { appendChainedAudit } from "./services/auditHashChain";
import {
  readFlag,
  setFlag,
  _testOnlyInvalidateCache,
} from "./services/emergencyStopService";

const mockGetDb = vi.mocked(getDb);

function makeSelectResult(settingValueStr: string | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve(
              settingValueStr === null
                ? []
                : [
                    {
                      id: 1,
                      settingKey: "app_emergency_stop",
                      settingValue: settingValueStr,
                      settingType: "json",
                      description: null,
                      isLocked: false,
                      updatedBy: null,
                      updatedAt: new Date(),
                    },
                  ]
            ),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        onDuplicateKeyUpdate: () => Promise.resolve(),
      }),
    }),
  } as unknown as Awaited<ReturnType<typeof getDb>>;
}

describe("emergencyStopService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(appendChainedAudit).mockResolvedValue({
      sequenceNumber: 1,
      rowHash: "abc",
    });
    _testOnlyInvalidateCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("readFlag returns active=false when flag row is absent", async () => {
    mockGetDb.mockResolvedValue(makeSelectResult(null));
    const flag = await readFlag();
    expect(flag.active).toBe(false);
    expect(flag.reason).toBeNull();
  });

  it("readFlag returns active=false when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(null);
    const flag = await readFlag();
    expect(flag.active).toBe(false);
  });

  it("readFlag returns active=true when flag is set", async () => {
    const payload = {
      active: true,
      reason: "incident",
      activated_at: "2026-05-13T00:00:00.000Z",
    };
    mockGetDb.mockResolvedValue(makeSelectResult(JSON.stringify(payload)));
    const flag = await readFlag();
    expect(flag.active).toBe(true);
    expect(flag.reason).toBe("incident");
    expect(flag.activatedAt).toBeInstanceOf(Date);
  });

  it("readFlag uses cache on second call within TTL", async () => {
    mockGetDb.mockResolvedValue(makeSelectResult(null));
    await readFlag(); // primes cache
    await readFlag(); // should use cache
    expect(mockGetDb).toHaveBeenCalledTimes(1);
  });

  it("setFlag throws when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(null);
    await expect(setFlag(true, "test", null)).rejects.toThrow("DB unavailable");
  });

  it("setFlag writes correct key and JSON payload shape", async () => {
    const insertValues = vi.fn().mockReturnValue({
      onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
    });
    const mockInsert = vi.fn().mockReturnValue({ values: insertValues });
    const mockDb = { insert: mockInsert } as unknown as Awaited<
      ReturnType<typeof getDb>
    >;
    mockGetDb.mockResolvedValue(mockDb);

    await setFlag(true, "planned maintenance", 42);

    expect(mockInsert).toHaveBeenCalled();
    const arg = insertValues.mock.calls[0][0] as {
      settingKey: string;
      settingValue: string;
    };
    expect(arg.settingKey).toBe("app_emergency_stop");
    const parsed = JSON.parse(arg.settingValue) as {
      active: boolean;
      reason: string | null;
    };
    expect(parsed.active).toBe(true);
    expect(parsed.reason).toBe("planned maintenance");
  });
});

describe("appRouter wiring sanity", () => {
  it("appRouter exports cart, orders, and prescriptions namespaces", async () => {
    const { appRouter } = await import("./routers");
    const defs = appRouter._def as unknown as {
      record: Record<string, unknown>;
    };
    expect(defs.record.cart).toBeDefined();
    expect(defs.record.orders).toBeDefined();
    expect(defs.record.prescriptions).toBeDefined();
  });
});
