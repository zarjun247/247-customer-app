import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("stock invariant guard", () => {
  it("blocks fake qtyBefore/qtyAfter placeholders in stock mutation routers", () => {
    const out = execSync(
      "rg -n \"qtyBefore:\\s*0|qtyAfter:\\s*0\" server/routers/purchaseRouter.ts server/routers/salesRouter.ts server/routers/inventoryRouter.ts server/services/stockInvariant.ts --glob '!**/*.md' | rg -v \"movementType: \\\"stock_transfer\\\"\" || true",
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });

  it("blocks legacy movement helper usage in inventory router", () => {
    const out = execSync(
      "rg -n 'writeMovement\\(' server/routers/inventoryRouter.ts || true",
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });

  it("blocks direct stock movement inserts in migrated purchase/inventory flows", () => {
    const out = execSync(
      "rg -n \"insert\\(stockMovements\\)\" server/routers/purchaseRouter.ts server/routers/inventoryRouter.ts || true",
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });

  it("blocks direct qtyOnHand writes in inventory corrections path", () => {
    const out = execSync(
      "rg -n \"audit\\.complete[\\s\\S]*update\\(batchLedger\\)\\.set\\(\\{\\s*qtyOnHand\" server/routers/inventoryRouter.ts || true",
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
