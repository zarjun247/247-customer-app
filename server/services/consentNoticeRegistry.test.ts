import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  publishNotice,
  getActiveNotice,
  listNoticesForKind,
  recordUserAcceptance,
} from "./consentNoticeRegistry";

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function makeSelectChain(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { select: vi.fn().mockReturnValue({ from }), limit, where, from };
}

function makeInsertChain(insertId: number) {
  const values = vi.fn().mockResolvedValue({ insertId });
  return { insert: vi.fn().mockReturnValue({ values }) };
}

const { getDb } = await import("../db");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publishNotice", () => {
  it("inserts a notice and returns id and content hash", async () => {
    const chain = makeInsertChain(42);
    vi.mocked(getDb).mockResolvedValue(chain);

    const result = await publishNotice({
      noticeKind: "privacy_policy",
      version: "1.0.0",
      effectiveFrom: new Date("2025-01-01"),
      contentText: "This is the privacy policy.",
      publishedByUserId: 1,
    });

    expect(result.id).toBe(42);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(chain.insert).toHaveBeenCalled();
  });

  it("computes SHA-256 of content text", async () => {
    const chain = makeInsertChain(1);
    vi.mocked(getDb).mockResolvedValue(chain);

    const r1 = await publishNotice({
      noticeKind: "terms",
      version: "1.0.0",
      effectiveFrom: new Date(),
      contentText: "Content A",
      publishedByUserId: 1,
    });
    const r2 = await publishNotice({
      noticeKind: "terms",
      version: "1.0.1",
      effectiveFrom: new Date(),
      contentText: "Content B",
      publishedByUserId: 1,
    });

    expect(r1.contentHash).not.toBe(r2.contentHash);
  });

  it("throws when DB is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    await expect(
      publishNotice({
        noticeKind: "privacy_policy",
        version: "1.0.0",
        effectiveFrom: new Date(),
        contentText: "text",
        publishedByUserId: 1,
      })
    ).rejects.toThrow("DB unavailable");
  });
});

describe("getActiveNotice", () => {
  it("returns null when DB is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    const result = await getActiveNotice({ noticeKind: "privacy_policy" });
    expect(result).toBeNull();
  });

  it("returns null when no rows found", async () => {
    const chain = makeSelectChain([]);
    vi.mocked(getDb).mockResolvedValue(chain);

    const result = await getActiveNotice({ noticeKind: "privacy_policy" });
    expect(result).toBeNull();
  });

  it("returns most recent active notice", async () => {
    const row1 = {
      id: 1,
      noticeKind: "privacy_policy",
      version: "1.0.0",
      effectiveFrom: new Date("2024-01-01"),
      effectiveUntil: null,
      contentHash: "abc",
      contentText: "old",
      language: "en",
      publishedByUserId: 1,
      createdAt: new Date(),
    };
    const row2 = {
      ...row1,
      id: 2,
      version: "2.0.0",
      effectiveFrom: new Date("2025-01-01"),
      contentText: "new",
    };
    const chain = makeSelectChain([row1, row2]);
    vi.mocked(getDb).mockResolvedValue(chain);

    const result = await getActiveNotice({ noticeKind: "privacy_policy" });
    expect(result?.version).toBe("2.0.0");
  });
});

describe("listNoticesForKind", () => {
  it("returns empty array when DB unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    const result = await listNoticesForKind({ noticeKind: "marketing" });
    expect(result).toEqual([]);
  });

  it("returns rows from DB", async () => {
    const rows = [
      { id: 1, noticeKind: "marketing", version: "1.0.0" },
      { id: 2, noticeKind: "marketing", version: "1.1.0" },
    ];
    const chain = makeSelectChain(rows);
    vi.mocked(getDb).mockResolvedValue(chain);

    const result = await listNoticesForKind({ noticeKind: "marketing" });
    expect(result.length).toBe(2);
  });
});

describe("recordUserAcceptance", () => {
  it("inserts into privacy_consents", async () => {
    const values = vi.fn().mockResolvedValue({});
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getDb).mockResolvedValue({ insert });

    await recordUserAcceptance({ userId: 5, noticeId: 10 });
    expect(insert).toHaveBeenCalled();
    const payload = values.mock.calls[0][0];
    expect(payload.userId).toBe(5);
    expect(payload.auditRef).toBe("notice:10");
  });

  it("throws when DB unavailable", async () => {
    vi.mocked(getDb).mockResolvedValue(null);
    await expect(
      recordUserAcceptance({ userId: 1, noticeId: 1 })
    ).rejects.toThrow("DB unavailable");
  });
});
