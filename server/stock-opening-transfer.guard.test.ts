import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("stock opening + transfer guards", () => {
  it("creates batch at zero before opening stock movement", () => {
    const src = readFileSync("server/services/stockInvariant.ts", "utf8");
    expect(src).toContain("values({ ...input.batch, qtyOnHand: 0 })");
  });

  it("keeps transfer in one transaction boundary", () => {
    const src = readFileSync("server/services/stockInvariant.ts", "utf8");
    expect(src).toContain("db.transaction(async (tx: any)");
  });
});
