import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildCustomerContinuityGraph,
  buildProductContinuityGraph,
  identifyContinuityCriticalSkus,
} from "./continuityGraph";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../_core/env", () => ({
  ENV: {
    refillRiskLookbackDays: 180,
    continuityGraphMaxNodes: 500,
  },
}));

import { getDb } from "../db";
const mockGetDb = vi.mocked(getDb);

type MockRow = {
  productId?: string;
  customerId?: string | null;
  createdAt: number;
  qty: number;
  schedule?: string | null;
};

function makeSaleRow(row: MockRow) {
  return {
    productId: row.productId ?? "p1",
    customerId: row.customerId,
    createdAt: row.createdAt,
    qty: row.qty,
    schedule: row.schedule ?? null,
  };
}

function makeDb(rows: MockRow[]) {
  const built = rows.map(makeSaleRow);
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(built),
          }),
        }),
      }),
    }),
  };
}

// Helpers
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
function daysAgo(n: number) { return now - n * DAY; }

beforeEach(() => {
  mockGetDb.mockResolvedValue(makeDb([]) as unknown as Awaited<ReturnType<typeof getDb>>);
});

// ─── buildCustomerContinuityGraph ────────────────────────────────────────────

describe("buildCustomerContinuityGraph", () => {
  it("empty history returns single customer node, no edges", async () => {
    const result = await buildCustomerContinuityGraph("c1");
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toEqual({ kind: "customer", id: "c1" });
    expect(result.edges).toHaveLength(0);
  });

  it("1 purchase = 1 edge with low continuityScore (<0.5)", async () => {
    mockGetDb.mockResolvedValue(makeDb([
      { productId: "p1", createdAt: daysAgo(10), qty: 1 },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await buildCustomerContinuityGraph("c1");
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].continuityScore).toBeLessThan(0.5);
    expect(result.edges[0].purchaseCount).toBe(1);
  });

  it("5 purchases of 1 product over 160 days → high continuityScore (≥0.8)", async () => {
    mockGetDb.mockResolvedValue(makeDb([
      { productId: "p1", createdAt: daysAgo(160), qty: 1 },
      { productId: "p1", createdAt: daysAgo(120), qty: 1 },
      { productId: "p1", createdAt: daysAgo(80), qty: 1 },
      { productId: "p1", createdAt: daysAgo(40), qty: 1 },
      { productId: "p1", createdAt: daysAgo(0), qty: 1 },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await buildCustomerContinuityGraph("c1");
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].purchaseCount).toBe(5);
    expect(result.edges[0].continuityScore).toBeGreaterThanOrEqual(0.8);
  });

  it("regulated product (schedule H) gets +0.1 baseline boost", async () => {
    // 1 purchase, OTC → low score
    mockGetDb.mockResolvedValue(makeDb([
      { productId: "p-otc", createdAt: daysAgo(10), qty: 1, schedule: "OTC" },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const resultOtc = await buildCustomerContinuityGraph("c1");
    const otcScore = resultOtc.edges[0].continuityScore;

    // 1 purchase, schedule H → higher score
    mockGetDb.mockResolvedValue(makeDb([
      { productId: "p-h", createdAt: daysAgo(10), qty: 1, schedule: "H" },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const resultH = await buildCustomerContinuityGraph("c1");
    const hScore = resultH.edges[0].continuityScore;

    expect(hScore).toBeGreaterThan(otcScore);
    expect(hScore - otcScore).toBeCloseTo(0.1, 5);
  });

  it("average interval calculation is correct", async () => {
    // 3 purchases: 0, 30, 60 days ago → intervals = [30, 30] → avg = 30
    mockGetDb.mockResolvedValue(makeDb([
      { productId: "p1", createdAt: daysAgo(60), qty: 1 },
      { productId: "p1", createdAt: daysAgo(30), qty: 1 },
      { productId: "p1", createdAt: daysAgo(0), qty: 1 },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await buildCustomerContinuityGraph("c1");
    expect(result.edges[0].averageIntervalDays).toBeCloseTo(30, 0);
  });

  it("high interval variance lowers continuityScore vs low variance", async () => {
    // Low variance: 4 purchases, ~30d apart
    mockGetDb.mockResolvedValue(makeDb([
      { productId: "p1", createdAt: daysAgo(90), qty: 1 },
      { productId: "p1", createdAt: daysAgo(60), qty: 1 },
      { productId: "p1", createdAt: daysAgo(30), qty: 1 },
      { productId: "p1", createdAt: daysAgo(0), qty: 1 },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const lowVar = await buildCustomerContinuityGraph("c1");
    const scoreLow = lowVar.edges[0].continuityScore;

    // High variance: 4 purchases, wildly spaced
    mockGetDb.mockResolvedValue(makeDb([
      { productId: "p1", createdAt: daysAgo(170), qty: 1 },
      { productId: "p1", createdAt: daysAgo(160), qty: 1 },
      { productId: "p1", createdAt: daysAgo(10), qty: 1 },
      { productId: "p1", createdAt: daysAgo(0), qty: 1 },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const highVar = await buildCustomerContinuityGraph("c1");
    const scoreHigh = highVar.edges[0].continuityScore;

    expect(scoreLow).toBeGreaterThanOrEqual(scoreHigh);
  });

  it("maxEdges limits the number of returned edges", async () => {
    mockGetDb.mockResolvedValue(makeDb([
      { productId: "p1", createdAt: daysAgo(10), qty: 1 },
      { productId: "p2", createdAt: daysAgo(20), qty: 1 },
      { productId: "p3", createdAt: daysAgo(30), qty: 1 },
      { productId: "p4", createdAt: daysAgo(40), qty: 1 },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await buildCustomerContinuityGraph("c1", { maxEdges: 2 });
    expect(result.edges).toHaveLength(2);
  });

  it("DB unavailable returns empty graph", async () => {
    mockGetDb.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await buildCustomerContinuityGraph("c1");
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("edges are sorted by continuityScore descending", async () => {
    // p1: 5 purchases (high score), p2: 1 purchase (low score)
    mockGetDb.mockResolvedValue(makeDb([
      { productId: "p1", createdAt: daysAgo(150), qty: 1 },
      { productId: "p1", createdAt: daysAgo(112), qty: 1 },
      { productId: "p1", createdAt: daysAgo(75), qty: 1 },
      { productId: "p1", createdAt: daysAgo(38), qty: 1 },
      { productId: "p1", createdAt: daysAgo(1), qty: 1 },
      { productId: "p2", createdAt: daysAgo(5), qty: 1 },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await buildCustomerContinuityGraph("c1");
    expect(result.edges[0].toProductId).toBe("p1");
    expect(result.edges[0].continuityScore).toBeGreaterThan(result.edges[1].continuityScore);
  });
});

// ─── buildProductContinuityGraph ─────────────────────────────────────────────

describe("buildProductContinuityGraph", () => {
  it("returns customers in continuityScore descending order", async () => {
    // c1: 5 purchases (high), c2: 1 purchase (low)
    const rows = [
      { customerId: "c1", createdAt: daysAgo(150), qty: 1 },
      { customerId: "c1", createdAt: daysAgo(112), qty: 1 },
      { customerId: "c1", createdAt: daysAgo(75), qty: 1 },
      { customerId: "c1", createdAt: daysAgo(38), qty: 1 },
      { customerId: "c1", createdAt: daysAgo(1), qty: 1 },
      { customerId: "c2", createdAt: daysAgo(5), qty: 1 },
    ];
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(rows.map(r => ({ ...r, productId: "p1", schedule: null }))),
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await buildProductContinuityGraph("p1");
    expect(result.edges[0].fromCustomerId).toBe("c1");
    expect(result.edges[0].continuityScore).toBeGreaterThan(result.edges[1].continuityScore);
  });

  it("excludes walk-in sales (null customerId)", async () => {
    const rows = [
      { customerId: null, createdAt: daysAgo(5), qty: 1 },
      { customerId: "c1", createdAt: daysAgo(10), qty: 1 },
    ];
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(rows.map(r => ({ ...r, productId: "p1", schedule: null }))),
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await buildProductContinuityGraph("p1");
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].fromCustomerId).toBe("c1");
  });

  it("respects maxEdges limit", async () => {
    const rows = ["c1", "c2", "c3", "c4"].map((cid, i) => ({
      customerId: cid, createdAt: daysAgo(i + 1), qty: 1, productId: "p1", schedule: null,
    }));
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(rows),
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await buildProductContinuityGraph("p1", { maxEdges: 2 });
    expect(result.edges).toHaveLength(2);
  });
});

// ─── identifyContinuityCriticalSkus ──────────────────────────────────────────

describe("identifyContinuityCriticalSkus", () => {
  function makeStoreRows(rows: Array<{ customerId: string; productId: string; daysAgo: number; schedule?: string }>) {
    return rows.map((r) => ({
      customerId: r.customerId,
      productId: r.productId,
      createdAt: daysAgo(r.daysAgo),
      qty: 1,
      schedule: r.schedule ?? null,
    }));
  }

  it("returns SKUs where minCustomersAffected threshold is met", async () => {
    // p1: 3 customers, each with 4+ purchases (high score)
    const rows = makeStoreRows([
      { customerId: "c1", productId: "p1", daysAgo: 120 },
      { customerId: "c1", productId: "p1", daysAgo: 90 },
      { customerId: "c1", productId: "p1", daysAgo: 60 },
      { customerId: "c1", productId: "p1", daysAgo: 30 },
      { customerId: "c2", productId: "p1", daysAgo: 120 },
      { customerId: "c2", productId: "p1", daysAgo: 90 },
      { customerId: "c2", productId: "p1", daysAgo: 60 },
      { customerId: "c2", productId: "p1", daysAgo: 30 },
      { customerId: "c3", productId: "p1", daysAgo: 120 },
      { customerId: "c3", productId: "p1", daysAgo: 90 },
      { customerId: "c3", productId: "p1", daysAgo: 60 },
      { customerId: "c3", productId: "p1", daysAgo: 30 },
    ]);
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve(rows),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof getDb>>);

    const result = await identifyContinuityCriticalSkus("store-1");
    expect(result.length).toBeGreaterThan(0);
    const p1 = result.find((r) => r.productId === "p1");
    expect(p1).toBeDefined();
    expect(p1!.customersAffected).toBe(3);
  });

  it("excludes SKUs where fewer than minCustomersAffected qualify", async () => {
    // p1: only 2 customers qualify
    const rows = makeStoreRows([
      { customerId: "c1", productId: "p1", daysAgo: 120 },
      { customerId: "c1", productId: "p1", daysAgo: 90 },
      { customerId: "c1", productId: "p1", daysAgo: 60 },
      { customerId: "c1", productId: "p1", daysAgo: 30 },
      { customerId: "c2", productId: "p1", daysAgo: 120 },
      { customerId: "c2", productId: "p1", daysAgo: 90 },
      { customerId: "c2", productId: "p1", daysAgo: 60 },
      { customerId: "c2", productId: "p1", daysAgo: 30 },
    ]);
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve(rows),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof getDb>>);

    const result = await identifyContinuityCriticalSkus("store-1", { minCustomersAffected: 3 });
    expect(result.find((r) => r.productId === "p1")).toBeUndefined();
  });

  it("excludes customers below minContinuityScore threshold", async () => {
    // Only 1 purchase per customer → low score → won't qualify at 0.6 threshold
    const rows = makeStoreRows([
      { customerId: "c1", productId: "p1", daysAgo: 5 },
      { customerId: "c2", productId: "p1", daysAgo: 6 },
      { customerId: "c3", productId: "p1", daysAgo: 7 },
      { customerId: "c4", productId: "p1", daysAgo: 8 },
    ]);
    mockGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve(rows),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof getDb>>);

    const result = await identifyContinuityCriticalSkus("store-1", { minCustomersAffected: 3, minContinuityScore: 0.6 });
    expect(result.find((r) => r.productId === "p1")).toBeUndefined();
  });

  it("returns empty array when DB unavailable", async () => {
    mockGetDb.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await identifyContinuityCriticalSkus("store-1");
    expect(result).toEqual([]);
  });
});
