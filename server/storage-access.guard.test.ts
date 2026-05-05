import { describe, it, expect } from "vitest";
import { assertSafeStorageKey, canAccessStorageKey } from "./_core/storageAccess";
import fs from "node:fs";

describe("storage access", () => {
  it("blocks traversal", () => expect(() => assertSafeStorageKey("../secret")).toThrow());
  it("blocks unauthenticated sensitive", () => expect(canAccessStorageKey(null, "prescriptions/a.png")).toBe(false));
  it("does not trust bearer-header presence as admin", () => {
    const src = fs.readFileSync("server/_core/storageProxy.ts", "utf8");
    expect(src).not.toContain("hasBearer");
    expect(src).toContain("sdk.authenticateRequest");
  });
});
