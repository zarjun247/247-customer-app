import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("stock invariant guard", () => {
  it("blocks fake qtyBefore/qtyAfter placeholders in stock mutation routers", () => {
    const out = execSync(
      "rg -n \"qtyBefore:\\s*0|qtyAfter:\\s*0\" server/routers/purchaseRouter.ts server/routers/salesRouter.ts server/routers/inventoryRouter.ts --glob '!**/*.md' | rg -v \"batchId, productId: input.productId|movementType: \\\"stock_transfer\\\"|release_quarantine|audit_correction|qtyChange: input.qtyOnHand\" || true",
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

  it("blocks direct stock movement inserts in migrated purchase/inventory flows", () => {
    const out = execSync(
      "rg -n \"insert\\(stockMovements\\)\" server/routers/purchaseRouter.ts server/routers/inventoryRouter.ts | rg -v \"inventoryRouter.ts:78\" || true",
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });

  it("blocks legacy direct batch qty mutations in purchase return commit", () => {
    const out = execSync(
      "rg -n \"commitReturn[\\s\\S]*batchLedger\\)\\.set\\(\\{\\s*qtyOnHand\" server/routers/purchaseRouter.ts || true",
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });
});
