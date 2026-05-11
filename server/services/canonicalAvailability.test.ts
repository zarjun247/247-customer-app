import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCanonicalAvailability,
  getMultiProductAvailability,
} from "./canonicalAvailability";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSelect, mockDb } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockDb = { select: mockSelect };
  return { mockSelect, mockDb };
});

const { mockEmitSloEvent } = vi.hoisted(() => ({
  mockEmitSloEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("./sloService", () => ({
  emitSloEvent: mockEmitSloEvent,
  SLO_DEFINITIONS: [],
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORE_ID = 1;
const PRODUCT_ID = 42;

function makeBatch(overrides: {
  id: number;
  expiryDate: string;
  qtyOnHand: number;
  batchNo?: string;
  variantId?: number | null;
}) {
  return {
    id: overrides.id,
    storeId: STORE_ID,
    productId: PRODUCT_ID,
    batchNo: overrides.batchNo ?? `BATCH-${overrides.id}`,
    expiryDate: overrides.expiryDate,
    qtyOnHand: overrides.qtyOnHand,
    qtyReserved: 0,
    qtyQuarantined: 0,
    qtyExpired: 0,
    status: "active",
    variantId: overrides.variantId ?? null,
    storageCondition: "ambient",
    coldChainFlag: false,
    expiryBucket: "normal",
  };
}

function makeSelectChainBatches(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

function makeSelectChainReserved(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getCanonicalAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Case 1: single batch, no reservations → sellable == onHand", async () => {
    const batch = makeBatch({ id: 1, expiryDate: "2026-12-01", qtyOnHand: 10 });
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch]))
      .mockReturnValueOnce(makeSelectChainReserved([]));

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);

    expect(result.totalOnHand).toBe(10);
    expect(result.totalReserved).toBe(0);
    expect(result.totalSellable).toBe(10);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]!.sellable).toBe(10);
  });

  it("Case 2: single batch, one active reservation → sellable = onHand - reserved", async () => {
    const batch = makeBatch({ id: 1, expiryDate: "2026-12-01", qtyOnHand: 10 });
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch]))
      .mockReturnValueOnce(makeSelectChainReserved([{ batchId: 1, reserved: 3 }]));

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);

    expect(result.totalOnHand).toBe(10);
    expect(result.totalReserved).toBe(3);
    expect(result.totalSellable).toBe(7);
    expect(result.batches[0]!.sellable).toBe(7);
  });

  it("Case 3: expired reservation (not counted) → sellable == onHand", async () => {
    // Expired reservations are not in ACTIVE states, so they don't appear in reservedRows.
    const batch = makeBatch({ id: 1, expiryDate: "2026-12-01", qtyOnHand: 10 });
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch]))
      .mockReturnValueOnce(makeSelectChainReserved([])); // expired res not counted

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);

    expect(result.totalSellable).toBe(10);
  });

  it("Case 4: multiple batches → returned in FEFO order (earliest expiry first)", async () => {
    const batch1 = makeBatch({ id: 1, expiryDate: "2026-06-01", qtyOnHand: 5 });
    const batch2 = makeBatch({ id: 2, expiryDate: "2026-12-01", qtyOnHand: 8 });
    // DB returns them already ordered by expiryDate (our ORDER BY clause)
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch1, batch2]))
      .mockReturnValueOnce(makeSelectChainReserved([]));

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);

    expect(result.batches).toHaveLength(2);
    expect(result.batches[0]!.batchId).toBe(1); // earlier expiry first (FEFO)
    expect(result.batches[1]!.batchId).toBe(2);
  });

  it("Case 5: multiple batches with reservations → each batch computed independently", async () => {
    const batch1 = makeBatch({ id: 1, expiryDate: "2026-06-01", qtyOnHand: 10 });
    const batch2 = makeBatch({ id: 2, expiryDate: "2026-12-01", qtyOnHand: 10 });
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch1, batch2]))
      .mockReturnValueOnce(makeSelectChainReserved([
        { batchId: 1, reserved: 3 },
        { batchId: 2, reserved: 5 },
      ]));

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);

    expect(result.batches[0]!.reserved).toBe(3);
    expect(result.batches[0]!.sellable).toBe(7);
    expect(result.batches[1]!.reserved).toBe(5);
    expect(result.batches[1]!.sellable).toBe(5);
  });

  it("Case 6: sum totals equal sums of per-batch values", async () => {
    const batch1 = makeBatch({ id: 1, expiryDate: "2026-06-01", qtyOnHand: 10 });
    const batch2 = makeBatch({ id: 2, expiryDate: "2026-12-01", qtyOnHand: 8 });
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch1, batch2]))
      .mockReturnValueOnce(makeSelectChainReserved([
        { batchId: 1, reserved: 3 },
        { batchId: 2, reserved: 2 },
      ]));

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);

    const sumOnHand = result.batches.reduce((s, b) => s + b.onHand, 0);
    const sumReserved = result.batches.reduce((s, b) => s + b.reserved, 0);
    const sumSellable = result.batches.reduce((s, b) => s + b.sellable, 0);

    expect(result.totalOnHand).toBe(sumOnHand);
    expect(result.totalReserved).toBe(sumReserved);
    expect(result.totalSellable).toBe(sumSellable);
  });

  it("Case 7: product not in store → empty result with totals = 0", async () => {
    mockSelect.mockReturnValueOnce(makeSelectChainBatches([]));

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);

    expect(result.totalOnHand).toBe(0);
    expect(result.totalReserved).toBe(0);
    expect(result.totalSellable).toBe(0);
    expect(result.batches).toHaveLength(0);
  });

  it("Case 8: reservation in state=released → not counted", async () => {
    // Released reservations are not in ACTIVE states so reservedRows is empty.
    const batch = makeBatch({ id: 1, expiryDate: "2026-12-01", qtyOnHand: 10 });
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch]))
      .mockReturnValueOnce(makeSelectChainReserved([]));

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);
    expect(result.totalSellable).toBe(10);
  });

  it("Case 9: reservation in state=confirmed → not counted (stock_movements consumed it)", async () => {
    // Confirmed reservations are not in ACTIVE states.
    const batch = makeBatch({ id: 1, expiryDate: "2026-12-01", qtyOnHand: 7 }); // onHand already reduced
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch]))
      .mockReturnValueOnce(makeSelectChainReserved([]));

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);
    expect(result.totalOnHand).toBe(7);
    expect(result.totalSellable).toBe(7);
  });

  it("Case 10: sellable is never negative (reserved > onHand edge case)", async () => {
    const batch = makeBatch({ id: 1, expiryDate: "2026-12-01", qtyOnHand: 3 });
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch]))
      .mockReturnValueOnce(makeSelectChainReserved([{ batchId: 1, reserved: 10 }]));

    const result = await getCanonicalAvailability(PRODUCT_ID, STORE_ID);
    expect(result.batches[0]!.sellable).toBe(0);
    expect(result.totalSellable).toBe(0);
  });

  it("Case 11: multi-product batch query returns one entry per requested product", async () => {
    const batch1 = makeBatch({ id: 1, expiryDate: "2026-12-01", qtyOnHand: 5 });
    const batch2 = makeBatch({ id: 2, expiryDate: "2026-12-01", qtyOnHand: 8 });

    // Promise.all interleaves: both batch queries run before both reservation queries
    // because each coroutine suspends at its first await-boundary before the second's.
    mockSelect
      .mockReturnValueOnce(makeSelectChainBatches([batch1]))  // p1: batch query
      .mockReturnValueOnce(makeSelectChainBatches([batch2]))  // p2: batch query
      .mockReturnValueOnce(makeSelectChainReserved([]))       // p1: reservation query
      .mockReturnValueOnce(makeSelectChainReserved([]));      // p2: reservation query

    const results = await getMultiProductAvailability([
      { productId: 42, storeId: STORE_ID },
      { productId: 43, storeId: STORE_ID },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]!.productId).toBe(42);
    expect(results[1]!.productId).toBe(43);
  });
});
