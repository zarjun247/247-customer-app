import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import {
  canonicalize,
  appendChainedAudit,
  verifyChain,
  getChainStats,
} from "./auditHashChain";

// ─── Mock DB ──────────────────────────────────────────────────────────────────

let chainRows: Array<{
  id: number;
  auditLogId: number | null;
  sequenceNumber: number;
  prevHash: string;
  rowHash: string;
  hashedPayload: unknown;
  createdAt: Date;
}> = [];

let seqCounter = 0;

function makeGenesisRow() {
  const genesisHash = createHash("sha256")
    .update("genesis:247-customer-app:2026-05-11")
    .digest("hex");
  return {
    id: 0,
    auditLogId: null,
    sequenceNumber: 0,
    prevHash:
      "0000000000000000000000000000000000000000000000000000000000000000",
    rowHash: genesisHash,
    hashedPayload: { kind: "genesis", note: "chain start" },
    createdAt: new Date("2026-05-11T00:00:00Z"),
  };
}

function mockDb() {
  const selectChain = {
    orderBy: (col?: unknown) => {
      const isDesc = col && typeof col === "object" && "queryChunks" in col;
      return {
        limit: (n: number) => {
          const sorted = [...chainRows].sort((a, b) =>
            isDesc
              ? b.sequenceNumber - a.sequenceNumber
              : a.sequenceNumber - b.sequenceNumber
          );
          return Promise.resolve(sorted.slice(0, n));
        },
      };
    },
  };

  return {
    select: (_fields?: unknown) => ({
      from: (_table?: unknown) => selectChain,
    }),
    insert: (_table?: unknown) => ({
      values: (row: {
        auditLogId: number | null;
        sequenceNumber: number;
        prevHash: string;
        rowHash: string;
        hashedPayload: unknown;
      }) => {
        if (chainRows.some(r => r.sequenceNumber === row.sequenceNumber)) {
          const err = new Error(
            "Duplicate entry for key 'uq_audit_chain_sequence'"
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (err as any).code = "ER_DUP_ENTRY";
          return Promise.reject(err);
        }
        chainRows.push({
          id: ++seqCounter,
          auditLogId: row.auditLogId,
          sequenceNumber: row.sequenceNumber,
          prevHash: row.prevHash,
          rowHash: row.rowHash,
          hashedPayload: row.hashedPayload,
          createdAt: new Date(),
        });
        return Promise.resolve();
      },
    }),
  };
}

vi.mock("../db", () => ({ getDb: vi.fn(() => Promise.resolve(mockDb())) }));

// ─── Helper ───────────────────────────────────────────────────────────────────

function computeHash(prevHash: string, payload: unknown): string {
  return createHash("sha256")
    .update(prevHash + JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  chainRows = [makeGenesisRow()];
  seqCounter = 1;
});

describe("canonicalize", () => {
  it("returns primitives as-is", () => {
    expect(canonicalize(42)).toBe(42);
    expect(canonicalize("hello")).toBe("hello");
    expect(canonicalize(null)).toBeNull();
  });

  it("sorts object keys", () => {
    const result = canonicalize({ z: 1, a: 2 });
    expect(JSON.stringify(result)).toBe('{"a":2,"z":1}');
  });

  it("sorts nested object keys consistently", () => {
    const result = canonicalize({ b: { z: 1, a: 2 }, a: 3 });
    expect(JSON.stringify(result)).toBe('{"a":3,"b":{"a":2,"z":1}}');
  });

  it("handles arrays without reordering elements", () => {
    const result = canonicalize([{ z: 1, a: 2 }, { b: 3 }]);
    expect(JSON.stringify(result)).toBe('[{"a":2,"z":1},{"b":3}]');
  });

  it("same payload with different key order produces identical JSON", () => {
    const a = canonicalize({ z: 1, a: 2, m: 3 });
    const b = canonicalize({ a: 2, m: 3, z: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("appendChainedAudit", () => {
  it("first append: prev_hash = genesis row_hash, sequence = 1", async () => {
    const genesisRow = chainRows[0];
    const result = await appendChainedAudit({
      action: "test.action",
      entityType: "order",
      entityId: 42,
      actorUserId: 1,
    });
    expect(result.sequenceNumber).toBe(1);
    const insertedRow = chainRows[1];
    expect(insertedRow).toBeDefined();
    expect(insertedRow.prevHash).toBe(genesisRow.rowHash);
    expect(insertedRow.sequenceNumber).toBe(1);
  });

  it("second append: prev_hash = first append row_hash, sequence = 2", async () => {
    await appendChainedAudit({ action: "a1", entityType: "t", entityId: 1 });
    const firstRow = chainRows[1];
    const result = await appendChainedAudit({
      action: "a2",
      entityType: "t",
      entityId: 2,
    });
    expect(result.sequenceNumber).toBe(2);
    expect(chainRows[2].prevHash).toBe(firstRow.rowHash);
  });

  it("row_hash is deterministic for same payload and prev_hash", async () => {
    const r1 = await appendChainedAudit({
      action: "x",
      entityType: "t",
      entityId: 1,
      ts: new Date("2026-01-01"),
    });
    const _prevHash = chainRows[chainRows.length - 1].prevHash;
    const expectedHash = computeHash(
      chainRows.find(r => r.sequenceNumber === 0)!.rowHash,
      {
        auditLogId: null,
        action: "x",
        entityType: "t",
        entityId: 1,
        actorUserId: null,
        beforeJson: null,
        afterJson: null,
        ts: "2026-01-01T00:00:00.000Z",
      }
    );
    expect(r1.rowHash).toBe(expectedHash);
  });

  it("same payload appended twice produces different row_hash because prev_hash differs", async () => {
    const p = {
      action: "same",
      entityType: "t",
      entityId: 1,
      ts: new Date("2026-01-01"),
    };
    const r1 = await appendChainedAudit(p);
    const r2 = await appendChainedAudit(p);
    expect(r1.rowHash).not.toBe(r2.rowHash);
  });

  it("returns sequenceNumber=-1 and rowHash='' when db returns null", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockResolvedValueOnce(null as unknown);
    const result = await appendChainedAudit({
      action: "x",
      entityType: "t",
      entityId: 1,
    });
    expect(result.sequenceNumber).toBe(-1);
    expect(result.rowHash).toBe("");
  });

  it("does NOT throw when db is unavailable — returns failure sentinel", async () => {
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockRejectedValueOnce(new Error("connection refused"));
    await expect(
      appendChainedAudit({ action: "x", entityType: "t", entityId: 1 })
    ).resolves.toEqual({
      sequenceNumber: -1,
      rowHash: "",
    });
  });

  it("retries on sequence conflict and succeeds on second attempt", async () => {
    // Simulate a concurrent insert taking sequence 1
    const original = mockDb();
    let callCount = 0;
    const { getDb } = await import("../db");
    vi.mocked(getDb).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: fake a conflict by injecting duplicate before insert runs
        return {
          select: original.select,
          insert: () => ({
            values: () => {
              const err = new Error(
                "Duplicate entry for key 'uq_audit_chain_sequence'"
              );
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (err as any).code = "ER_DUP_ENTRY";
              chainRows.push({
                ...chainRows[0],
                id: 99,
                sequenceNumber: 1,
                rowHash: "conflicting" + chainRows[0].rowHash,
                createdAt: new Date(),
              });
              return Promise.reject(err);
            },
          }),
        } as unknown;
      }
      return original as unknown;
    });

    const result = await appendChainedAudit({
      action: "retry",
      entityType: "t",
      entityId: 1,
    });
    expect(result.sequenceNumber).toBeGreaterThanOrEqual(2);
    vi.mocked(getDb).mockRestore();
  });
});

describe("verifyChain", () => {
  it("intact chain with only genesis: verified=true, rowsChecked=1", async () => {
    const result = await verifyChain();
    expect(result.verified).toBe(true);
    expect(result.rowsChecked).toBe(1);
  });

  it("intact chain with multiple rows: verified=true", async () => {
    await appendChainedAudit({ action: "a", entityType: "t", entityId: 1 });
    await appendChainedAudit({ action: "b", entityType: "t", entityId: 2 });
    const result = await verifyChain();
    expect(result.verified).toBe(true);
    expect(result.rowsChecked).toBe(3);
  });

  it("tampered row_hash detected: verified=false, firstBreakAt set", async () => {
    await appendChainedAudit({ action: "a", entityType: "t", entityId: 1 });
    await appendChainedAudit({ action: "b", entityType: "t", entityId: 2 });
    chainRows[1].rowHash =
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const result = await verifyChain();
    expect(result.verified).toBe(false);
    expect(result.firstBreakAt).toBeDefined();
  });

  it("row deleted (sequence gap) detected: verified=false", async () => {
    await appendChainedAudit({ action: "a", entityType: "t", entityId: 1 });
    await appendChainedAudit({ action: "b", entityType: "t", entityId: 2 });
    chainRows.splice(1, 1); // delete row at sequence 1
    const result = await verifyChain();
    expect(result.verified).toBe(false);
    expect(result.firstBreakReason).toContain("sequence gap");
  });

  it("fromSequence / toSequence range limits verification", async () => {
    await appendChainedAudit({ action: "a", entityType: "t", entityId: 1 });
    await appendChainedAudit({ action: "b", entityType: "t", entityId: 2 });
    const result = await verifyChain({ fromSequence: 1, toSequence: 2 });
    expect(result.rowsChecked).toBe(2);
  });

  it("maxRows stops after N rows", async () => {
    await appendChainedAudit({ action: "a", entityType: "t", entityId: 1 });
    await appendChainedAudit({ action: "b", entityType: "t", entityId: 2 });
    const result = await verifyChain({ maxRows: 2 });
    expect(result.rowsChecked).toBeLessThanOrEqual(2);
  });
});

describe("getChainStats", () => {
  it("returns totalRows=1 for chain with only genesis", async () => {
    const stats = await getChainStats();
    expect(stats.totalRows).toBe(1);
  });

  it("returns correct totalRows after appends", async () => {
    await appendChainedAudit({ action: "a", entityType: "t", entityId: 1 });
    await appendChainedAudit({ action: "b", entityType: "t", entityId: 2 });
    const stats = await getChainStats();
    expect(stats.totalRows).toBe(3);
  });

  it("oldestRow is genesis (sequence 0) and newestRow is latest", async () => {
    await appendChainedAudit({ action: "a", entityType: "t", entityId: 1 });
    const stats = await getChainStats();
    expect(stats.oldestRow?.sequenceNumber).toBe(0);
    expect(stats.newestRow?.sequenceNumber).toBe(1);
  });
});
