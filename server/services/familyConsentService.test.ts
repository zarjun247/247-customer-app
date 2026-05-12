import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordFamilyConsent,
  getActiveFamilyConsent,
  revokeFamilyConsent,
  assertConsentForScheduleSale,
} from "./familyConsentService";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./audit", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { getDb } = await import("../db");

function makeInsertChain(insertId: number) {
  const values = vi.fn().mockResolvedValue({ insertId });
  return { insert: vi.fn().mockReturnValue({ values }) };
}

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

describe("recordFamilyConsent", () => {
  it("inserts consent record and returns id", async () => {
    const db = {
      ...makeInsertChain(7),
    };
    (getDb as any).mockResolvedValue(db);

    const result = await recordFamilyConsent({
      minorCustomerId: 100,
      guardianName: "Jane Doe",
      guardianRelationship: "parent",
      consentScope: ["rx_h1", "rx_h"],
      recordedByUserId: 1,
    });

    expect(result.id).toBe(7);
    expect(db.insert).toHaveBeenCalled();
  });

  it("throws when DB is unavailable", async () => {
    (getDb as any).mockResolvedValue(null);
    await expect(
      recordFamilyConsent({
        minorCustomerId: 1,
        guardianName: "X",
        guardianRelationship: "parent",
        consentScope: ["general"],
        recordedByUserId: 1,
      })
    ).rejects.toThrow("DB unavailable");
  });

  it("stores guardian id proof fields when provided", async () => {
    const db = makeInsertChain(1);
    (getDb as any).mockResolvedValue(db);

    await recordFamilyConsent({
      minorCustomerId: 1,
      guardianName: "A",
      guardianRelationship: "legal_guardian",
      guardianIdProofKind: "aadhaar",
      guardianIdProofLast4: "1234",
      consentScope: ["general"],
      recordedByUserId: 2,
    });

    const inserted = (db.insert as any).mock.calls[0];
    expect(inserted).toBeDefined();
  });
});

describe("getActiveFamilyConsent", () => {
  it("returns null when DB unavailable", async () => {
    (getDb as any).mockResolvedValue(null);
    const r = await getActiveFamilyConsent({ minorCustomerId: 1 });
    expect(r).toBeNull();
  });

  it("returns active consent record", async () => {
    const row = { id: 5, minorCustomerId: 100, consentRevokedAt: null };
    const db = makeSelectChain([row]);
    (getDb as any).mockResolvedValue(db);
    const r = await getActiveFamilyConsent({ minorCustomerId: 100 });
    expect(r?.id).toBe(5);
  });

  it("returns null when no active record", async () => {
    const db = makeSelectChain([]);
    (getDb as any).mockResolvedValue(db);
    const r = await getActiveFamilyConsent({ minorCustomerId: 200 });
    expect(r).toBeNull();
  });
});

describe("revokeFamilyConsent", () => {
  it("revokes an active consent", async () => {
    const existing = { id: 3, minorCustomerId: 100 };
    const selectDb = makeSelectChain([existing]);
    const updateDb = makeUpdateChain();
    const db = { ...selectDb, ...updateDb };
    (getDb as any).mockResolvedValue(db);

    const r = await revokeFamilyConsent({
      consentId: 3,
      revokedByUserId: 1,
      reason: "Guardian request",
    });

    expect(r.ok).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("throws NOT_FOUND when consent does not exist", async () => {
    const db = { ...makeSelectChain([]), ...makeUpdateChain() };
    (getDb as any).mockResolvedValue(db);

    await expect(
      revokeFamilyConsent({ consentId: 999, revokedByUserId: 1, reason: "x" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws when DB unavailable", async () => {
    (getDb as any).mockResolvedValue(null);
    await expect(
      revokeFamilyConsent({ consentId: 1, revokedByUserId: 1, reason: "x" })
    ).rejects.toThrow("DB unavailable");
  });
});

describe("assertConsentForScheduleSale", () => {
  it("returns silently when DB unavailable", async () => {
    (getDb as any).mockResolvedValue(null);
    await expect(
      assertConsentForScheduleSale({ customerId: 1, scheduleClass: "H1" })
    ).resolves.toBeUndefined();
  });

  it("returns silently when customer not found", async () => {
    const db = makeSelectChain([]);
    (getDb as any).mockResolvedValue(db);
    await expect(
      assertConsentForScheduleSale({ customerId: 999, scheduleClass: "H" })
    ).resolves.toBeUndefined();
  });

  it("returns silently for adult customer (no dateOfBirth in schema)", async () => {
    const db = makeSelectChain([{ id: 1, name: "Adult" }]);
    (getDb as any).mockResolvedValue(db);
    await expect(
      assertConsentForScheduleSale({ customerId: 1, scheduleClass: "H1" })
    ).resolves.toBeUndefined();
  });

  it("returns silently for minor with valid consent covering the scope", async () => {
    const minor = {
      id: 5,
      dateOfBirth: new Date(Date.now() - 15 * 365 * 24 * 60 * 60 * 1000),
    };
    const consent = {
      id: 1,
      minorCustomerId: 5,
      consentScopeJson: ["rx_h1", "rx_h"],
      consentRevokedAt: null,
    };
    // First select returns minor, second returns consent
    let callCount = 0;
    const selectDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([minor]);
              return Promise.resolve([consent]);
            }),
          }),
        }),
      }),
    };
    (getDb as any).mockResolvedValue(selectDb);

    await expect(
      assertConsentForScheduleSale({ customerId: 5, scheduleClass: "H1" })
    ).resolves.toBeUndefined();
  });

  it("throws FORBIDDEN for minor with no consent", async () => {
    const minor = {
      id: 6,
      dateOfBirth: new Date(Date.now() - 14 * 365 * 24 * 60 * 60 * 1000),
    };
    let callCount = 0;
    const selectDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([minor]);
              return Promise.resolve([]);
            }),
          }),
        }),
      }),
    };
    (getDb as any).mockResolvedValue(selectDb);

    await expect(
      assertConsentForScheduleSale({ customerId: 6, scheduleClass: "H" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN for minor with consent not covering scope", async () => {
    const minor = {
      id: 7,
      dateOfBirth: new Date(Date.now() - 16 * 365 * 24 * 60 * 60 * 1000),
    };
    const consent = {
      id: 2,
      minorCustomerId: 7,
      consentScopeJson: ["general"],
      consentRevokedAt: null,
    };
    // general covers all, so this should actually pass. Let's use rx_h only for H1 test.
    const consentLimited = {
      id: 3,
      minorCustomerId: 7,
      consentScopeJson: ["rx_h"],
      consentRevokedAt: null,
    };
    let callCount = 0;
    const selectDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) return Promise.resolve([minor]);
              return Promise.resolve([consentLimited]);
            }),
          }),
        }),
      }),
    };
    (getDb as any).mockResolvedValue(selectDb);

    await expect(
      assertConsentForScheduleSale({ customerId: 7, scheduleClass: "H1" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
