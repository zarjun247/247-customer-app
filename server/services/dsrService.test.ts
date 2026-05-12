import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createAccessRequest,
  createExportRequest,
  createRectificationRequest,
  createErasureRequest,
  confirmErasureRequest,
  getConsentLog,
  createGrievanceRequest,
  getDsrStatus,
} from "./dsrService";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("./audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("pino", () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../_core/env", () => ({
  ENV: { dpoEmail: "dpo@example.com" },
}));

const { getDb } = await import("../db");

function makeInsertChain(id: string = "test-uuid") {
  const values = vi.fn().mockResolvedValue({ insertId: id });
  const insert = vi.fn().mockReturnValue({ values });
  return { insert };
}

function makeSelectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select };
}

function makeUpdateChain() {
  const where = vi.fn().mockResolvedValue({});
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  return { update };
}

function makeOrderedSelectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select };
}

function makeFullDb(rows: unknown[] = [], insertId: string = "uuid-1") {
  return {
    ...makeInsertChain(insertId),
    ...makeUpdateChain(),
    ...makeSelectChain(rows),
    transaction: vi
      .fn()
      .mockImplementation((fn: (...args: unknown[]) => unknown) =>
        fn({
          ...makeSelectChain(rows),
          ...makeUpdateChain(),
        })
      ),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAccessRequest", () => {
  it("creates a DSR access request and returns requestId", async () => {
    const db = {
      insert: vi
        .fn()
        .mockReturnValue({ values: vi.fn().mockResolvedValue({}) }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, name: "Test" }]),
          }),
        }),
      }),
    };
    (getDb as any).mockResolvedValue(db);

    const result = await createAccessRequest({ customerId: 1 });
    expect(result.requestId).toBeDefined();
    expect(typeof result.requestId).toBe("string");
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    (getDb as any).mockResolvedValue(null);
    await expect(createAccessRequest({ customerId: 1 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});

describe("createExportRequest", () => {
  it("returns a requestId for JSON export", async () => {
    const db = makeFullDb([{ id: 1 }]);
    (getDb as any).mockResolvedValue(db);
    const r = await createExportRequest({
      customerId: 1,
      exportFormat: "json",
    });
    expect(r.requestId).toBeDefined();
  });

  it("returns a requestId for CSV export", async () => {
    const db = makeFullDb([]);
    (getDb as any).mockResolvedValue(db);
    const r = await createExportRequest({
      customerId: 1,
      exportFormat: "csv",
    });
    expect(r.requestId).toBeDefined();
  });
});

describe("createRectificationRequest", () => {
  it("creates pending rectification request", async () => {
    const db = makeFullDb();
    (getDb as any).mockResolvedValue(db);
    const r = await createRectificationRequest({
      customerId: 2,
      fieldChanges: [
        {
          field: "email",
          oldValue: "old@x.com",
          newValue: "new@x.com",
          reason: "Typo",
        },
      ],
    });
    expect(r.requestId).toBeDefined();
    expect(db.insert).toHaveBeenCalled();
  });
});

describe("createErasureRequest", () => {
  it("returns requestId, confirmationToken, and confirmationExpiresAt", async () => {
    const db = makeFullDb();
    (getDb as any).mockResolvedValue(db);
    const r = await createErasureRequest({ customerId: 3, scope: "all" });
    expect(r.requestId).toBeDefined();
    expect(r.confirmationToken).toBeDefined();
    expect(r.confirmationToken.length).toBeGreaterThan(10);
    expect(r.confirmationExpiresAt).toBeInstanceOf(Date);
    const ttl = r.confirmationExpiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(ttl).toBeLessThan(8 * 24 * 60 * 60 * 1000);
  });

  it("supports marketing_only scope", async () => {
    const db = makeFullDb();
    (getDb as any).mockResolvedValue(db);
    const r = await createErasureRequest({
      customerId: 1,
      scope: "marketing_only",
    });
    expect(r.requestId).toBeDefined();
  });
});

describe("confirmErasureRequest", () => {
  it("confirms a valid pending erasure request", async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const req = {
      id: "req-1",
      customerId: 5,
      requestStatus: "pending",
      confirmationToken: "valid-token-abc123",
      confirmationExpiresAt: expiresAt,
    };

    const limit = vi.fn().mockResolvedValue([req]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const txSelect = vi.fn().mockReturnValue({ from });
    const txWhere = vi.fn().mockResolvedValue({});
    const txSet = vi.fn().mockReturnValue({ where: txWhere });
    const txUpdate = vi.fn().mockReturnValue({ set: txSet });

    const db = {
      transaction: vi
        .fn()
        .mockImplementation((fn: (...args: unknown[]) => unknown) =>
          fn({ select: txSelect, update: txUpdate })
        ),
    };
    (getDb as any).mockResolvedValue(db);

    const r = await confirmErasureRequest({
      requestId: "req-1",
      confirmationToken: "valid-token-abc123",
    });
    expect(r.ok).toBe(true);
    expect(txUpdate).toHaveBeenCalled();
  });

  it("throws NOT_FOUND when request does not exist", async () => {
    const db = {
      transaction: vi
        .fn()
        .mockImplementation((fn: (...args: unknown[]) => unknown) =>
          fn({
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
            update: vi.fn(),
          })
        ),
    };
    (getDb as any).mockResolvedValue(db);

    await expect(
      confirmErasureRequest({ requestId: "missing", confirmationToken: "x" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when already confirmed", async () => {
    const req = {
      id: "req-2",
      customerId: 1,
      requestStatus: "confirmed",
      confirmationToken: "tok",
      confirmationExpiresAt: new Date(Date.now() + 1000),
    };
    const db = {
      transaction: vi
        .fn()
        .mockImplementation((fn: (...args: unknown[]) => unknown) =>
          fn({
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([req]),
                }),
              }),
            }),
            update: vi.fn(),
          })
        ),
    };
    (getDb as any).mockResolvedValue(db);

    await expect(
      confirmErasureRequest({ requestId: "req-2", confirmationToken: "tok" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws FORBIDDEN when confirmation token is wrong", async () => {
    const req = {
      id: "req-3",
      customerId: 1,
      requestStatus: "pending",
      confirmationToken: "correct-token",
      confirmationExpiresAt: new Date(Date.now() + 1000),
    };
    const db = {
      transaction: vi
        .fn()
        .mockImplementation((fn: (...args: unknown[]) => unknown) =>
          fn({
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([req]),
                }),
              }),
            }),
            update: vi.fn(),
          })
        ),
    };
    (getDb as any).mockResolvedValue(db);

    await expect(
      confirmErasureRequest({ requestId: "req-3", confirmationToken: "wrong" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("marks request expired when confirmation window has passed", async () => {
    const expired = new Date(Date.now() - 1000);
    const req = {
      id: "req-4",
      customerId: 1,
      requestStatus: "pending",
      confirmationToken: "tok",
      confirmationExpiresAt: expired,
    };
    const txWhere = vi.fn().mockResolvedValue({});
    const txSet = vi.fn().mockReturnValue({ where: txWhere });
    const txUpdate = vi.fn().mockReturnValue({ set: txSet });
    const db = {
      transaction: vi
        .fn()
        .mockImplementation((fn: (...args: unknown[]) => unknown) =>
          fn({
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([req]),
                }),
              }),
            }),
            update: txUpdate,
          })
        ),
    };
    (getDb as any).mockResolvedValue(db);

    await expect(
      confirmErasureRequest({ requestId: "req-4", confirmationToken: "tok" })
    ).rejects.toMatchObject({ message: /expired/ });

    expect(txUpdate).toHaveBeenCalled();
    const setArgs = txSet.mock.calls[0][0];
    expect(setArgs.requestStatus).toBe("expired");
  });
});

describe("getConsentLog", () => {
  it("returns requestId and consent entries", async () => {
    const consentRow = {
      consentType: "refill_reminder",
      status: "granted",
      grantedAt: new Date(),
      revokedAt: null,
    };
    const db = makeFullDb([consentRow]);
    (getDb as any).mockResolvedValue(db);

    const r = await getConsentLog({ customerId: 10 });
    expect(r.requestId).toBeDefined();
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].consentType).toBe("refill_reminder");
  });
});

describe("createGrievanceRequest", () => {
  it("returns requestId and dpoEmail", async () => {
    const db = makeFullDb();
    (getDb as any).mockResolvedValue(db);

    const r = await createGrievanceRequest({
      customerId: 5,
      grievanceText: "My data was used without consent.",
      category: "consent_violation",
    });

    expect(r.requestId).toBeDefined();
    expect(r.dpoEmail).toBe("dpo@example.com");
  });

  it("throws INTERNAL_SERVER_ERROR when DB unavailable", async () => {
    (getDb as any).mockResolvedValue(null);
    await expect(
      createGrievanceRequest({
        customerId: 1,
        grievanceText: "test",
        category: "test",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("getDsrStatus", () => {
  it("returns the request row when found", async () => {
    const row = {
      id: "req-abc",
      customerId: 1,
      requestKind: "access",
      requestStatus: "completed",
    };
    const db = makeSelectChain([row]);
    (getDb as any).mockResolvedValue(db);

    const r = await getDsrStatus({ requestId: "req-abc", customerId: 1 });
    expect(r.id).toBe("req-abc");
  });

  it("throws NOT_FOUND when request is missing", async () => {
    const db = makeSelectChain([]);
    (getDb as any).mockResolvedValue(db);

    await expect(
      getDsrStatus({ requestId: "missing", customerId: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
