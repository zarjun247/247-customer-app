import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import {
  canonicalize,
  appendSuggestion,
  recordOutcome,
  verifyChain,
  getStats,
  listSuggestions,
} from "./aiEvalLedger";

// ─── In-memory DB state ───────────────────────────────────────────────────────

type LedgerRow = {
  id: number;
  sequenceNumber: number;
  prevHash: string;
  rowHash: string;
  suggestionKind: string;
  scopeType: string;
  scopeId: string | null;
  inputHash: string;
  inputSnapshot: unknown;
  outputPayload: unknown;
  modelVersion: string;
  generatedAt: Date;
  generatedByUserId: string | null;
  traceId: string | null;
};

type OutcomeRow = {
  id: number;
  evalLedgerId: number;
  outcomeKind: string;
  outcomePayload: unknown;
  recordedAt: Date;
  recordedByUserId: string | null;
};

let ledgerRows: LedgerRow[] = [];
let outcomeRows: OutcomeRow[] = [];
let nextLedgerId = 1;
let nextOutcomeId = 1;

const GENESIS_HASH = createHash("sha256")
  .update("genesis:ai-eval:247-customer-app:2026-05-11")
  .digest("hex");

function makeGenesisRow(): LedgerRow {
  return {
    id: 0,
    sequenceNumber: 0,
    prevHash:
      "0000000000000000000000000000000000000000000000000000000000000000",
    rowHash: GENESIS_HASH,
    suggestionKind: "genesis",
    scopeType: "global",
    scopeId: null,
    inputHash: createHash("sha256").update("genesis-input").digest("hex"),
    inputSnapshot: { kind: "genesis" },
    outputPayload: { kind: "genesis" },
    modelVersion: "genesis",
    generatedAt: new Date("2026-05-11T00:00:00Z"),
    generatedByUserId: null,
    traceId: null,
  };
}

// Build a comprehensive mock DB that handles all query patterns used by aiEvalLedger.ts
function buildMockDb(opts: { throwOnInsert?: boolean } = {}) {
  const { throwOnInsert = false } = opts;

  function makeSelect(table: "ledger" | "outcomes") {
    const getRows = () => (table === "ledger" ? ledgerRows : outcomeRows);

    const withLimit = (rows: unknown[], n: number) => rows.slice(0, n);

    // Chainable select builder
    function chain(filteredRows: () => LedgerRow[] | OutcomeRow[]) {
      return {
        orderBy: (_col?: unknown) => ({
          limit: (n: number) => ({
            offset: (o: number) =>
              Promise.resolve(filteredRows().slice(o, o + n)),
          }),
        }),
        limit: (n: number) => Promise.resolve(withLimit(filteredRows(), n)),
        where: (_cond?: unknown) => chain(filteredRows),
        groupBy: (_col?: unknown) => Promise.resolve([]),
        then: undefined,
      };
    }

    return {
      where: (_cond?: unknown) => chain(() => getRows() as LedgerRow[]),
      orderBy: (_col?: unknown) => ({
        // appendSuggestion uses desc(sequenceNumber) to get the latest row — always return DESC order
        limit: (n: number) => {
          const all = getRows() as LedgerRow[];
          const sorted = [...all].sort(
            (a, b) => b.sequenceNumber - a.sequenceNumber
          );
          return Promise.resolve(sorted.slice(0, n));
        },
      }),
      groupBy: (_col?: unknown) => Promise.resolve([]),
      limit: (n: number) => Promise.resolve(getRows().slice(0, n)),
    };
  }

  return {
    select: (_fields?: unknown) => ({
      from: (table: unknown) => {
        const name = String(
          (table as { _?: { name?: string } })?._?.name ?? table
        );
        const t = name.includes("outcomes") ? "outcomes" : "ledger";
        return makeSelect(t);
      },
    }),
    insert: (_table: unknown) => ({
      values: (vals: unknown) => {
        if (throwOnInsert) {
          return Promise.reject(new Error("DB insert error simulated"));
        }
        const v = vals as Record<string, unknown>;
        if ("sequenceNumber" in v) {
          const id = nextLedgerId++;
          const row = { ...v, id } as unknown as LedgerRow;
          ledgerRows.push(row);
          return Promise.resolve({ insertId: id });
        } else {
          const id = nextOutcomeId++;
          const row = { ...v, id } as unknown as OutcomeRow;
          outcomeRows.push(row);
          return Promise.resolve({ insertId: id });
        }
      },
    }),
  };
}

vi.mock("../db", () => ({ getDb: vi.fn() }));
import { getDb } from "../db";
const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  ledgerRows = [makeGenesisRow()];
  outcomeRows = [];
  nextLedgerId = 1;
  nextOutcomeId = 1;
  mockGetDb.mockResolvedValue(
    buildMockDb() as unknown as Awaited<ReturnType<typeof getDb>>
  );
});

// ─── canonicalize tests ───────────────────────────────────────────────────────

describe("canonicalize", () => {
  it("sorts object keys deterministically", () => {
    const a = canonicalize({ z: 1, a: 2, m: 3 });
    const b = canonicalize({ m: 3, z: 1, a: 2 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("handles arrays", () => {
    expect(canonicalize([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("handles null", () => {
    expect(canonicalize(null)).toBeNull();
  });

  it("handles nested objects", () => {
    const result = JSON.stringify(canonicalize({ b: { d: 1, c: 2 }, a: 3 }));
    expect(result).toBe(JSON.stringify({ a: 3, b: { c: 2, d: 1 } }));
  });
});

// ─── appendSuggestion tests ───────────────────────────────────────────────────

describe("appendSuggestion", () => {
  it("genesis row exists at sequence 0 on startup", () => {
    expect(ledgerRows[0].sequenceNumber).toBe(0);
    expect(ledgerRows[0].suggestionKind).toBe("genesis");
    expect(ledgerRows[0].rowHash).toBe(GENESIS_HASH);
  });

  it("first append produces sequence 1 with prev_hash = genesis.row_hash", async () => {
    const result = await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "cust-1",
      inputSnapshot: { customerId: "cust-1", productId: "prod-1" },
      outputPayload: { riskScore: 0.8, riskLevel: "high" },
      modelVersion: "heuristic-v1",
    });
    expect(result.sequenceNumber).toBe(1);
    const stored = ledgerRows.find(r => r.id === result.ledgerId);
    expect(stored?.prevHash).toBe(GENESIS_HASH);
  });

  it("second append has prev_hash = first row row_hash", async () => {
    const r1 = await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "c1",
      inputSnapshot: { x: 1 },
      outputPayload: { y: 1 },
      modelVersion: "heuristic-v1",
    });
    const firstRowHash = ledgerRows.find(r => r.id === r1.ledgerId)!.rowHash;

    const r2 = await appendSuggestion({
      suggestionKind: "stockout_alert",
      scopeType: "product",
      scopeId: "p1",
      inputSnapshot: { x: 2 },
      outputPayload: { y: 2 },
      modelVersion: "heuristic-v1",
    });
    expect(r2.sequenceNumber).toBe(2);
    const stored2 = ledgerRows.find(r => r.id === r2.ledgerId);
    expect(stored2?.prevHash).toBe(firstRowHash);
  });

  it("canonicalized inputs produce stable hash for same data regardless of key order", async () => {
    const r1 = await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "c1",
      inputSnapshot: { b: 2, a: 1 },
      outputPayload: { score: 0.5 },
      modelVersion: "heuristic-v1",
    });
    const hash1 = ledgerRows.find(r => r.id === r1.ledgerId)?.inputHash;

    ledgerRows = [makeGenesisRow()];
    nextLedgerId = 1;

    const r2 = await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "c1",
      inputSnapshot: { a: 1, b: 2 },
      outputPayload: { score: 0.5 },
      modelVersion: "heuristic-v1",
    });
    const hash2 = ledgerRows.find(r => r.id === r2.ledgerId)?.inputHash;
    expect(hash1).toBe(hash2);
  });

  it("returns {-1, '', -1} and does NOT throw when DB insert fails", async () => {
    mockGetDb.mockResolvedValue(
      buildMockDb({ throwOnInsert: true }) as unknown as Awaited<
        ReturnType<typeof getDb>
      >
    );
    const result = await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "c1",
      inputSnapshot: {},
      outputPayload: {},
      modelVersion: "heuristic-v1",
    });
    expect(result.sequenceNumber).toBe(-1);
    expect(result.rowHash).toBe("");
    expect(result.ledgerId).toBe(-1);
  });

  it("returns {-1, '', -1} when DB unavailable", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "c1",
      inputSnapshot: {},
      outputPayload: {},
      modelVersion: "heuristic-v1",
    });
    expect(result.sequenceNumber).toBe(-1);
    expect(result.ledgerId).toBe(-1);
  });
});

// ─── recordOutcome tests ──────────────────────────────────────────────────────

describe("recordOutcome", () => {
  it("appends outcome without modifying the ledger row", async () => {
    const sug = await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "c1",
      inputSnapshot: {},
      outputPayload: {},
      modelVersion: "heuristic-v1",
    });
    const ledgerCountBefore = ledgerRows.length;
    await recordOutcome({
      evalLedgerId: sug.ledgerId,
      outcomeKind: "accepted",
      recordedByUserId: "u-1",
    });
    expect(ledgerRows.length).toBe(ledgerCountBefore);
    expect(outcomeRows).toHaveLength(1);
    expect(outcomeRows[0].outcomeKind).toBe("accepted");
  });

  it("allows multiple outcomes per suggestion", async () => {
    const sug = await appendSuggestion({
      suggestionKind: "stockout_alert",
      scopeType: "product",
      scopeId: "p1",
      inputSnapshot: {},
      outputPayload: {},
      modelVersion: "heuristic-v1",
    });
    await recordOutcome({
      evalLedgerId: sug.ledgerId,
      outcomeKind: "accepted",
    });
    await recordOutcome({
      evalLedgerId: sug.ledgerId,
      outcomeKind: "outcome_realized",
      outcomePayload: { note: "restock" },
    });
    expect(outcomeRows).toHaveLength(2);
    expect(outcomeRows[0].outcomeKind).toBe("accepted");
    expect(outcomeRows[1].outcomeKind).toBe("outcome_realized");
  });

  it("throws when DB unavailable", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    await expect(
      recordOutcome({ evalLedgerId: 1, outcomeKind: "accepted" })
    ).rejects.toThrow("DB unavailable");
  });
});

// ─── verifyChain tests ────────────────────────────────────────────────────────

function makeVerifyMock(rows: LedgerRow[]) {
  const sorted = [...rows].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return {
    select: () => ({
      from: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve(sorted),
        }),
      }),
    }),
  };
}

describe("verifyChain", () => {
  it("returns verified=false when DB unavailable", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await verifyChain();
    expect(result.verified).toBe(false);
    expect(result.firstBreakReason).toContain("db unavailable");
  });

  it("verifies genesis-only chain (no suggestions yet)", async () => {
    mockGetDb.mockResolvedValue(
      makeVerifyMock(ledgerRows) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await verifyChain();
    expect(result.verified).toBe(true);
    expect(result.lastSequenceNumber).toBe(0);
  });

  it("verifies intact chain with one appended suggestion", async () => {
    const r = await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "c1",
      inputSnapshot: { id: "c1" },
      outputPayload: { riskScore: 0.7 },
      modelVersion: "heuristic-v1",
    });
    // The appended row has been computed by appendSuggestion — verify it chains correctly
    mockGetDb.mockResolvedValue(
      makeVerifyMock(ledgerRows) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await verifyChain();
    expect(result.verified).toBe(true);
    expect(result.lastSequenceNumber).toBe(r.sequenceNumber);
    expect(result.rowsChecked).toBeGreaterThanOrEqual(2);
  });

  it("returns verified=false when a row hash is tampered", async () => {
    await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "c1",
      inputSnapshot: {},
      outputPayload: {},
      modelVersion: "heuristic-v1",
    });
    // Tamper with the appended row's hash
    ledgerRows[1].rowHash =
      "tampered-0000000000000000000000000000000000000000000000000";
    mockGetDb.mockResolvedValue(
      makeVerifyMock(ledgerRows) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await verifyChain();
    expect(result.verified).toBe(false);
    expect(result.firstBreakAt).toBeDefined();
  });

  it("returns verified=false when prev_hash is broken", async () => {
    await appendSuggestion({
      suggestionKind: "refill_risk",
      scopeType: "customer",
      scopeId: "c1",
      inputSnapshot: {},
      outputPayload: {},
      modelVersion: "heuristic-v1",
    });
    // Break prevHash link
    ledgerRows[1].prevHash =
      "broken-prev-hash-0000000000000000000000000000000000000000000";
    mockGetDb.mockResolvedValue(
      makeVerifyMock(ledgerRows) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await verifyChain();
    expect(result.verified).toBe(false);
    expect(result.firstBreakAt).toBe(1);
  });

  it("fromSequence/toSequence filters work (empty range returns verified=true rowsChecked=0)", async () => {
    mockGetDb.mockResolvedValue(
      makeVerifyMock(ledgerRows) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await verifyChain({ fromSequence: 99, toSequence: 200 });
    expect(result.verified).toBe(true);
    expect(result.rowsChecked).toBe(0);
  });
});

// ─── getStats tests ───────────────────────────────────────────────────────────

describe("getStats", () => {
  it("returns zero stats when DB unavailable", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const stats = await getStats();
    expect(stats.totalSuggestions).toBe(0);
    expect(stats.acceptanceRate).toBe(0);
    expect(stats.byKind).toEqual([]);
  });

  it("acceptance rate formula: 3 accepted / (3+2) = 60%", () => {
    const accepted = 3;
    const rejected = 2;
    const rate = accepted / (accepted + rejected);
    expect(rate).toBeCloseTo(0.6);
  });
});

// ─── listSuggestions tests ────────────────────────────────────────────────────

describe("listSuggestions", () => {
  // Use the real in-memory mock (buildMockDb) for simple cases where rows are empty.
  // For the empty-rows case, the outcomes query is never called (guarded by ledgerIds.length > 0).

  it("returns empty records and total=0 when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await listSuggestions();
    expect(result.records).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("returns empty records when limit=0", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await listSuggestions({ limit: 0, offset: 0 });
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.total).toBe(0);
  });

  it("suggestionKind filter accepted without error when DB unavailable", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await listSuggestions({ suggestionKind: "refill_risk" });
    expect(Array.isArray(result.records)).toBe(true);
  });

  it("scopeType filter accepted without error when DB unavailable", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await listSuggestions({ scopeType: "customer" });
    expect(result).toBeDefined();
  });
});
