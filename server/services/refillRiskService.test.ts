import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCustomerRefillRisks, getStoreRefillAlerts } from "./refillRiskService";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../_core/env", () => ({
  ENV: {
    refillRiskLookbackDays: 180,
  },
}));

import { getDb } from "../db";
const mockGetDb = vi.mocked(getDb);

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
function daysAgo(n: number) { return now - n * DAY; }

type CustomerRow = { productId: string; createdAt: number; schedule: string | null };
type StoreRow = { customerId: string | null; productId: string; createdAt: number; schedule: string | null };

// Customer DB: chain ends at .orderBy()
function makeCustomerDb(rows: CustomerRow[]) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(rows),
          }),
        }),
      }),
    }),
  };
}

// Store DB: chain ends at .where() (no orderBy in getStoreRefillAlerts)
function makeStoreDb(rows: StoreRow[]) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => Promise.resolve(rows),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  mockGetDb.mockResolvedValue(makeCustomerDb([]) as unknown as Awaited<ReturnType<typeof getDb>>);
});

// ─── getCustomerRefillRisks ────────────────────────────────────────────────────

describe("getCustomerRefillRisks", () => {
  it("returns empty array when customer has no purchase history", async () => {
    const result = await getCustomerRefillRisks("c1");
    expect(result).toEqual([]);
  });

  it("returns empty array when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1");
    expect(result).toEqual([]);
  });

  it("single purchase → riskLevel 'low', riskScore 0.1, daysUntilRefillDue -1", async () => {
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(5), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1");
    expect(result).toHaveLength(1);
    expect(result[0].riskLevel).toBe("low");
    expect(result[0].riskScore).toBe(0.1);
    expect(result[0].daysUntilRefillDue).toBe(-1);
  });

  it("2 purchases, not yet overdue (ratio < 1.0) → riskLevel 'low'", async () => {
    // 30-day interval, last purchase 20 days ago → ratio 0.67
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(30), schedule: null },
      { productId: "p1", createdAt: daysAgo(0), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1");
    // daysAgo(0) is basically now, so daysSinceLast ≈ 0 → ratio ≈ 0
    expect(result[0].riskLevel).toBe("low");
  });

  it("2 purchases, overdue by ratio ≥ 1.0 → riskLevel 'medium'", async () => {
    // 30-day interval, last purchase 32 days ago → ratio ≈ 1.07
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(62), schedule: null },
      { productId: "p1", createdAt: daysAgo(32), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1");
    expect(result[0].riskLevel).toBe("medium");
  });

  it("2 purchases, overdue by ratio ≥ 1.2 → riskLevel 'high'", async () => {
    // 30-day interval, last purchase 38 days ago → ratio ≈ 1.27
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(68), schedule: null },
      { productId: "p1", createdAt: daysAgo(38), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1");
    expect(result[0].riskLevel).toBe("high");
  });

  it("2 purchases, overdue by ratio ≥ 1.5 → riskLevel 'critical'", async () => {
    // 30-day interval, last purchase 50 days ago → ratio ≈ 1.67
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(80), schedule: null },
      { productId: "p1", createdAt: daysAgo(50), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1");
    expect(result[0].riskLevel).toBe("critical");
  });

  it("riskScore is proportional: ratio=1.0 → score≈0.5, ratio=2.0 → score=1.0", async () => {
    // ratio 1.0: 30d interval, 30d since last
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(60), schedule: null },
      { productId: "p1", createdAt: daysAgo(30), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const r1 = await getCustomerRefillRisks("c1");
    expect(r1[0].riskScore).toBeCloseTo(0.5, 0);

    // ratio 2.0: 30d interval, 60d since last → clamped to 1.0
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(90), schedule: null },
      { productId: "p1", createdAt: daysAgo(60), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const r2 = await getCustomerRefillRisks("c1");
    expect(r2[0].riskScore).toBe(1.0);
  });

  it("schedule H products get +0.05 riskScore boost", async () => {
    // Same interval, same recency — H vs null
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(60), schedule: null },
      { productId: "p1", createdAt: daysAgo(30), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const otc = await getCustomerRefillRisks("c1");
    const otcScore = otc[0].riskScore;

    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(60), schedule: "H" },
      { productId: "p1", createdAt: daysAgo(30), schedule: "H" },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const h = await getCustomerRefillRisks("c1");
    const hScore = h[0].riskScore;

    expect(hScore).toBeGreaterThan(otcScore);
    expect(hScore - otcScore).toBeCloseTo(0.05, 5);
  });

  it("averageIntervalDays is correctly computed", async () => {
    // 3 purchases: 60, 30, 0 days ago → intervals [30, 30] → avg 30
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(60), schedule: null },
      { productId: "p1", createdAt: daysAgo(30), schedule: null },
      { productId: "p1", createdAt: daysAgo(0), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1");
    expect(result[0].averageIntervalDays).toBeCloseTo(30, 0);
  });

  it("multiple products sorted by riskScore descending", async () => {
    // p1: 30d interval, 50d since last → critical (high score)
    // p2: 30d interval, 20d since last → low (low score)
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(80), schedule: null },
      { productId: "p1", createdAt: daysAgo(50), schedule: null },
      { productId: "p2", createdAt: daysAgo(50), schedule: null },
      { productId: "p2", createdAt: daysAgo(20), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1");
    expect(result[0].productId).toBe("p1");
    expect(result[0].riskScore).toBeGreaterThan(result[1].riskScore);
  });

  it("maxProducts option limits results", async () => {
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(80), schedule: null },
      { productId: "p1", createdAt: daysAgo(50), schedule: null },
      { productId: "p2", createdAt: daysAgo(80), schedule: null },
      { productId: "p2", createdAt: daysAgo(50), schedule: null },
      { productId: "p3", createdAt: daysAgo(80), schedule: null },
      { productId: "p3", createdAt: daysAgo(50), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1", { maxProducts: 2 });
    expect(result).toHaveLength(2);
  });

  it("minRiskLevel filters out entries below threshold", async () => {
    // p1: critical, p2: low (1 purchase)
    mockGetDb.mockResolvedValue(makeCustomerDb([
      { productId: "p1", createdAt: daysAgo(80), schedule: null },
      { productId: "p1", createdAt: daysAgo(50), schedule: null },
      { productId: "p2", createdAt: daysAgo(5), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getCustomerRefillRisks("c1", { minRiskLevel: "medium" });
    expect(result.every((r) => ["medium", "high", "critical"].includes(r.riskLevel))).toBe(true);
    expect(result.find((r) => r.productId === "p2")).toBeUndefined();
  });
});

// ─── getStoreRefillAlerts ──────────────────────────────────────────────────────

describe("getStoreRefillAlerts", () => {
  it("returns empty array when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getStoreRefillAlerts("store-1");
    expect(result).toEqual([]);
  });

  it("excludes walk-in sales (null customerId)", async () => {
    mockGetDb.mockResolvedValue(makeStoreDb([
      { customerId: null, productId: "p1", createdAt: daysAgo(60), schedule: null },
      { customerId: null, productId: "p1", createdAt: daysAgo(30), schedule: null },
      { customerId: "c1", productId: "p1", createdAt: daysAgo(80), schedule: null },
      { customerId: "c1", productId: "p1", createdAt: daysAgo(50), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getStoreRefillAlerts("store-1");
    expect(result.every((r) => r.customerId !== null)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].customerId).toBe("c1");
  });

  it("returns alerts for multiple customers", async () => {
    mockGetDb.mockResolvedValue(makeStoreDb([
      { customerId: "c1", productId: "p1", createdAt: daysAgo(80), schedule: null },
      { customerId: "c1", productId: "p1", createdAt: daysAgo(50), schedule: null },
      { customerId: "c2", productId: "p1", createdAt: daysAgo(80), schedule: null },
      { customerId: "c2", productId: "p1", createdAt: daysAgo(50), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getStoreRefillAlerts("store-1");
    expect(result).toHaveLength(2);
  });

  it("sorted by riskScore descending", async () => {
    // c1: 30d interval, 50d since → critical; c2: 30d interval, 20d since → low
    mockGetDb.mockResolvedValue(makeStoreDb([
      { customerId: "c1", productId: "p1", createdAt: daysAgo(80), schedule: null },
      { customerId: "c1", productId: "p1", createdAt: daysAgo(50), schedule: null },
      { customerId: "c2", productId: "p1", createdAt: daysAgo(50), schedule: null },
      { customerId: "c2", productId: "p1", createdAt: daysAgo(20), schedule: null },
    ]) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getStoreRefillAlerts("store-1");
    expect(result[0].customerId).toBe("c1");
    expect(result[0].riskScore).toBeGreaterThan(result[1].riskScore);
  });

  it("limit option caps the results", async () => {
    const rows: StoreRow[] = ["c1", "c2", "c3", "c4", "c5"].flatMap((cid) => [
      { customerId: cid, productId: "p1", createdAt: daysAgo(80), schedule: null },
      { customerId: cid, productId: "p1", createdAt: daysAgo(50), schedule: null },
    ]);
    mockGetDb.mockResolvedValue(makeStoreDb(rows) as unknown as Awaited<ReturnType<typeof getDb>>);
    const result = await getStoreRefillAlerts("store-1", { limit: 3 });
    expect(result).toHaveLength(3);
  });
});
