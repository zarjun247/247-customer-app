import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  sweepOnce,
  startReservationExpiryWorker,
  stopReservationExpiryWorker,
} from "./reservationExpiryWorker";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSelect, mockDb } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockDb = { select: mockSelect };
  return { mockSelect, mockDb };
});

const { mockExpire } = vi.hoisted(() => ({
  mockExpire: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("./reservationLedger", () => ({
  expire: mockExpire,
}));

vi.mock("../_core/env", () => ({
  ENV: {
    reservationExpirySweepIntervalMs: 30_000,
    reservationExpiryBatchSize: 100,
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExpiredReservation(id: string) {
  return {
    id,
    storeId: 1,
    state: "active",
    expiresAt: new Date(Date.now() - 5_000),
  };
}

function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("sweepOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero counts when no expired reservations", async () => {
    mockSelect.mockReturnValueOnce(makeSelectChain([]));

    const result = await sweepOnce();
    expect(result.swept).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("expires found reservations and returns counts", async () => {
    const expiredRes = makeExpiredReservation("res-expired-1");
    mockSelect.mockReturnValueOnce(makeSelectChain([expiredRes]));
    mockExpire.mockResolvedValue({ reservationId: "res-expired-1", expiredAt: new Date() });

    const result = await sweepOnce();
    expect(result.swept).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockExpire).toHaveBeenCalledWith(
      expect.objectContaining({ reservationId: "res-expired-1" }),
      expect.objectContaining({ actorRole: "system" }),
    );
  });

  it("counts failures without crashing", async () => {
    const expiredRes = makeExpiredReservation("res-fail");
    mockSelect.mockReturnValueOnce(makeSelectChain([expiredRes]));
    mockExpire.mockRejectedValue(new Error("expire error"));

    const result = await sweepOnce();
    expect(result.swept).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("handles multiple reservations: some succeed, some fail", async () => {
    const r1 = makeExpiredReservation("r1");
    const r2 = makeExpiredReservation("r2");
    const r3 = makeExpiredReservation("r3");
    mockSelect.mockReturnValueOnce(makeSelectChain([r1, r2, r3]));

    mockExpire
      .mockResolvedValueOnce({ reservationId: "r1", expiredAt: new Date() })
      .mockRejectedValueOnce(new Error("r2 fail"))
      .mockResolvedValueOnce({ reservationId: "r3", expiredAt: new Date() });

    const result = await sweepOnce();
    expect(result.swept).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
  });

  it("is non-reentrant (second call while first is running returns zeros)", async () => {
    // Simulate a slow first sweep by making expire hang
    let resolveFirst!: () => void;
    const slowExpire = new Promise<void>((r) => { resolveFirst = r; });

    mockSelect.mockReturnValueOnce(makeSelectChain([makeExpiredReservation("slow")]));
    mockExpire.mockReturnValueOnce(slowExpire.then(() => ({ reservationId: "slow", expiredAt: new Date() })));

    // Start first sweep (don't await yet)
    const firstSweep = sweepOnce();

    // Start second sweep immediately
    mockSelect.mockReturnValueOnce(makeSelectChain([makeExpiredReservation("second")]));
    const secondResult = await sweepOnce();

    // Second should be a no-op (isPolling guard)
    expect(secondResult.swept).toBe(0);

    // Resolve the first sweep
    resolveFirst();
    const firstResult = await firstSweep;
    expect(firstResult.swept).toBe(1);
  });
});

describe("startReservationExpiryWorker / stopReservationExpiryWorker", () => {
  afterEach(() => {
    stopReservationExpiryWorker();
  });

  it("start/stop does not throw", () => {
    expect(() => startReservationExpiryWorker()).not.toThrow();
    expect(() => stopReservationExpiryWorker()).not.toThrow();
  });

  it("calling start twice is idempotent (no duplicate timers)", () => {
    startReservationExpiryWorker();
    startReservationExpiryWorker(); // should not start a second timer
    stopReservationExpiryWorker();
  });
});
