import fs from "node:fs";
import _path from "node:path";
import { describe, expect, it } from "vitest";

function read(p) {
  if (!fs.existsSync(p)) throw new Error(`Watched file missing: ${p}`);
  return fs.readFileSync(p, "utf8");
}

describe("stock truth 10 static guards", () => {
  it("scan routes remain lookup-only (no stock movement writes)", () => {
    const files = fs
      .readdirSync("server/routers")
      .filter(f => f.endsWith(".ts"))
      .map(f => `server/routers/${f}`);
    const pattern =
      /scanBarcodeFor(Sale|Return|Audit)[\s\S]{0,1200}(insert\(stockMovements\)|update\(batchLedger\)|update\(storeSkus\))/;
    const found = files.some(f => pattern.test(read(f)));
    expect(found).toBe(false);
  });

  it("routers avoid direct stock movement inserts", () => {
    const files = fs
      .readdirSync("server/routers")
      .filter(f => f.endsWith(".ts"))
      .map(f => `server/routers/${f}`);
    const pattern = /insert\(stockMovements\)/;
    const found = files.some(
      f => pattern.test(read(f)) && !/legacy|deferred/.test(read(f))
    );
    expect(found).toBe(false);
  });

  it("purchase commit does not directly increment qtyOnHand/stockQty", () => {
    const pattern =
      /commitInvoice[\s\S]{0,2800}(qtyOnHand: \(existingLedger\.qtyOnHand|qtyOnHand: qty|quantity: \(existingBatch\.quantity|stockQty: \(sku\.stockQty)/;
    const found = pattern.test(read("server/routers/purchaseRouter.ts"));
    expect(found).toBe(false);
  });
});
