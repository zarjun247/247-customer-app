import { describe, expect, it } from "vitest";
import { requireStoreAccess, requireStaffStore } from "./_core/rbac";

describe("rbac store scope helper", () => {
  it("fails closed when staff store missing", () => {
    expect(() =>
      requireStaffStore({
        id: 1,
        role: "cashier",
        staffStoreId: null,
      } as unknown)
    ).toThrow(/assignment required/);
  });

  it("denies cross store staff access", () => {
    expect(() =>
      requireStoreAccess(
        { id: 1, role: "cashier", staffStoreId: 1 } as unknown,
        2
      )
    ).toThrow(/denied/);
  });

  it("allows explicit super admin cross-store path", () => {
    expect(() =>
      requireStoreAccess(
        { id: 1, role: "super_admin", staffStoreId: null } as unknown,
        999
      )
    ).not.toThrow();
  });
});
