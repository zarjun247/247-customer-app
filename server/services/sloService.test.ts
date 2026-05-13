import { describe, it, expect, vi, beforeEach } from "vitest";

const mockValues = vi.fn().mockResolvedValue({});
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
const mockSelectChain = { from: vi.fn() };
const mockSelect = vi.fn().mockReturnValue(mockSelectChain);
const mockDb = { insert: mockInsert, select: mockSelect };

const mockGetDb = vi.fn();

vi.mock("../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

import {
  SLO_DEFINITIONS,
  emitSloEvent,
  recordLatencyForSlo,
  getSloBudgetSummary,
} from "./sloService";

describe("SLO_DEFINITIONS", () => {
  const names = SLO_DEFINITIONS.map(d => d.name);

  it("contains all expected SLO names", () => {
    expect(names).toContain("trpc.sale.confirm.p99");
    expect(names).toContain("trpc.purchase.commit.p99");
    expect(names).toContain("trpc.payment.verify.p99");
    expect(names).toContain("http.api.latency.p95");
    expect(names).toContain("provider.razorpay.success.rate");
    expect(names).toContain("provider.whatsapp.success.rate");
    expect(names).toContain("sale.confirmSale.latency");
    expect(names).toContain("purchase.commitPurchaseInvoice.latency");
    expect(names).toContain("payment.captureWebhook.latency");
    expect(names).toContain("prescription.upload.latency");
    expect(names).toContain("ocr.process.latency");
    expect(names).toContain("inventory.adjust.latency");
    expect(names).toContain("dsr.access.latency");
    expect(names).toContain("dsr.erasure.latency");
    expect(names).toContain("retention.tick.duration");
  });

  it("has exactly fifteen entries", () => {
    expect(SLO_DEFINITIONS).toHaveLength(15);
  });

  it("each entry has required shape with valid ranges", () => {
    for (const def of SLO_DEFINITIONS) {
      expect(typeof def.name).toBe("string");
      expect(def.name.length).toBeGreaterThan(0);
      expect(typeof def.target).toBe("number");
      expect(def.target).toBeGreaterThan(0);
      expect(def.target).toBeLessThanOrEqual(1);
      expect(typeof def.windowSeconds).toBe("number");
      expect(def.windowSeconds).toBeGreaterThan(0);
      expect(typeof def.description).toBe("string");
    }
  });

  it("razorpay and whatsapp SLOs use 300-second window", () => {
    const razorpay = SLO_DEFINITIONS.find(
      d => d.name === "provider.razorpay.success.rate"
    );
    const whatsapp = SLO_DEFINITIONS.find(
      d => d.name === "provider.whatsapp.success.rate"
    );
    expect(razorpay?.windowSeconds).toBe(300);
    expect(whatsapp?.windowSeconds).toBe(300);
  });
});

describe("emitSloEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue({});
  });

  it("writes a row to slo_events when DB is available", async () => {
    mockGetDb.mockResolvedValue(mockDb);
    await emitSloEvent({
      sloName: "trpc.sale.confirm.p99",
      target: 0.99,
      measuredValue: 0.05,
      withinBudget: true,
      sampleCount: 1,
      windowSeconds: 60,
    });
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockValues).toHaveBeenCalledOnce();
    const inserted = mockValues.mock.calls[0][0];
    expect(inserted.sloName).toBe("trpc.sale.confirm.p99");
    expect(inserted.withinBudget).toBe(true);
  });

  it("returns silently without throwing when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(null);
    await expect(
      emitSloEvent({
        sloName: "trpc.sale.confirm.p99",
        target: 0.99,
        measuredValue: 0.1,
        withinBudget: true,
      })
    ).resolves.toBeUndefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns silently without throwing when DB insert throws", async () => {
    mockGetDb.mockResolvedValue(mockDb);
    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("db error")),
    });
    await expect(
      emitSloEvent({
        sloName: "trpc.sale.confirm.p99",
        target: 0.99,
        measuredValue: 0.1,
        withinBudget: true,
      })
    ).resolves.toBeUndefined();
  });
});

describe("recordLatencyForSlo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue({});
    mockGetDb.mockResolvedValue(mockDb);
  });

  it("marks withinBudget=true when latency is within the SLO window", async () => {
    await recordLatencyForSlo("trpc.sale.confirm.p99", 0.1);
    expect(mockInsert).toHaveBeenCalledOnce();
    const inserted = mockValues.mock.calls[0][0];
    expect(inserted.withinBudget).toBe(true);
    expect(inserted.sloName).toBe("trpc.sale.confirm.p99");
  });

  it("marks withinBudget=false when latency exceeds the SLO window", async () => {
    await recordLatencyForSlo("trpc.sale.confirm.p99", 61);
    expect(mockInsert).toHaveBeenCalledOnce();
    const inserted = mockValues.mock.calls[0][0];
    expect(inserted.withinBudget).toBe(false);
  });

  it("passes context through to emitSloEvent when provided", async () => {
    await recordLatencyForSlo("http.api.latency.p95", 5, {
      route: "/api/orders",
    });
    const inserted = mockValues.mock.calls[0][0];
    expect(inserted.context).toEqual({ route: "/api/orders" });
  });

  it("returns silently for unknown SLO names without throwing", async () => {
    await expect(
      recordLatencyForSlo("unknown.slo.name", 0.1)
    ).resolves.toBeUndefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("getSloBudgetSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero-state when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(null);
    const result = await getSloBudgetSummary("trpc.sale.confirm.p99");
    expect(result.name).toBe("trpc.sale.confirm.p99");
    expect(result.eventCount).toBe(0);
    expect(result.actualRate).toBe(0);
    expect(result.lastBreachAt).toBeNull();
  });

  it("returns zero-state when no events exist for the SLO", async () => {
    const withChain = {
      where: vi.fn().mockResolvedValue([{ eventCount: 0, withinCount: 0 }]),
    };
    const fromChain = { from: vi.fn().mockReturnValue(withChain) };
    mockSelect.mockReturnValue(fromChain);
    mockGetDb.mockResolvedValue(mockDb);

    const result = await getSloBudgetSummary("trpc.sale.confirm.p99");
    expect(result.eventCount).toBe(0);
    expect(result.actualRate).toBe(0);
    expect(result.lastBreachAt).toBeNull();
  });

  it("returns aggregated budget snapshot when events exist", async () => {
    const breachDate = new Date("2024-01-15T10:00:00Z");
    let selectCallCount = 0;
    mockSelect.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockResolvedValue([{ eventCount: 10, withinCount: 9 }]),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ lastBreachAt: breachDate }]),
        }),
      };
    });
    mockGetDb.mockResolvedValue(mockDb);

    const result = await getSloBudgetSummary("trpc.sale.confirm.p99");
    expect(result.eventCount).toBe(10);
    expect(result.actualRate).toBeCloseTo(0.9);
    expect(result.target).toBe(0.99);
    expect(result.lastBreachAt).toEqual(breachDate);
  });

  it("returns zero-state and does not throw when DB query fails", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("query failed");
    });
    mockGetDb.mockResolvedValue(mockDb);

    await expect(
      getSloBudgetSummary("trpc.sale.confirm.p99")
    ).resolves.toMatchObject({
      eventCount: 0,
      actualRate: 0,
      lastBreachAt: null,
    });
  });
});
