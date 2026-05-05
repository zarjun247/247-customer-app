import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("stock truth 10 static guards", () => {
  it("scan routes remain lookup-only (no stock movement writes)", () => {
    const out = execSync("rg -n \"scanBarcodeFor(Sale|Return|Audit)[\\s\\S]{0,1200}(insert\\(stockMovements\\)|update\\(batchLedger\\)|update\\(storeSkus\\))\" server/routers || true", { encoding: "utf8" }).trim();
    expect(out).toBe("");
  });

  it("routers avoid direct stock movement inserts", () => {
    const out = execSync("rg -n \"insert\\(stockMovements\\)\" server/routers | rg -v \"legacy|deferred\" || true", { encoding: "utf8" }).trim();
    expect(out).toBe("");
  });

  it("purchase commit does not directly increment qtyOnHand/stockQty", () => {
    const out = execSync("rg -n \"commitInvoice[\\s\\S]{0,2800}(qtyOnHand: \\(existingLedger\\.qtyOnHand|qtyOnHand: qty|quantity: \\(existingBatch\\.quantity|stockQty: \\(sku\\.stockQty)\" server/routers/purchaseRouter.ts || true", { encoding: "utf8" }).trim();
    expect(out).toBe("");
  });
});
