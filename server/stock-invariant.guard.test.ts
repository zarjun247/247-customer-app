import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("stock invariant guard", () => {
  it("blocks fake qtyBefore/qtyAfter placeholders in stock mutation routers", () => {
    const out = execSync(
      "rg -n \"qtyBefore:\\s*0|qtyAfter:\\s*0\" server/routers/purchaseRouter.ts server/routers/salesRouter.ts --glob '!**/*.md' || true",
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });

  it("blocks legacy duplicate stock_adjustment movement write in inventory approve path", () => {
    const out = execSync(
      "rg -n 'writeMovement\\(\\{.*movementType: \"stock_adjustment\"' server/routers/inventoryRouter.ts || true",
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });
});
