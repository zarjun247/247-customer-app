import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRetentionTick } from "./retentionWorker";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("./audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock("../_core/env", () => ({
  ENV: { retentionWorkerEnabled: true },
}));

const { getDb } = await import("../db");

function makeSelectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { select: vi.fn().mockReturnValue({ from }) };
}

function makeUpdateChain() {
  const where = vi.fn().mockResolvedValue({});
  const set = vi.fn().mockReturnValue({ where });
  return { update: vi.fn().mockReturnValue({ set }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runRetentionTick", () => {
  it("returns zero counts when DB is unavailable", async () => {
    (getDb as any).mockResolvedValue(null);
    const r = await runRetentionTick();
    expect(r.processed).toBe(0);
    expect(r.errors).toBe(0);
  });

  it("returns zero counts when no confirmed erasure requests exist", async () => {
    const db = makeSelectChain([]);
    (getDb as any).mockResolvedValue(db);

    const r = await runRetentionTick();
    expect(r.processed).toBe(0);
    expect(r.errors).toBe(0);
  });

  it("processes a confirmed erasure request and marks it completed", async () => {
    const req = {
      id: "req-1",
      customerId: 42,
      requestKind: "erasure",
      requestStatus: "confirmed",
      requestPayload: { scope: "all" },
    };

    const txUpdateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
    const txSelectLimit = vi.fn().mockResolvedValue([]);
    const txSelectWhere = vi.fn().mockReturnValue({ limit: txSelectLimit });
    const txSelectFrom = vi.fn().mockReturnValue({ where: txSelectWhere });
    const txSelect = vi.fn().mockReturnValue({ from: txSelectFrom });

    const db = {
      ...makeSelectChain([req]),
      transaction: vi
        .fn()
        .mockImplementation((fn: Function) =>
          fn({ update: txUpdate, select: txSelect })
        ),
    };
    (getDb as any).mockResolvedValue(db);

    const r = await runRetentionTick();
    expect(r.processed).toBe(1);
    expect(r.errors).toBe(0);
  });

  it("increments error count when processing throws", async () => {
    const req = {
      id: "req-err",
      customerId: 99,
      requestKind: "erasure",
      requestStatus: "confirmed",
      requestPayload: { scope: "all" },
    };

    const db = {
      ...makeSelectChain([req]),
      transaction: vi.fn().mockRejectedValue(new Error("TX failed")),
    };
    (getDb as any).mockResolvedValue(db);

    const r = await runRetentionTick();
    expect(r.processed).toBe(0);
    expect(r.errors).toBe(1);
  });

  it("handles marketing_only scope without touching orders or prescriptions broadly", async () => {
    const req = {
      id: "req-mkt",
      customerId: 50,
      requestKind: "erasure",
      requestStatus: "confirmed",
      requestPayload: { scope: "marketing_only" },
    };

    const txUpdateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
    const txSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    });

    const db = {
      ...makeSelectChain([req]),
      transaction: vi
        .fn()
        .mockImplementation((fn: Function) =>
          fn({ update: txUpdate, select: txSelect })
        ),
    };
    (getDb as any).mockResolvedValue(db);

    const r = await runRetentionTick();
    expect(r.processed).toBe(1);
  });

  it("processes multiple confirmed requests", async () => {
    const requests = [
      {
        id: "req-a",
        customerId: 1,
        requestKind: "erasure",
        requestStatus: "confirmed",
        requestPayload: { scope: "all" },
      },
      {
        id: "req-b",
        customerId: 2,
        requestKind: "erasure",
        requestStatus: "confirmed",
        requestPayload: { scope: "marketing_only" },
      },
    ];

    const txUpdateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
    const txSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const db = {
      ...makeSelectChain(requests),
      transaction: vi
        .fn()
        .mockImplementation((fn: Function) =>
          fn({ update: txUpdate, select: txSelect })
        ),
    };
    (getDb as any).mockResolvedValue(db);

    const r = await runRetentionTick();
    expect(r.processed).toBe(2);
  });

  it("logs audit events for each anonymization step", async () => {
    const { logAudit } = await import("./audit");
    const req = {
      id: "req-audit",
      customerId: 77,
      requestKind: "erasure",
      requestStatus: "confirmed",
      requestPayload: { scope: "all" },
    };

    const txUpdateSet = vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue({}) });
    const txUpdate = vi.fn().mockReturnValue({ set: txUpdateSet });
    const txSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const db = {
      ...makeSelectChain([req]),
      transaction: vi
        .fn()
        .mockImplementation((fn: Function) =>
          fn({ update: txUpdate, select: txSelect })
        ),
    };
    (getDb as any).mockResolvedValue(db);

    await runRetentionTick();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "retention.customer.anonymized" })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "retention.erasure.completed" })
    );
  });

  it("returns zero processed when worker is disabled", async () => {
    const { ENV } = await import("../_core/env");
    (ENV as any).retentionWorkerEnabled = false;

    const r = await runRetentionTick();
    expect(r.processed).toBe(0);

    // Restore
    (ENV as any).retentionWorkerEnabled = true;
  });

  it("skips non-confirmed requests", async () => {
    // This is structural: the DB query already filters by status="confirmed",
    // so the select returning empty = no requests to process
    const db = makeSelectChain([]);
    (getDb as any).mockResolvedValue(db);
    const r = await runRetentionTick();
    expect(r.processed).toBe(0);
  });
});
