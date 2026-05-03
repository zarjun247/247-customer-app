import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("margin guard static guard", () => {
  it("confirm sale path must call assertNoLossWithoutApproval", () => {
    const src = readFileSync("server/routers/salesRouter.ts", "utf8");
    expect(src.includes("assertNoLossWithoutApproval(input.saleId")).toBe(true);
  });
});
