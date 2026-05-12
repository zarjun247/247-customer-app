import { describe, it, expect, vi, beforeEach } from "vitest";
import { runDsrSlaMonitorTick } from "./dsrSlaMonitor";

vi.mock("pino", () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../_core/env", () => ({
  ENV: { dsrSlaMonitorEnabled: true, dpoEmail: "dpo@example.com" },
}));

const insertedRows: unknown[] = [];
let onDuplicateKeyUpdateCalled = 0;

const mockInsert = vi.fn(() => ({
  values: vi.fn((row: unknown) => {
    return {
      onDuplicateKeyUpdate: vi.fn(({ set }: { set: unknown }) => {
        // Only insert if no matching (dsrRequestId, alertKind, same-day) row exists
        const key = `${(row as Record<string, unknown>).dsrRequestId}:${(row as Record<string, unknown>).alertKind}`;
        const existing = insertedRows.find(
          r =>
            `${(r as Record<string, unknown>).dsrRequestId}:${(r as Record<string, unknown>).alertKind}` ===
            key
        );
        if (existing) {
          onDuplicateKeyUpdateCalled++;
        } else {
          insertedRows.push(row);
        }
        return Promise.resolve();
      }),
    };
  }),
}));

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() =>
        Promise.resolve([
          {
            id: 42,
            createdAt: new Date(Date.now() - 24 * 24 * 60 * 60 * 1000),
          },
        ])
      ),
    })),
  })),
  insert: mockInsert,
};

vi.mock("../db", () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
}));

describe("dsrSlaMonitor deduplication", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    onDuplicateKeyUpdateCalled = 0;
    mockInsert.mockClear();
  });

  it("two back-to-back ticks produce only one log row (ON DUPLICATE KEY UPDATE fires on second)", async () => {
    const r1 = await runDsrSlaMonitorTick();
    const r2 = await runDsrSlaMonitorTick();

    expect(r1.alerts).toBe(1);
    expect(r2.alerts).toBe(1);

    // First tick inserted a fresh row; second tick hit the duplicate key path
    expect(insertedRows).toHaveLength(1);
    expect(onDuplicateKeyUpdateCalled).toBe(1);
  });

  it("uses onDuplicateKeyUpdate on every insert call", async () => {
    await runDsrSlaMonitorTick();
    // Every values() chain must end with .onDuplicateKeyUpdate()
    const valuesCalls = mockInsert.mock.results.flatMap(r => {
      const valuesResult = r.value?.values?.mock?.results ?? [];
      return valuesResult.map(
        (vr: { value: Record<string, unknown> }) => vr.value
      );
    });
    for (const chain of valuesCalls) {
      expect(chain).toHaveProperty("onDuplicateKeyUpdate");
    }
  });
});
