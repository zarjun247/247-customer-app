import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCommandLog,
  getCommandStats,
  listCommandLogs,
} from "./commandLogService";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSelect, mockDb } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockDb = { select: mockSelect };
  return { mockSelect, mockDb };
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmd-1",
    idempotencyKey: "sale:confirm:s1",
    commandName: "sale.confirmSale",
    commandVersion: 1,
    actorUserId: "user-1",
    actorRole: "cashier",
    storeId: "store-1",
    inputHash: "abc123",
    inputPayload: { saleId: "s1" },
    outputPayload: { ok: true },
    state: "completed",
    errorClass: null,
    errorMessage: null,
    startedAt: new Date(),
    completedAt: new Date(),
    durationMs: 42,
    traceId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("commandLogService", () => {
  describe("listCommandLogs", () => {
    it("returns records and total", async () => {
      const record = makeRecord();
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          offset: vi.fn().mockResolvedValue([record]),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        });

      const result = await listCommandLogs({});

      expect(result.records).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("filters by commandName", async () => {
      const record = makeRecord({ commandName: "sale.confirmSale" });
      const whereCapture: unknown[] = [];
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockImplementation((w: unknown) => {
            whereCapture.push(w);
            return {
              orderBy: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              offset: vi.fn().mockResolvedValue([record]),
            };
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ total: 1 }]),
        });

      await listCommandLogs({ commandName: "sale.confirmSale" });
      expect(whereCapture[0]).toBeDefined();
    });

    it("returns empty when db unavailable", async () => {
      const { getDb } = await import("../db");
      vi.mocked(getDb).mockResolvedValueOnce(null);
      const result = await listCommandLogs({});
      expect(result).toEqual({ records: [], total: 0 });
    });
  });

  describe("getCommandLog", () => {
    it("returns the record for a known id", async () => {
      const record = makeRecord({ id: "cmd-known" });
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([record]),
      });

      const result = await getCommandLog("cmd-known");
      expect(result).toEqual(record);
    });

    it("returns null when not found", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      });

      const result = await getCommandLog("nonexistent");
      expect(result).toBeNull();
    });

    it("returns null when db unavailable", async () => {
      const { getDb } = await import("../db");
      vi.mocked(getDb).mockResolvedValueOnce(null);
      const result = await getCommandLog("any-id");
      expect(result).toBeNull();
    });
  });

  describe("getCommandStats", () => {
    it("returns aggregated stats", async () => {
      mockSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi
            .fn()
            .mockResolvedValue([
              { total: 10, completed: 8, failed: 1, inFlight: 1 },
            ]),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockResolvedValue([
            { name: "sale.confirmSale", total: 8, failed: 0 },
            { name: "purchase.commitInvoice", total: 2, failed: 1 },
          ]),
        });

      const stats = await getCommandStats(24);

      expect(stats.total).toBe(10);
      expect(stats.completed).toBe(8);
      expect(stats.failed).toBe(1);
      expect(stats.inFlight).toBe(1);
      expect(stats.byCommandName).toHaveLength(2);
      expect(stats.byCommandName[0]).toMatchObject({
        name: "sale.confirmSale",
        count: 8,
        failureRate: 0,
      });
      expect(stats.byCommandName[1].failureRate).toBeCloseTo(0.5);
    });

    it("returns zero stats when db unavailable", async () => {
      const { getDb } = await import("../db");
      vi.mocked(getDb).mockResolvedValueOnce(null);
      const stats = await getCommandStats();
      expect(stats.total).toBe(0);
    });
  });
});
