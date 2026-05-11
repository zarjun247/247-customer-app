import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const normalizeCode = (s: string): string =>
  s
    .replace(/\r\n/g, "\n")
    .replace(/\n\s*\./g, ".")
    .replace(/\s+/g, " ")
    .replace(/\( /g, "(")
    .replace(/\[ /g, "[")
    .replace(/ \)/g, ")")
    .replace(/, \]/g, "]")
    .replace(/ \]/g, "]");

describe("margin guard static guard", () => {
  it("confirm sale path must call assertNoLossWithoutApproval", () => {
    const src = normalizeCode(
      readFileSync("server/routers/salesRouter.ts", "utf8")
    );
    expect(src.includes("assertNoLossWithoutApproval(input.saleId")).toBe(true);
  });
});
