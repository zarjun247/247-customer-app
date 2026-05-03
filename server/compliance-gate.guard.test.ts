import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("compliance gate static guard", () => {
  it("confirm sale path must call assertCanConfirmSale", () => {
    const src = readFileSync("server/routers/salesRouter.ts", "utf8");
    expect(src.includes("assertCanConfirmSale(input.saleId")).toBe(true);
  });

  it("must not trust client schedule flags during confirm", () => {
    const src = readFileSync("server/routers/salesRouter.ts", "utf8");
    expect(src.includes("requiresPrescription && !l.rxCleared")).toBe(false);
  });
});
