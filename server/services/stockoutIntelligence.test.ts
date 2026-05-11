import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getStockoutForecast,
  getProductStockoutRisk,
} from "./stockoutIntelligence";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../_core/env", () => ({
  ENV: {
    refillRiskLookbackDays: 180,
    stockoutLookaheadDays: 30,
  },
}));

import { getDb } from "../db";
const mockGetDb = vi.mocked(getDb);

type DemandRow = { productId: string; totalQty: number };
type StockRow = { productId: number; stockQty: number; softLockedQty: number };

// Demand query chain: .select().from().innerJoin().where().groupBy()
function makeDemandDb(demandRows: DemandRow[], stockRows: StockRow[] = []) {
  const callCount = 0;
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            groupBy: () => Promise.resolve(demandRows),
          }),
        }),
        where: () => Promise.resolve(stockRows),
      }),
    }),
  };
}

// For getProductStockoutRisk: first select → demand (no groupBy, just aggregation), second → stock
function makeProductDb(totalQty: number, stockQty = 0, softLockedQty = 0) {
  let callCount = 0;
  const mockSelect = () => {
    callCount++;
    if (callCount === 1) {
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([{ totalQty }]),
          }),
        }),
      };
    }
    return {
      from: () => ({
        where: () =>
          Promise.resolve(stockQty > 0 ? [{ stockQty, softLockedQty }] : []),
      }),
    };
  };
  return { select: mockSelect };
}

beforeEach(() => {
  mockGetDb.mockResolvedValue(
    makeDemandDb([]) as unknown as Awaited<ReturnType<typeof getDb>>
  );
});

// ─── getStockoutForecast ───────────────────────────────────────────────────────

describe("getStockoutForecast", () => {
  it("returns empty array when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    expect(await getStockoutForecast("store-1")).toEqual([]);
  });

  it("returns empty array when no sales demand exists", async () => {
    expect(await getStockoutForecast("store-1")).toEqual([]);
  });

  it("excludes products with 0 or negative demand", async () => {
    mockGetDb.mockResolvedValue(
      makeDemandDb([
        { productId: "p1", totalQty: 0 },
        { productId: "p2", totalQty: -1 },
      ]) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    expect(await getStockoutForecast("store-1")).toEqual([]);
  });

  it("0 stock with any demand → critical risk", async () => {
    mockGetDb.mockResolvedValue(
      makeDemandDb([
        { productId: "p1", totalQty: 90 }, // 90 units over 180 days = 0.5/day; stock = 0 → 0 days
      ]) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1");
    expect(result[0].riskLevel).toBe("critical");
    expect(result[0].daysToStockout).toBe(0);
  });

  it("daysToStockout = currentSellable / averageDailyDemand", async () => {
    // saleLines.productId (varchar) stores "1"; storeSkus.productId (int) is 1 → matched via String(1)="1"
    // 180 units sold over 180 days = 1/day. sellable = stockQty(25) - softLocked(5) = 20. days = 20.
    mockGetDb.mockResolvedValue(
      makeDemandDb(
        [{ productId: "1", totalQty: 180 }],
        [{ productId: 1, stockQty: 25, softLockedQty: 5 }]
      ) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1", { numericStoreId: 42 });
    expect(result[0].averageDailyDemand).toBeCloseTo(1, 5);
    expect(result[0].currentSellable).toBe(20);
    expect(result[0].daysToStockout).toBeCloseTo(20, 1);
  });

  it("riskLevel 'critical' when daysToStockout < 3", async () => {
    // 180 units/180 days = 1/day; stock = 2 → 2 days
    mockGetDb.mockResolvedValue(
      makeDemandDb(
        [{ productId: "1", totalQty: 180 }],
        [{ productId: 1, stockQty: 2, softLockedQty: 0 }]
      ) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1", { numericStoreId: 42 });
    expect(result[0].riskLevel).toBe("critical");
  });

  it("riskLevel 'high' when 3 ≤ daysToStockout < 7", async () => {
    // 1/day; stock = 5 → 5 days
    mockGetDb.mockResolvedValue(
      makeDemandDb(
        [{ productId: "1", totalQty: 180 }],
        [{ productId: 1, stockQty: 5, softLockedQty: 0 }]
      ) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1", { numericStoreId: 42 });
    expect(result[0].riskLevel).toBe("high");
  });

  it("riskLevel 'medium' when 7 ≤ daysToStockout < lookaheadDays(30)", async () => {
    // 1/day; stock = 15 → 15 days
    mockGetDb.mockResolvedValue(
      makeDemandDb(
        [{ productId: "1", totalQty: 180 }],
        [{ productId: 1, stockQty: 15, softLockedQty: 0 }]
      ) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1", { numericStoreId: 42 });
    expect(result[0].riskLevel).toBe("medium");
  });

  it("riskLevel 'low' when daysToStockout ≥ lookaheadDays", async () => {
    // 1/day; stock = 60 → 60 days ≥ 30 → low
    mockGetDb.mockResolvedValue(
      makeDemandDb(
        [{ productId: "1", totalQty: 180 }],
        [{ productId: 1, stockQty: 60, softLockedQty: 0 }]
      ) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1", { numericStoreId: 42 });
    expect(result[0].riskLevel).toBe("low");
  });

  it("softLockedQty is subtracted from stockQty", async () => {
    // stockQty=30, softLocked=20 → sellable=10; demand=1/day → 10 days → medium
    mockGetDb.mockResolvedValue(
      makeDemandDb(
        [{ productId: "1", totalQty: 180 }],
        [{ productId: 1, stockQty: 30, softLockedQty: 20 }]
      ) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1", { numericStoreId: 42 });
    expect(result[0].currentSellable).toBe(10);
    expect(result[0].daysToStockout).toBeCloseTo(10, 1);
    expect(result[0].riskLevel).toBe("medium");
  });

  it("forecastedStockoutDate is approx now + daysToStockout", async () => {
    // 1/day; stock = 5 → 5 days
    mockGetDb.mockResolvedValue(
      makeDemandDb(
        [{ productId: "1", totalQty: 180 }],
        [{ productId: 1, stockQty: 5, softLockedQty: 0 }]
      ) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const before = Date.now();
    const result = await getStockoutForecast("store-1", { numericStoreId: 42 });
    const after = Date.now();
    const fivedays = 5 * 24 * 60 * 60 * 1000;
    expect(result[0].forecastedStockoutDate!.getTime()).toBeGreaterThanOrEqual(
      before + fivedays - 2000
    );
    expect(result[0].forecastedStockoutDate!.getTime()).toBeLessThanOrEqual(
      after + fivedays + 2000
    );
  });

  it("results sorted by riskScore descending", async () => {
    // "1": 0 stock → critical; "2": 60 stock → low
    mockGetDb.mockResolvedValue(
      makeDemandDb(
        [
          { productId: "1", totalQty: 180 },
          { productId: "2", totalQty: 180 },
        ],
        [
          { productId: 1, stockQty: 0, softLockedQty: 0 },
          { productId: 2, stockQty: 60, softLockedQty: 0 },
        ]
      ) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1", { numericStoreId: 42 });
    expect(result[0].riskScore).toBeGreaterThan(result[1].riskScore);
  });

  it("limit option caps results", async () => {
    mockGetDb.mockResolvedValue(
      makeDemandDb([
        { productId: "p1", totalQty: 180 },
        { productId: "p2", totalQty: 180 },
        { productId: "p3", totalQty: 180 },
        { productId: "p4", totalQty: 180 },
      ]) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1", { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it("minRiskLevel filters out low-risk entries", async () => {
    // "1": 0 stock → critical; "2": 60 stock → low
    mockGetDb.mockResolvedValue(
      makeDemandDb(
        [
          { productId: "1", totalQty: 180 },
          { productId: "2", totalQty: 180 },
        ],
        [
          { productId: 1, stockQty: 0, softLockedQty: 0 },
          { productId: 2, stockQty: 60, softLockedQty: 0 },
        ]
      ) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getStockoutForecast("store-1", {
      numericStoreId: 42,
      minRiskLevel: "high",
    });
    expect(result.every(r => ["high", "critical"].includes(r.riskLevel))).toBe(
      true
    );
  });

  it("products without matching stock default to 0 currentSellable", async () => {
    // demand for product "1" but no matching stock row → sellable = 0 → critical
    mockGetDb.mockResolvedValue(
      makeDemandDb([{ productId: "1", totalQty: 180 }]) as unknown as Awaited<
        ReturnType<typeof getDb>
      >
    );
    const result = await getStockoutForecast("store-1", { numericStoreId: 42 });
    expect(result[0].currentSellable).toBe(0);
    expect(result[0].riskLevel).toBe("critical");
  });
});

// ─── getProductStockoutRisk ────────────────────────────────────────────────────

describe("getProductStockoutRisk", () => {
  it("returns null when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getDb>>
    );
    expect(await getProductStockoutRisk("p1", "store-1")).toBeNull();
  });

  it("0 demand → averageDailyDemand = 0, daysToStockout = -1 (infinite), riskLevel low", async () => {
    mockGetDb.mockResolvedValue(
      makeProductDb(0) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getProductStockoutRisk("p1", "store-1");
    expect(result!.averageDailyDemand).toBe(0);
    expect(result!.daysToStockout).toBe(-1);
    expect(result!.riskLevel).toBe("low");
    expect(result!.forecastedStockoutDate).toBeNull();
  });

  it("returns correct risk for product with known demand and stock", async () => {
    // 180 units / 180 days = 1/day; stock = 5 → 5 days → high
    mockGetDb.mockResolvedValue(
      makeProductDb(180, 5, 0) as unknown as Awaited<ReturnType<typeof getDb>>
    );
    const result = await getProductStockoutRisk("p1", "store-1", {
      numericStoreId: 42,
    });
    expect(result!.daysToStockout).toBeCloseTo(5, 1);
    expect(result!.riskLevel).toBe("high");
  });
});
