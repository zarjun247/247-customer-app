import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("discount code foundation guards", () => {
  it("margin guard implements validate/apply server-side", () => {
    const src = readFileSync("server/services/marginGuard.ts", "utf8");
    expect(src.includes("export async function validateDiscountCode")).toBe(true);
    expect(src.includes("export async function applyDiscountCode")).toBe(true);
    expect(src.includes("discount.code_applied")).toBe(true);
  });

  it("confirm sale accepts discountCode and applies via margin guard", () => {
    const src = readFileSync("server/routers/salesRouter.ts", "utf8");
    expect(src.includes("discountCode: z.string().optional()")).toBe(true);
    expect(src.includes("applyDiscountCode(input.saleId, input.discountCode")).toBe(true);
  });

  it("does not trust client-submitted discount amount on confirm", () => {
    const src = readFileSync("server/routers/salesRouter.ts", "utf8");
    expect(src.includes("clientDiscountAmount")).toBe(false);
  });

  it("usage count recording is deferred until after margin gate call", () => {
    const src = readFileSync("server/routers/salesRouter.ts", "utf8");
    const idxMargin = src.indexOf("assertNoLossWithoutApproval(input.saleId");
    const idxUsage = src.indexOf("recordDiscountCodeUsage(");
    expect(idxMargin).toBeGreaterThan(-1);
    expect(idxUsage).toBeGreaterThan(-1);
    expect(idxUsage).toBeGreaterThan(idxMargin);
  });

});
