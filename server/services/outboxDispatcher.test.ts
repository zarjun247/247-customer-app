import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  getRegisteredKinds,
  pollOnce,
  registerOutboxHandler,
  startOutboxDispatcher,
  stopOutboxDispatcher,
  unregisterAllHandlers,
} from "./outboxDispatcher";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSelect, mockUpdate, mockDb } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();
  const mockDb = { select: mockSelect, update: mockUpdate };
  return { mockSelect, mockUpdate, mockDb };
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    commandLogId: "cmd-1",
    sideEffectKind: "test.kind",
    sideEffectPayload: { foo: "bar" },
    state: "pending",
    attempts: 0,
    maxAttempts: 3,
    nextAttemptAt: new Date(Date.now() - 1000),
    lastErrorMessage: null,
    createdAt: new Date(),
    dispatchedAt: null,
    failedAt: null,
    ...overrides,
  };
}

function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function makeUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  unregisterAllHandlers();
  stopOutboxDispatcher();
  vi.useFakeTimers();
});

afterEach(() => {
  stopOutboxDispatcher();
  unregisterAllHandlers();
  vi.useRealTimers();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("outboxDispatcher", () => {
  // Test 1: Handler registered and called for matching kind
  it("registered handler is called for matching kind", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerOutboxHandler("test.kind", handler);
    mockSelect.mockReturnValue(makeSelectChain([makeRow()]));
    mockUpdate.mockReturnValue(makeUpdateChain());

    const result = await pollOnce();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      { foo: "bar" },
      { commandLogId: "cmd-1", attempts: 1 },
    );
    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
  });

  // Test 2: Unknown kind logged and skipped
  it("unknown kind is skipped without calling any handler", async () => {
    mockSelect.mockReturnValue(makeSelectChain([makeRow({ sideEffectKind: "unknown.kind" })]));
    mockUpdate.mockReturnValue(makeUpdateChain());

    const result = await pollOnce();

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  // Test 3: Successful dispatch updates state to dispatched
  it("successful dispatch sets state to dispatched", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerOutboxHandler("test.kind", handler);
    mockSelect.mockReturnValue(makeSelectChain([makeRow()]));

    const capturedSets: any[] = [];
    mockUpdate.mockImplementation(() => ({
      set: vi.fn().mockImplementation((s: any) => {
        capturedSets.push(s);
        return { where: vi.fn().mockResolvedValue([{}]) };
      }),
    }));

    await pollOnce();

    expect(capturedSets.some((s) => s.state === "dispatched")).toBe(true);
  });

  // Test 4: Failed dispatch increments attempts
  it("failed dispatch increments attempts", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("send failed"));
    registerOutboxHandler("test.kind", handler);
    mockSelect.mockReturnValue(makeSelectChain([makeRow({ attempts: 0, maxAttempts: 3 })]));

    const capturedSets: any[] = [];
    mockUpdate.mockImplementation(() => ({
      set: vi.fn().mockImplementation((s: any) => {
        capturedSets.push(s);
        return { where: vi.fn().mockResolvedValue([{}]) };
      }),
    }));

    const result = await pollOnce();

    expect(result.failed).toBe(1);
    const updateSet = capturedSets[0];
    expect(updateSet.attempts).toBe(1);
    expect(updateSet.lastErrorMessage).toBe("send failed");
  });

  // Test 5: Failed dispatch with attempts < maxAttempts — nextAttemptAt advances
  it("failed dispatch with attempts < maxAttempts advances nextAttemptAt", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("timeout"));
    registerOutboxHandler("test.kind", handler);
    mockSelect.mockReturnValue(makeSelectChain([makeRow({ attempts: 1, maxAttempts: 5 })]));

    const capturedSets: any[] = [];
    mockUpdate.mockImplementation(() => ({
      set: vi.fn().mockImplementation((s: any) => {
        capturedSets.push(s);
        return { where: vi.fn().mockResolvedValue([{}]) };
      }),
    }));

    const before = Date.now();
    await pollOnce();
    const after = Date.now();

    const updateSet = capturedSets[0];
    expect(updateSet.nextAttemptAt).toBeDefined();
    expect(updateSet.nextAttemptAt.getTime()).toBeGreaterThan(before);
    // Exponential backoff: 2^2 * 1000 = 4000ms for attempt #2
    expect(updateSet.nextAttemptAt.getTime()).toBeLessThanOrEqual(after + 4_001);
  });

  // Test 6: Failed dispatch with attempts >= maxAttempts → state goes to failed
  it("exhausted attempts moves state to failed", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("permanent error"));
    registerOutboxHandler("test.kind", handler);
    // attempts=2, maxAttempts=3 → this is attempt #3, which reaches maxAttempts
    mockSelect.mockReturnValue(makeSelectChain([makeRow({ attempts: 2, maxAttempts: 3 })]));

    const capturedSets: any[] = [];
    mockUpdate.mockImplementation(() => ({
      set: vi.fn().mockImplementation((s: any) => {
        capturedSets.push(s);
        return { where: vi.fn().mockResolvedValue([{}]) };
      }),
    }));

    await pollOnce();

    expect(capturedSets.some((s) => s.state === "failed")).toBe(true);
    const failSet = capturedSets.find((s) => s.state === "failed");
    expect(failSet?.failedAt).toBeInstanceOf(Date);
  });

  // Test 7: Batch size is respected
  it("batch size is respected (OUTBOX_BATCH_SIZE)", async () => {
    process.env.OUTBOX_BATCH_SIZE = "2";
    const rows = [makeRow({ id: "r1" }), makeRow({ id: "r2" })];
    mockSelect.mockReturnValue(makeSelectChain(rows));
    mockUpdate.mockReturnValue(makeUpdateChain());

    const limitCapture: number[] = [];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockImplementation((n: number) => {
        limitCapture.push(n);
        return Promise.resolve(rows);
      }),
    };
    mockSelect.mockReturnValue(chain);

    await pollOnce();

    expect(limitCapture[0]).toBe(2);
    delete process.env.OUTBOX_BATCH_SIZE;
  });

  // Test 8: Only rows with nextAttemptAt <= now are picked up
  it("rows with nextAttemptAt in the future are not fetched", async () => {
    // The select chain with filtering is what matters — we verify the where clause
    // is applied correctly by mocking the DB to return no rows (simulating filter)
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockUpdate.mockReturnValue(makeUpdateChain());

    const result = await pollOnce();

    expect(result.processed).toBe(0);
    // Confirm .where was called (i.e., filter is applied)
    const chain = mockSelect.mock.results[0]?.value;
    expect(chain.where).toHaveBeenCalled();
  });

  // Test 9: Concurrent pollOnce — second call is no-op
  it("concurrent pollOnce calls are guarded by isPolling", async () => {
    let resolveFirst!: () => void;
    const firstPollPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    mockSelect.mockReturnValue(makeSelectChain([]));

    // First call: hangs until we release
    const slowHandler = vi.fn().mockImplementation(() => firstPollPromise);

    // Override getDb to return a slow db
    let firstCall = true;
    mockSelect.mockImplementation(() => {
      if (firstCall) {
        firstCall = false;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(() => firstPollPromise.then(() => [])),
        };
      }
      return makeSelectChain([]);
    });

    const p1 = pollOnce();
    // Second call while first is in progress
    const p2 = pollOnce();
    resolveFirst();

    const [r1, r2] = await Promise.all([p1, p2]);
    // Second call should be a no-op
    expect(r2).toEqual({ processed: 0, succeeded: 0, failed: 0 });
  });

  // Test 10: registerOutboxHandler throws if kind already registered
  it("registerOutboxHandler throws if kind already registered", () => {
    const h = vi.fn();
    registerOutboxHandler("dupe.kind", h);
    expect(() => registerOutboxHandler("dupe.kind", vi.fn())).toThrow(
      'Outbox handler for kind "dupe.kind" already registered',
    );
  });

  // Test 11: startOutboxDispatcher + stopOutboxDispatcher manage the interval
  it("start and stop manage the polling interval", () => {
    process.env.OUTBOX_DISPATCH_ENABLED = "true";
    process.env.OUTBOX_POLL_INTERVAL_MS = "1000";

    mockSelect.mockReturnValue(makeSelectChain([]));

    startOutboxDispatcher();

    // Tick once
    vi.advanceTimersByTime(1001);

    stopOutboxDispatcher();

    const callsBefore = mockSelect.mock.calls.length;

    // Tick again — should not trigger since stopped
    vi.advanceTimersByTime(2000);

    // No additional calls after stop
    expect(mockSelect.mock.calls.length).toBe(callsBefore);

    delete process.env.OUTBOX_DISPATCH_ENABLED;
    delete process.env.OUTBOX_POLL_INTERVAL_MS;
  });

  // Test 12: startOutboxDispatcher is a no-op when env flag is false
  it("startOutboxDispatcher is a no-op when OUTBOX_DISPATCH_ENABLED is false", () => {
    process.env.OUTBOX_DISPATCH_ENABLED = "false";

    startOutboxDispatcher();

    vi.advanceTimersByTime(10_000);

    // DB never queried since dispatcher was not started
    expect(mockSelect).not.toHaveBeenCalled();

    delete process.env.OUTBOX_DISPATCH_ENABLED;
  });

  // Additional: getRegisteredKinds returns registered kinds
  it("getRegisteredKinds returns all registered kinds", () => {
    registerOutboxHandler("a.kind", vi.fn());
    registerOutboxHandler("b.kind", vi.fn());
    const kinds = getRegisteredKinds();
    expect(kinds).toContain("a.kind");
    expect(kinds).toContain("b.kind");
  });
});
