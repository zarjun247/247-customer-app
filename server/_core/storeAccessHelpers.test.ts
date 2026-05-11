import { describe, it, expect } from "vitest";
import { assertStoreIdMatchesUser } from "./storeAccessHelpers";
import type { TrpcContext } from "./context";

function makeCtx(role: string, staffStoreId: number | null): TrpcContext {
  return { req: {} as any, res: {} as any, user: { id: 1, role, staffStoreId } as any };
}

describe("assertStoreIdMatchesUser", () => {
  it("passes for super_admin accessing any store", () => {
    expect(() => assertStoreIdMatchesUser(makeCtx("super_admin", null), 42)).not.toThrow();
  });

  it("passes for staff assigned to the matching store", () => {
    expect(() => assertStoreIdMatchesUser(makeCtx("pharmacist", 3), 3)).not.toThrow();
  });

  it("throws FORBIDDEN for staff assigned to a different store", () => {
    expect(() => assertStoreIdMatchesUser(makeCtx("cashier", 3), 7)).toThrow();
  });

  it("throws UNAUTHORIZED for unauthenticated caller", () => {
    const ctx: TrpcContext = { req: {} as any, res: {} as any, user: null };
    expect(() => assertStoreIdMatchesUser(ctx, 3)).toThrow();
  });
});
