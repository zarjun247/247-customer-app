import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";

// ─── In-memory key store ──────────────────────────────────────────────────────

type KeyRow = {
  id: string;
  keyVersion: number;
  scope: string;
  wrappedDataKey: string; // base64 string as stored in DB
  algorithm: string;
  createdAt: Date;
  rotatedFromId: string | null;
  retiredAt: Date | null;
};

let keyStore: KeyRow[] = [];

/**
 * Returns a drizzle-like mock that supports the query patterns used in piiEncryption.ts.
 * All filtering is done in JavaScript based on keyStore contents.
 */
function buildMockDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: (n: number) => {
              const active = keyStore
                .filter(k => k.retiredAt === null)
                .sort((a, b) => b.keyVersion - a.keyVersion);
              return Promise.resolve(active.slice(0, n));
            },
          }),
          limit: (n: number) => Promise.resolve(keyStore.slice(0, n)),
        }),
        orderBy: () => ({
          limit: (n: number) => Promise.resolve(keyStore.slice(0, n)),
        }),
      }),
    }),
    insert: () => ({
      values: (
        row: Omit<KeyRow, "wrappedDataKey"> & { wrappedDataKey: string }
      ) => {
        keyStore.push({ ...row, wrappedDataKey: row.wrappedDataKey });
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (updates: Partial<KeyRow>) => ({
        where: () => {
          if (updates.retiredAt) {
            const target = keyStore.find(k => k.retiredAt === null);
            if (target) target.retiredAt = updates.retiredAt!;
          }
          return Promise.resolve();
        },
      }),
    }),
  };
}

vi.mock("../db", () => ({
  getDb: vi.fn(() => Promise.resolve(buildMockDb())),
}));

import { getMasterKey } from "./piiEncryption";
import { getDb } from "../db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validMasterKey = randomBytes(32);

function setMasterKey(key: Buffer): void {
  process.env.PII_ENCRYPTION_MASTER_KEY = key.toString("base64");
}

function clearMasterKey(): void {
  delete process.env.PII_ENCRYPTION_MASTER_KEY;
}

beforeEach(() => {
  keyStore = [];
  vi.mocked(getDb).mockImplementation(() =>
    Promise.resolve(buildMockDb() as unknown)
  );
  clearMasterKey();
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  clearMasterKey();
  process.env.NODE_ENV = "test";
});

// ─── getMasterKey ─────────────────────────────────────────────────────────────

describe("getMasterKey", () => {
  it("returns null when PII_ENCRYPTION_MASTER_KEY is not set", () => {
    clearMasterKey();
    expect(getMasterKey()).toBeNull();
  });

  it("returns null for 31-byte key (too short)", () => {
    setMasterKey(randomBytes(31));
    expect(getMasterKey()).toBeNull();
  });

  it("returns null for 33-byte key (too long)", () => {
    setMasterKey(randomBytes(33));
    expect(getMasterKey()).toBeNull();
  });

  it("returns null for non-base64 value", () => {
    process.env.PII_ENCRYPTION_MASTER_KEY = "not!valid#base64";
    expect(getMasterKey()).toBeNull();
  });

  it("returns 32-byte Buffer for valid 32-byte base64 key", () => {
    setMasterKey(validMasterKey);
    const result = getMasterKey();
    expect(result).not.toBeNull();
    expect(result!.length).toBe(32);
    expect(result!.toString("base64")).toBe(validMasterKey.toString("base64"));
  });
});

// ─── encrypt / decrypt ────────────────────────────────────────────────────────

describe("encrypt + decrypt round-trip", () => {
  it("encrypts and decrypts successfully with master key set", async () => {
    setMasterKey(validMasterKey);
    const { encrypt, decrypt } = await import("./piiEncryption");
    const plaintext = "+91-9999999999";
    const ct = await encrypt(plaintext, "customer.phone");
    expect(ct).toMatch(/^v1:/);
    const result = await decrypt(ct, "customer.phone");
    expect(result).toBe(plaintext);
  });

  it("produces different ciphertext on each call (fresh IV)", async () => {
    setMasterKey(validMasterKey);
    const { encrypt } = await import("./piiEncryption");
    const ct1 = await encrypt("same", "customer.phone");
    const ct2 = await encrypt("same", "customer.phone");
    expect(ct1).not.toBe(ct2);
  });

  it("decrypt of legacy plaintext (no 'v1:' prefix) returns as-is", async () => {
    setMasterKey(validMasterKey);
    const { decrypt } = await import("./piiEncryption");
    const result = await decrypt("legacy plaintext", "customer.phone");
    expect(result).toBe("legacy plaintext");
  });

  it("decrypt of empty string returns empty string", async () => {
    setMasterKey(validMasterKey);
    const { decrypt } = await import("./piiEncryption");
    expect(await decrypt("", "customer.phone")).toBe("");
  });
});

// ─── passthrough mode ─────────────────────────────────────────────────────────

describe("passthrough mode", () => {
  it("encrypt without master key in non-production returns plaintext", async () => {
    clearMasterKey();
    process.env.NODE_ENV = "test";
    const { encrypt } = await import("./piiEncryption");
    const result = await encrypt("hello", "customer.email");
    expect(result).toBe("hello");
  });

  it("encrypt without master key in production throws MasterKeyNotConfiguredError", async () => {
    clearMasterKey();
    process.env.NODE_ENV = "production";
    const { encrypt, MasterKeyNotConfiguredError } = await import(
      "./piiEncryption"
    );
    await expect(encrypt("hello", "customer.phone")).rejects.toBeInstanceOf(
      MasterKeyNotConfiguredError
    );
  });
});

// ─── error cases ─────────────────────────────────────────────────────────────

describe("error cases", () => {
  it("decrypt of tampered ciphertext (bad auth tag) throws DecryptionFailedError", async () => {
    setMasterKey(validMasterKey);
    const { encrypt, decrypt, DecryptionFailedError } = await import(
      "./piiEncryption"
    );
    const ct = await encrypt("secret", "customer.phone");
    const parts = ct.split(":");
    // Tamper the auth tag (index 4)
    parts[4] = Buffer.from("tampered-auth-tag").toString("base64");
    const tampered = parts.join(":");
    await expect(decrypt(tampered, "customer.phone")).rejects.toBeInstanceOf(
      DecryptionFailedError
    );
  });

  it("decrypt with malformed format (too few parts) throws DecryptionFailedError", async () => {
    setMasterKey(validMasterKey);
    const { decrypt, DecryptionFailedError } = await import("./piiEncryption");
    await expect(
      decrypt("v1:1:badformat", "customer.phone")
    ).rejects.toBeInstanceOf(DecryptionFailedError);
  });

  it("decrypt with invalid key version throws DecryptionFailedError", async () => {
    setMasterKey(validMasterKey);
    const { decrypt, DecryptionFailedError } = await import("./piiEncryption");
    await expect(
      decrypt("v1:notanumber:abc:abc:abc", "customer.phone")
    ).rejects.toBeInstanceOf(DecryptionFailedError);
  });
});

// ─── scopes are isolated ──────────────────────────────────────────────────────

describe("scope isolation", () => {
  it("customer.phone and customer.email generate separate key store entries", async () => {
    setMasterKey(validMasterKey);
    const insertedRows: Array<{ scope: string; keyVersion: number }> = [];

    vi.mocked(getDb).mockImplementation(
      async () =>
        ({
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({ limit: () => Promise.resolve([]) }), // no existing keys
                limit: () => Promise.resolve([]),
              }),
              orderBy: () => ({ limit: () => Promise.resolve([]) }),
            }),
          }),
          insert: () => ({
            values: (row: KeyRow) => {
              insertedRows.push({
                scope: row.scope,
                keyVersion: row.keyVersion,
              });
              return Promise.resolve();
            },
          }),
        }) as unknown
    );

    const { encrypt } = await import("./piiEncryption");
    await encrypt("phone1", "customer.phone");
    await encrypt("email1", "customer.email");
    expect(insertedRows.filter(r => r.scope === "customer.phone").length).toBe(
      1
    );
    expect(insertedRows.filter(r => r.scope === "customer.email").length).toBe(
      1
    );
  });

  it("each scope receives keyVersion=1 on first use (scopes are independent)", async () => {
    setMasterKey(validMasterKey);
    const insertedRows: Array<{ scope: string; keyVersion: number }> = [];

    vi.mocked(getDb).mockImplementation(
      async () =>
        ({
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({ limit: () => Promise.resolve([]) }),
                limit: () => Promise.resolve([]),
              }),
              orderBy: () => ({ limit: () => Promise.resolve([]) }),
            }),
          }),
          insert: () => ({
            values: (row: KeyRow) => {
              insertedRows.push({
                scope: row.scope,
                keyVersion: row.keyVersion,
              });
              return Promise.resolve();
            },
          }),
        }) as unknown
    );

    const { encrypt } = await import("./piiEncryption");
    await encrypt("a", "customer.phone");
    await encrypt("b", "customer.email");
    expect(
      insertedRows.find(r => r.scope === "customer.phone")?.keyVersion
    ).toBe(1);
    expect(
      insertedRows.find(r => r.scope === "customer.email")?.keyVersion
    ).toBe(1);
  });
});

// ─── key rotation ─────────────────────────────────────────────────────────────

describe("rotateKey", () => {
  it("creates new key version and retires old", async () => {
    setMasterKey(validMasterKey);
    const { encrypt, rotateKey } = await import("./piiEncryption");
    await encrypt("original", "customer.phone");
    expect(keyStore.length).toBe(1);
    expect(keyStore[0].keyVersion).toBe(1);

    const result = await rotateKey("customer.phone");
    expect(result.oldKeyVersion).toBe(1);
    expect(result.newKeyVersion).toBe(2);
    expect(keyStore.length).toBe(2);
    expect(keyStore.find(k => k.keyVersion === 1)?.retiredAt).not.toBeNull();
  });

  it("old ciphertext (v1) still decrypts after rotation to v2", async () => {
    setMasterKey(validMasterKey);

    // Use a scoped mock that correctly handles both active-only and version-specific lookups
    vi.mocked(getDb).mockImplementation(async () => {
      return {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: (n: number) => {
                  const active = keyStore
                    .filter(
                      k => k.scope === "customer.phone" && k.retiredAt === null
                    )
                    .sort((a, b) => b.keyVersion - a.keyVersion);
                  return Promise.resolve(active.slice(0, n));
                },
              }),
              limit: (n: number) => {
                const allForScope = keyStore.filter(
                  k => k.scope === "customer.phone"
                );
                return Promise.resolve(allForScope.slice(0, n));
              },
            }),
            orderBy: () => ({
              limit: (n: number) => Promise.resolve(keyStore.slice(0, n)),
            }),
          }),
        }),
        insert: () => ({
          values: (row: KeyRow) => {
            keyStore.push({ ...row });
            return Promise.resolve();
          },
        }),
        update: () => ({
          set: (updates: Partial<KeyRow>) => ({
            where: () => {
              if (updates.retiredAt) {
                const active = keyStore.find(
                  k => k.scope === "customer.phone" && k.retiredAt === null
                );
                if (active) active.retiredAt = updates.retiredAt!;
              }
              return Promise.resolve();
            },
          }),
        }),
      } as unknown;
    });

    const { encrypt, decrypt, rotateKey } = await import("./piiEncryption");
    const ctV1 = await encrypt("pre-rotation-value", "customer.phone");
    expect(ctV1).toMatch(/^v1:1:/);

    await rotateKey("customer.phone");
    expect(keyStore.length).toBe(2);

    // Old ciphertext should still decrypt (uses retired v1 key)
    const decrypted = await decrypt(ctV1, "customer.phone");
    expect(decrypted).toBe("pre-rotation-value");
  });

  it("new encrypt after rotation uses v2 key", async () => {
    setMasterKey(validMasterKey);
    vi.mocked(getDb).mockImplementation(async () => {
      return {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: (n: number) => {
                  const active = keyStore
                    .filter(
                      k => k.scope === "customer.phone" && k.retiredAt === null
                    )
                    .sort((a, b) => b.keyVersion - a.keyVersion);
                  return Promise.resolve(active.slice(0, n));
                },
              }),
              limit: (n: number) => {
                return Promise.resolve(
                  keyStore.filter(k => k.scope === "customer.phone").slice(0, n)
                );
              },
            }),
            orderBy: () => ({
              limit: (n: number) => Promise.resolve(keyStore.slice(0, n)),
            }),
          }),
        }),
        insert: () => ({
          values: (row: KeyRow) => {
            keyStore.push({ ...row });
            return Promise.resolve();
          },
        }),
        update: () => ({
          set: (updates: Partial<KeyRow>) => ({
            where: () => {
              if (updates.retiredAt) {
                const active = keyStore.find(
                  k => k.scope === "customer.phone" && k.retiredAt === null
                );
                if (active) active.retiredAt = updates.retiredAt!;
              }
              return Promise.resolve();
            },
          }),
        }),
      } as unknown;
    });

    const { encrypt, rotateKey } = await import("./piiEncryption");
    await encrypt("before", "customer.phone");
    await rotateKey("customer.phone");
    const ctAfter = await encrypt("after", "customer.phone");
    expect(ctAfter).toMatch(/^v1:2:/);
  });

  it("throws MasterKeyNotConfiguredError when key absent", async () => {
    clearMasterKey();
    const { rotateKey, MasterKeyNotConfiguredError } = await import(
      "./piiEncryption"
    );
    await expect(rotateKey("customer.phone")).rejects.toBeInstanceOf(
      MasterKeyNotConfiguredError
    );
  });
});

// ─── getKeyStatus ─────────────────────────────────────────────────────────────

describe("getKeyStatus", () => {
  it("returns per-scope summary with retired counts", async () => {
    setMasterKey(validMasterKey);
    const now = new Date();
    keyStore = [
      {
        id: "a",
        keyVersion: 1,
        scope: "customer.phone",
        wrappedDataKey: "base64fake",
        algorithm: "aes-256-gcm",
        createdAt: now,
        rotatedFromId: null,
        retiredAt: now,
      },
      {
        id: "b",
        keyVersion: 2,
        scope: "customer.phone",
        wrappedDataKey: "base64fake",
        algorithm: "aes-256-gcm",
        createdAt: now,
        rotatedFromId: "a",
        retiredAt: null,
      },
      {
        id: "c",
        keyVersion: 1,
        scope: "customer.email",
        wrappedDataKey: "base64fake",
        algorithm: "aes-256-gcm",
        createdAt: now,
        rotatedFromId: null,
        retiredAt: null,
      },
    ];
    const { getKeyStatus } = await import("./piiEncryption");
    const statuses = await getKeyStatus();
    const phone = statuses.find(s => s.scope === "customer.phone");
    const email = statuses.find(s => s.scope === "customer.email");
    expect(phone?.retiredKeys).toBe(1);
    expect(phone?.activeKeyVersion).toBe(2);
    expect(phone?.totalKeys).toBe(2);
    expect(email?.retiredKeys).toBe(0);
    expect(email?.activeKeyVersion).toBe(1);
  });

  it("returns empty array when db is unavailable", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(null as unknown);
    const { getKeyStatus } = await import("./piiEncryption");
    const result = await getKeyStatus();
    expect(result).toEqual([]);
  });
});
