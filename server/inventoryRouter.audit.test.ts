import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("server/routers/inventoryRouter.ts", "utf8");

describe("inventoryRouter audit regression", () => {
  it("stock adjustment approve audit includes before/after and reason", () => {
    expect(source).toContain('action: "approve", entityType: "stock_adjustment"');
    expect(source).toContain("before: { qtyOnHand: batch.qtyOnHand, status: adj.status }");
    expect(source).toContain("after: { qtyOnHand: qtyAfter, status: \"approved\" }");
    expect(source).toContain("reason: input.reason");
  });

  it("stock audit completion includes reason and non-zero entityId", () => {
    expect(source).toContain('action: "complete", entityType: "stock_audit"');
    expect(source).toContain("reason: input.reason");
    expect(source).not.toContain("entityId: 0");
  });
});
