import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("regulated release gate guards", () => {
  const sales = fs.readFileSync("server/routers/salesRouter.ts", "utf8");
  const compliance = fs.readFileSync(
    "server/services/complianceGate.ts",
    "utf8"
  );
  it("sale confirmation must call compliance gate before stock mutation", () => {
    expect(sales).toContain("assertCanConfirmSale");
  });
  it("regulated gate emits audit actions", () => {
    expect(compliance).toContain("regulated.release_checked");
    expect(compliance).toContain("regulated.release_blocked");
    expect(compliance).toContain("regulated.release_approved");
  });
});
