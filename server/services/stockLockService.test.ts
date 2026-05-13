import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acquireLock,
  releaseLock,
  withLock,
  cleanupExpiredLocks,
  makeLockKey,
  LockAcquisitionFailedError,
} from "./stockLockService";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockInsert, mockDelete, mockSelect, mockDb } = vi.hoisted(() => {
  const mockInsert = vi.fn();
  const mockDelete = vi.fn();
  const mockSelect = vi.fn();
  const mockDb = { insert: mockInsert, delete: mockDelete, select: mockSelect };
  return { mockInsert, mockDelete, mockSelect, mockDb };
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("../_core/env", () => ({
  ENV: { stockLockTimeoutMs: 200 }, // short timeout for tests
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInsertSuccess() {
  return { values: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
}

function makeInsertConflict() {
  return {
    values: vi.fn().mockRejectedValue(new Error("Duplicate entry")),
  };
}

function makeDeleteChain() {
  return { where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
}

function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("acquireLock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acquires a lock on first insert attempt", async () => {
    mockInsert.mockReturnValue(makeInsertSuccess());

    const lock = await acquireLock("stock:1:42", 500);

    expect(lock.lockKey).toBe("stock:1:42");
    expect(lock.acquiredBy).toBeTruthy();
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("cleans up a stale lock and retries", async () => {
    const expiredLock = {
      lockKey: "stock:1:42",
      acquiredBy: "old-request",
      acquiredAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() - 1_000), // expired
    };

    // First attempt: conflict; second: success
    mockInsert
      .mockReturnValueOnce(makeInsertConflict())
      .mockReturnValue(makeInsertSuccess());
    mockSelect.mockReturnValue(makeSelectChain([expiredLock]));
    mockDelete.mockReturnValue(makeDeleteChain());

    const lock = await acquireLock("stock:1:42", 1000);
    expect(lock.lockKey).toBe("stock:1:42");
  });

  it("throws LockAcquisitionFailedError after timeout", async () => {
    const liveLock = {
      lockKey: "stock:1:42",
      acquiredBy: "other-request",
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000), // not expired
    };

    mockInsert.mockReturnValue(makeInsertConflict());
    mockSelect.mockReturnValue(makeSelectChain([liveLock]));

    await expect(acquireLock("stock:1:42", 150)).rejects.toThrow(
      LockAcquisitionFailedError
    );
  });
});

describe("releaseLock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the lock row", async () => {
    mockDelete.mockReturnValue(makeDeleteChain());
    await releaseLock("stock:1:42", "my-request-id");
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});

describe("withLock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runs fn and releases lock afterward", async () => {
    mockInsert.mockReturnValue(makeInsertSuccess());
    mockDelete.mockReturnValue(makeDeleteChain());

    let ran = false;
    await withLock("stock:1:42", async () => {
      ran = true;
      return "result";
    });

    expect(ran).toBe(true);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("releases lock even if fn throws", async () => {
    mockInsert.mockReturnValue(makeInsertSuccess());
    mockDelete.mockReturnValue(makeDeleteChain());

    await expect(
      withLock("stock:1:42", async () => {
        throw new Error("fn error");
      })
    ).rejects.toThrow("fn error");

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});

describe("cleanupExpiredLocks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes expired lock rows and returns count", async () => {
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue([{ affectedRows: 3 }]),
    });

    const count = await cleanupExpiredLocks();
    expect(count).toBe(3);
  });
});

describe("makeLockKey", () => {
  it("generates key without variantId", () => {
    expect(makeLockKey(1, 42)).toBe("stock:1:42");
  });

  it("generates key with variantId", () => {
    expect(makeLockKey(1, 42, 5)).toBe("stock:1:42:5");
  });

  it("generates key with null variantId (treated as no variant)", () => {
    expect(makeLockKey(1, 42, null)).toBe("stock:1:42");
  });
});
