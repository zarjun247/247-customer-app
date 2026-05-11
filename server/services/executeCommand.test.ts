import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _testOnlyCanonicalize,
  CommandInFlightError,
  CommandPriorFailureError,
  IdempotencyMismatchError,
  type CommandContext,
  type CommandResult,
} from "./executeCommand";

// ─── Hoisted mocks (must be above vi.mock calls) ──────────────────────────────

const { mockInsert, mockUpdate, mockSelect, mockTransaction, mockDb } =
  vi.hoisted(() => {
    const mockInsert = vi.fn();
    const mockUpdate = vi.fn();
    const mockSelect = vi.fn();
    const mockTransaction = vi.fn();
    const mockDb = {
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      transaction: mockTransaction,
    };
    return { mockInsert, mockUpdate, mockSelect, mockTransaction, mockDb };
  });

const { mockEmitSloEvent } = vi.hoisted(() => ({
  mockEmitSloEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("./sloService", () => ({
  emitSloEvent: mockEmitSloEvent,
  SLO_DEFINITIONS: [
    {
      name: "trpc.sale.confirm.p99",
      target: 0.99,
      windowSeconds: 60,
      description: "Sale confirm",
    },
  ],
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseCtx: CommandContext = {
  actorUserId: "user-1",
  actorRole: "cashier",
  storeId: "store-1",
  traceId: "trace-abc",
};

function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function makeInsertChain() {
  return {
    values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  };
}

function makeUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  };
}

function hashInput(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(_testOnlyCanonicalize(input)))
    .digest("hex");
}

async function runCommand<T>(
  handlerFn: () => Promise<CommandResult<T>>,
  overrides?: {
    name?: string;
    idempotencyKey?: string;
    input?: unknown;
    sloName?: string;
  },
) {
  const { executeCommand } = await import("./executeCommand");
  return executeCommand({
    name: overrides?.name ?? "test.command",
    version: 1,
    idempotencyKey: overrides?.idempotencyKey ?? "test-key-1",
    input: overrides?.input ?? { foo: "bar" },
    context: baseCtx,
    handler: async (_input, _tx, _ctx) => handlerFn(),
    sloName: overrides?.sloName,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("executeCommand", () => {
  // Test 1: New command — runs handler, writes log, returns output
  it("new command: runs handler and returns output", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockInsert.mockReturnValue(makeInsertChain());
    mockUpdate.mockReturnValue(makeUpdateChain());
    mockTransaction.mockImplementation(async (fn: any) => fn(mockDb));

    const output = { ok: true, saleId: "s1" };
    const result = await runCommand(async () => ({ output, sideEffects: [] }));

    expect(result).toEqual(output);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockTransaction).toHaveBeenCalled();
  });

  // Test 2: Replay of completed command with same input → returns cached output
  it("replay of completed command with same input returns prior output", async () => {
    const input = { foo: "bar" };
    const priorOutput = { ok: true, billNo: "B001" };

    mockSelect.mockReturnValue(
      makeSelectChain([
        {
          id: "existing-cmd-id",
          state: "completed",
          inputHash: hashInput(input),
          outputPayload: priorOutput,
          startedAt: new Date(),
          errorMessage: null,
        },
      ]),
    );

    const handlerSpy = vi.fn();
    const { executeCommand } = await import("./executeCommand");
    const result = await executeCommand({
      name: "test.command",
      version: 1,
      idempotencyKey: "test-key-1",
      input,
      context: baseCtx,
      handler: async () => {
        handlerSpy();
        return { output: { different: true }, sideEffects: [] };
      },
    });

    expect(result).toEqual(priorOutput);
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  // Test 3: Replay with DIFFERENT input hash → throws IdempotencyMismatchError
  it("replay with different input hash throws IdempotencyMismatchError", async () => {
    mockSelect.mockReturnValue(
      makeSelectChain([
        {
          id: "cmd-id",
          state: "completed",
          inputHash: "completely-different-hash",
          outputPayload: {},
          startedAt: new Date(),
          errorMessage: null,
        },
      ]),
    );

    await expect(
      runCommand(async () => ({ output: {}, sideEffects: [] })),
    ).rejects.toThrow(IdempotencyMismatchError);
  });

  // Test 4: Replay of in-flight command → throws CommandInFlightError
  it("replay of in-flight command throws CommandInFlightError", async () => {
    const input = { foo: "bar" };
    mockSelect.mockReturnValue(
      makeSelectChain([
        {
          id: "cmd-id",
          state: "in_flight",
          inputHash: hashInput(input),
          startedAt: new Date(),
          errorMessage: null,
        },
      ]),
    );

    await expect(
      runCommand(async () => ({ output: {}, sideEffects: [] }), { input }),
    ).rejects.toThrow(CommandInFlightError);
  });

  // Test 5: Replay of failed command → throws CommandPriorFailureError
  it("replay of failed command throws CommandPriorFailureError", async () => {
    const input = { foo: "bar" };
    mockSelect.mockReturnValue(
      makeSelectChain([
        {
          id: "cmd-id",
          state: "failed",
          inputHash: hashInput(input),
          startedAt: new Date(),
          errorMessage: "Stock insufficient",
        },
      ]),
    );

    await expect(
      runCommand(async () => ({ output: {}, sideEffects: [] }), { input }),
    ).rejects.toThrow(CommandPriorFailureError);
  });

  // Test 6: Handler throws → command_log marked as failed
  it("handler that throws marks command_log as failed", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockInsert.mockReturnValue(makeInsertChain());
    mockUpdate.mockReturnValue(makeUpdateChain());
    mockTransaction.mockImplementation(async () => {
      throw new Error("Stock error");
    });

    await expect(
      runCommand(async () => ({ output: {}, sideEffects: [] })),
    ).rejects.toThrow("Stock error");

    // update should have been called to mark the command as failed
    expect(mockUpdate).toHaveBeenCalled();
  });

  // Test 7: Handler throws AFTER side-effect — transaction rolls back, nothing enqueued outside
  it("transaction error leaves command in failed state after rollback", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockInsert.mockReturnValue(makeInsertChain());
    mockUpdate.mockReturnValue(makeUpdateChain());
    // Simulate the transaction throwing (rollback)
    mockTransaction.mockImplementation(async () => {
      throw new Error("handler exploded mid-transaction");
    });

    await expect(
      runCommand(async () => ({ output: {}, sideEffects: [] })),
    ).rejects.toThrow("handler exploded mid-transaction");

    // Should have attempted to mark as failed via update (outside tx)
    expect(mockUpdate).toHaveBeenCalled();
  });

  // Test 8: Side effects enqueued atomically with completion inside transaction
  it("side effects and completion are enqueued inside same transaction", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockInsert.mockReturnValue(makeInsertChain());
    mockUpdate.mockReturnValue(makeUpdateChain());

    const txInsertKinds: string[] = [];
    let txCompletionSet: any = null;

    mockTransaction.mockImplementation(async (fn: any) => {
      const fakeTx = {
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((v: any) => {
            if (v.sideEffectKind) txInsertKinds.push(v.sideEffectKind);
            return Promise.resolve([{}]);
          }),
        })),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation((s: any) => {
            txCompletionSet = s;
            return { where: vi.fn().mockResolvedValue([{}]) };
          }),
        })),
      };
      return fn(fakeTx);
    });

    await runCommand(async () => ({
      output: { ok: true },
      sideEffects: [{ kind: "whatsapp.sale-confirmation", payload: { saleId: "s1" } }],
    }));

    expect(txInsertKinds).toContain("whatsapp.sale-confirmation");
    expect(txCompletionSet?.state).toBe("completed");
  });

  // Test 9: SLO event emitted on success
  it("SLO event emitted on success with withinBudget=true", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockInsert.mockReturnValue(makeInsertChain());
    mockUpdate.mockReturnValue(makeUpdateChain());
    mockTransaction.mockImplementation(async (fn: any) => fn(mockDb));

    await runCommand(
      async () => ({ output: {}, sideEffects: [] }),
      { sloName: "trpc.sale.confirm.p99" },
    );

    // emitSloEvent is fire-and-forget, wait for it
    await new Promise((r) => setTimeout(r, 10));
    expect(mockEmitSloEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sloName: "trpc.sale.confirm.p99",
        withinBudget: true,
      }),
    );
  });

  // Test 10: SLO event emitted on failure with withinBudget=false
  it("SLO event emitted on failure with withinBudget=false", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockInsert.mockReturnValue(makeInsertChain());
    mockUpdate.mockReturnValue(makeUpdateChain());
    mockTransaction.mockImplementation(async () => {
      throw new Error("payment failed");
    });

    await expect(
      runCommand(
        async () => ({ output: {}, sideEffects: [] }),
        { sloName: "trpc.sale.confirm.p99" },
      ),
    ).rejects.toThrow();

    await new Promise((r) => setTimeout(r, 10));
    expect(mockEmitSloEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sloName: "trpc.sale.confirm.p99",
        withinBudget: false,
      }),
    );
  });

  // Test 11: Canonicalization — key order doesn't affect hash
  it("canonicalize: {a:1,b:2} and {b:2,a:1} produce the same hash", () => {
    const h1 = hashInput({ a: 1, b: 2 });
    const h2 = hashInput({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });

  // Test 12: Canonicalization — nested objects
  it("canonicalize: nested objects sorted consistently", () => {
    const h1 = hashInput({ z: { b: 2, a: 1 }, a: [3, 2, 1] });
    const h2 = hashInput({ a: [3, 2, 1], z: { a: 1, b: 2 } });
    expect(h1).toBe(h2);
  });

  // Test 13: Concurrent calls — second sees in_flight, throws CommandInFlightError
  it("second concurrent call with same key throws CommandInFlightError", async () => {
    const input = { saleId: "s2" };
    mockSelect.mockReturnValue(
      makeSelectChain([
        {
          id: "cmd-id",
          state: "in_flight",
          inputHash: hashInput(input),
          startedAt: new Date(),
          errorMessage: null,
        },
      ]),
    );

    const { executeCommand } = await import("./executeCommand");
    await expect(
      executeCommand({
        name: "test.command",
        version: 1,
        idempotencyKey: "concurrent-key",
        input,
        context: baseCtx,
        handler: async () => ({ output: {}, sideEffects: [] }),
      }),
    ).rejects.toThrow(CommandInFlightError);
  });

  // Test 14: Output payload stored in command_log on completion
  it("output payload is stored in command_log on success", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));
    mockInsert.mockReturnValue(makeInsertChain());

    let capturedCompletionSet: any = null;
    mockTransaction.mockImplementation(async (fn: any) => {
      const fakeTx = {
        insert: vi.fn().mockResolvedValue([{}]),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation((s: any) => {
            capturedCompletionSet = s;
            return { where: vi.fn().mockResolvedValue([{}]) };
          }),
        })),
      };
      return fn(fakeTx);
    });
    mockUpdate.mockReturnValue(makeUpdateChain());

    const output = { billNo: "B-999", total: "1500.00" };
    await runCommand(async () => ({ output, sideEffects: [] }));

    expect(capturedCompletionSet?.outputPayload).toEqual(output);
  });

  // Test 15: Trace ID from context stored in command_log insert
  it("trace ID from context is stored in command_log insert", async () => {
    mockSelect.mockReturnValue(makeSelectChain([]));

    const insertedValues: any[] = [];
    mockInsert.mockImplementation(() => ({
      values: vi.fn().mockImplementation((v: any) => {
        insertedValues.push(v);
        return Promise.resolve([{}]);
      }),
    }));
    mockUpdate.mockReturnValue(makeUpdateChain());
    mockTransaction.mockImplementation(async (fn: any) => fn(mockDb));

    const { executeCommand } = await import("./executeCommand");
    await executeCommand({
      name: "test.command",
      version: 1,
      idempotencyKey: "trace-key",
      input: { x: 1 },
      context: { ...baseCtx, traceId: "trace-xyz-999" },
      handler: async () => ({ output: { ok: true }, sideEffects: [] }),
    });

    const logRow = insertedValues.find((v: any) => v.traceId !== undefined);
    expect(logRow?.traceId).toBe("trace-xyz-999");
  });
});
