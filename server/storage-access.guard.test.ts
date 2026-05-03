import { describe, it, expect } from "vitest";
import { assertSafeStorageKey, canAccessStorageKey } from "./_core/storageAccess";

describe("storage access", () => {
  it("blocks traversal", () => expect(() => assertSafeStorageKey("../secret")).toThrow());
  it("blocks unauthenticated sensitive", () => expect(canAccessStorageKey(null, "prescriptions/a.png")).toBe(false));
});
