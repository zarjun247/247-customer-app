import { afterEach, describe, it, expect } from "vitest";
import { requireStoreAccessForUserAtStore } from "./storeScope";
import type { TrpcContext } from "../_core/context";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function makeCtx(role: string, staffStoreId: number | null): TrpcContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: { id: 1, role, staffStoreId } as any,
  };
}

describe("requireStoreAccessForUserAtStore", () => {
  it("allows super_admin to access any store", () => {
    expect(() =>
      requireStoreAccessForUserAtStore(makeCtx("super_admin", null), 99)
    ).not.toThrow();
  });

  it("allows staff assigned to matching store", () => {
    expect(() =>
      requireStoreAccessForUserAtStore(makeCtx("pharmacist", 5), 5)
    ).not.toThrow();
  });

  it("blocks staff assigned to a different store", () => {
    expect(() =>
      requireStoreAccessForUserAtStore(makeCtx("pharmacist", 5), 7)
    ).toThrow();
  });

  it("blocks unauthenticated caller", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: TrpcContext = { req: {} as any, res: {} as any, user: null };
    expect(() => requireStoreAccessForUserAtStore(ctx, 5)).toThrow();
  });
});

describe("requireStoreAccessForEntity", () => {
  it("rejects unknown entityType with BAD_REQUEST", async () => {
    process.env.DATABASE_URL = "";
    const { requireStoreAccessForEntity } = await import("./storeScope");
    await expect(
      requireStoreAccessForEntity("unknown_type", 1, makeCtx("admin", 1))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws INTERNAL_SERVER_ERROR when DB is unavailable", async () => {
    const { requireStoreAccessForEntity } = await import("./storeScope");
    await expect(
      requireStoreAccessForEntity("sale", 1, makeCtx("pharmacist", 1))
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
