import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── In-memory stores ─────────────────────────────────────────────────────────

type DefRow = { capabilityName: string; description: string; riskLevel: string; createdAt: Date };
type GrantRow = {
  id: string;
  userId: string;
  capabilityName: string;
  grantedByUserId: string | null;
  grantedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  reason: string | null;
};

let defStore: DefRow[] = [];
let grantStore: GrantRow[] = [];

function buildMockDb() {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: (cond?: unknown) => ({
          limit: (n: number) => {
            // Discriminate by table reference (duck-type on property names)
            const isDefTable = (table as any)?._?.name === "capability_definitions" ||
              (table as any)?.capabilityName?.name === "capability_name";
            if (isDefTable) return Promise.resolve(defStore.slice(0, n));
            return Promise.resolve(grantStore.slice(0, n));
          },
        }),
        limit: (n: number) => Promise.resolve(grantStore.slice(0, n)),
      }),
    }),
    insert: () => ({
      values: (row: GrantRow | DefRow) => {
        if ("capabilityName" in row && !("userId" in row)) {
          defStore.push(row as DefRow);
        } else {
          grantStore.push(row as GrantRow);
        }
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (updates: Partial<GrantRow>) => ({
        where: () => {
          const target = grantStore.find((r) => r.revokedAt === null);
          if (target) Object.assign(target, updates);
          return Promise.resolve();
        },
      }),
    }),
  };
}

vi.mock("../db", () => ({ getDb: vi.fn(() => Promise.resolve(buildMockDb())) }));
vi.mock("./auditHashChain", () => ({ appendChainedAudit: vi.fn(() => Promise.resolve({ sequenceNumber: 1, rowHash: "abc" })) }));

import { getDb } from "../db";
import { appendChainedAudit } from "./auditHashChain";
import {
  grantCapability,
  revokeCapability,
  hasCapability,
  getUserCapabilities,
  listGrants,
  getCapabilityDefinitions,
  CapabilityDefinitionNotFoundError,
  ActiveGrantNotFoundError,
} from "./capabilityGrantService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function seedDef(name: string, riskLevel = "high") {
  defStore.push({ capabilityName: name, description: `${name} description`, riskLevel, createdAt: new Date() });
}

function seedGrant(overrides: Partial<GrantRow> = {}): GrantRow {
  const row: GrantRow = {
    id: `grant-${grantStore.length + 1}`,
    userId: "42",
    capabilityName: "audit.view",
    grantedByUserId: "1",
    grantedAt: new Date(),
    expiresAt: null,
    revokedAt: null,
    revokedByUserId: null,
    reason: null,
    ...overrides,
  };
  grantStore.push(row);
  return row;
}

beforeEach(() => {
  defStore = [];
  grantStore = [];
  vi.mocked(getDb).mockImplementation(() => Promise.resolve(buildMockDb() as any));
  vi.mocked(appendChainedAudit).mockResolvedValue({ sequenceNumber: 1, rowHash: "abc" });
});

// ─── grantCapability ──────────────────────────────────────────────────────────

describe("grantCapability", () => {
  it("inserts a grant row and returns its id", async () => {
    seedDef("audit.view");
    const result = await grantCapability({ userId: 42, capabilityName: "audit.view", grantedByUserId: 1 });
    expect(result.id).toBeTruthy();
    expect(grantStore.length).toBe(1);
    expect(grantStore[0].userId).toBe("42");
    expect(grantStore[0].capabilityName).toBe("audit.view");
    expect(grantStore[0].revokedAt).toBeNull();
  });

  it("stores expiresAt when provided", async () => {
    seedDef("audit.view");
    const future = new Date(Date.now() + 3_600_000);
    await grantCapability({ userId: 5, capabilityName: "audit.view", expiresAt: future });
    expect(grantStore[0].expiresAt).toEqual(future);
  });

  it("throws CapabilityDefinitionNotFoundError for unknown capability", async () => {
    await expect(grantCapability({ userId: 1, capabilityName: "no.such.cap" })).rejects.toBeInstanceOf(
      CapabilityDefinitionNotFoundError,
    );
  });

  it("throws when db is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(null as any);
    await expect(grantCapability({ userId: 1, capabilityName: "audit.view" })).rejects.toThrow("DB unavailable");
  });

  it("appends an audit chain entry after successful grant", async () => {
    seedDef("rbac.grant");
    await grantCapability({ userId: 7, capabilityName: "rbac.grant", grantedByUserId: 1 });
    expect(appendChainedAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "capability.granted", entityType: "capability_grant" }),
    );
  });
});

// ─── revokeCapability ─────────────────────────────────────────────────────────

describe("revokeCapability", () => {
  it("sets revokedAt on the active grant", async () => {
    seedDef("audit.view");
    seedGrant({ userId: "10", capabilityName: "audit.view" });
    await revokeCapability({ userId: 10, capabilityName: "audit.view", revokedByUserId: 1 });
    expect(grantStore[0].revokedAt).not.toBeNull();
    expect(grantStore[0].revokedByUserId).toBe("1");
  });

  it("throws ActiveGrantNotFoundError when no active grant exists", async () => {
    await expect(revokeCapability({ userId: 99, capabilityName: "audit.view" })).rejects.toBeInstanceOf(
      ActiveGrantNotFoundError,
    );
  });

  it("throws when db is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(null as any);
    await expect(revokeCapability({ userId: 1, capabilityName: "audit.view" })).rejects.toThrow("DB unavailable");
  });

  it("appends an audit chain entry after successful revoke", async () => {
    seedDef("audit.view");
    seedGrant({ userId: "20", capabilityName: "audit.view" });
    await revokeCapability({ userId: 20, capabilityName: "audit.view", revokedByUserId: 2 });
    expect(appendChainedAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "capability.revoked", entityType: "capability_grant" }),
    );
  });
});

// ─── hasCapability ────────────────────────────────────────────────────────────

describe("hasCapability", () => {
  it("returns true for an active non-expired grant", async () => {
    seedGrant({ userId: "5", capabilityName: "audit.view", expiresAt: null });
    vi.mocked(getDb).mockImplementation(async () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([grantStore.find((r) => r.userId === "5" && r.revokedAt === null)]),
          }),
        }),
      }),
    } as any));
    const result = await hasCapability(5, "audit.view");
    expect(result).toBe(true);
  });

  it("returns false for a revoked grant", async () => {
    seedGrant({ userId: "6", capabilityName: "audit.view", revokedAt: new Date() });
    vi.mocked(getDb).mockImplementation(async () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]), // WHERE revokedAt IS NULL finds nothing
          }),
        }),
      }),
    } as any));
    const result = await hasCapability(6, "audit.view");
    expect(result).toBe(false);
  });

  it("returns false for an expired grant", async () => {
    const pastDate = new Date(Date.now() - 1000);
    const row = seedGrant({ userId: "7", capabilityName: "audit.view", expiresAt: pastDate });
    vi.mocked(getDb).mockImplementation(async () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([row]),
          }),
        }),
      }),
    } as any));
    const result = await hasCapability(7, "audit.view", new Date());
    expect(result).toBe(false);
  });

  it("returns false when db unavailable", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(null as any);
    const result = await hasCapability(1, "audit.view");
    expect(result).toBe(false);
  });
});

// ─── getUserCapabilities ──────────────────────────────────────────────────────

describe("getUserCapabilities", () => {
  it("returns only active non-expired grants for a user", async () => {
    const now = new Date();
    const future = new Date(Date.now() + 3_600_000);
    const past = new Date(Date.now() - 1000);
    const activeRows = [
      { id: "g1", userId: "8", capabilityName: "audit.view", grantedAt: now, expiresAt: null, revokedAt: null, grantedByUserId: null, revokedByUserId: null, reason: null },
      { id: "g2", userId: "8", capabilityName: "refund.large", grantedAt: now, expiresAt: future, revokedAt: null, grantedByUserId: null, revokedByUserId: null, reason: null },
      { id: "g3", userId: "8", capabilityName: "inventory.adjust", grantedAt: now, expiresAt: past, revokedAt: null, grantedByUserId: null, revokedByUserId: null, reason: null },
    ];
    vi.mocked(getDb).mockImplementation(async () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(activeRows),
          }),
        }),
      }),
    } as any));
    const result = await getUserCapabilities(8, now);
    expect(result.length).toBe(2); // g3 is expired
    expect(result.map((r) => r.capabilityName)).toContain("audit.view");
    expect(result.map((r) => r.capabilityName)).toContain("refund.large");
  });
});

// ─── listGrants / getCapabilityDefinitions ────────────────────────────────────

describe("listGrants", () => {
  it("returns empty array when db is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(null as any);
    const result = await listGrants();
    expect(result).toEqual([]);
  });

  it("returns grants from the store", async () => {
    const row = seedGrant();
    vi.mocked(getDb).mockImplementation(async () => ({
      select: () => ({
        from: () => ({
          limit: () => Promise.resolve([row]),
        }),
      }),
    } as any));
    const result = await listGrants({ includeRevoked: true });
    expect(result.length).toBe(1);
  });
});

describe("getCapabilityDefinitions", () => {
  it("returns mapped definitions", async () => {
    vi.mocked(getDb).mockImplementation(async () => ({
      select: () => ({
        from: () => ({
          limit: () => Promise.resolve([
            { capabilityName: "audit.view", description: "View audit log", riskLevel: "medium", createdAt: new Date() },
          ]),
        }),
      }),
    } as any));
    const result = await getCapabilityDefinitions();
    expect(result.length).toBe(1);
    expect(result[0].capabilityName).toBe("audit.view");
  });

  it("returns empty array when db is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(null as any);
    const result = await getCapabilityDefinitions();
    expect(result).toEqual([]);
  });
});
