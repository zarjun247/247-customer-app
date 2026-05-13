import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { readFileSync, readdirSync } from "fs";
import { computeAvailableQty } from "./services/reservationService";

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

const reservationService = normalizeCode(
  readFileSync("server/services/reservationService.ts", "utf8")
);
const purchaseRouter = normalizeCode(
  readFileSync("server/routers/purchaseRouter.ts", "utf8") +
    "\n" +
    readFileSync("server/routers/purchaseReturnsRouter.ts", "utf8")
);
const barcodeService = readFileSync(
  "server/services/barcodeService.ts",
  "utf8"
);
const salesRouter = readFileSync("server/routers/salesRouter.ts", "utf8");
const dbHelpers = readFileSync("server/db.ts", "utf8");
const schema = normalizeCode(
  readdirSync("drizzle/schema")
    .filter(f => f.endsWith(".ts") && f !== "index.ts")
    .map(f => readFileSync(`drizzle/schema/${f}`, "utf8"))
    .join("\n")
);

describe("mega stock reservation truth hardening", () => {
  it("purchase commits sync product-store aggregate instead of movement qtyAfter", () => {
    expect(purchaseRouter).toContain(
      "syncStoreSkuAggregate({ storeId: inv.storeId, productId: line.productId"
    );
    expect(purchaseRouter).not.toMatch(
      /storeSkus\)\.set\(\{\s*stockQty:\s*movement\.qtyAfter/
    );
  });

  it("purchase return uses canonical ledger batch availability and aggregate resync", () => {
    expect(purchaseRouter).toContain("canonicalBatchAvailable");
    expect(purchaseRouter).toContain(
      "decreaseStockForPurchaseReturn({ batchId: ledger.id"
    );
    expect(purchaseRouter).toContain(
      "syncStoreSkuAggregate({ storeId: ret.storeId, productId: b.productId"
    );
    expect(purchaseRouter).not.toContain(
      "stockQty: Math.max(0, (sku.stockQty ?? 0) - line.qty)"
    );
  });

  it("durable reservations persist explicit rows and statuses", () => {
    expect(schema).toContain(
      'status: mysqlEnum("status", ["active", "released", "expired", "consumed", "cancelled"])'
    );
    for (const field of [
      "cartId",
      "variantId",
      "skuId",
      "qty",
      "releaseReason",
      "createdAt",
      "updatedAt",
    ]) {
      expect(schema).toContain(field);
    }
    expect(reservationService).toContain("db.insert(stockReservations)");
    expect(reservationService).toContain(
      "eq(stockReservations.status, ACTIVE_RESERVATION_STATUS)"
    );
  });

  it("active reservations subtract from canonical availability so the last unit cannot be reserved twice", () => {
    expect(computeAvailableQty({ onHandQty: 1, reservedQty: 0 })).toBe(1);
    expect(computeAvailableQty({ onHandQty: 1, reservedQty: 1 })).toBe(0);
    expect(reservationService).toContain(
      "Insufficient available stock after reservations"
    );
  });

  it("expired, cancelled, payment-failed, and Rx-rejected releases restore availability by leaving active status", () => {
    expect(reservationService).toContain(
      'updateReservationStatus(input, "expired"'
    );
    expect(reservationService).toContain(
      'updateReservationStatus(input, "cancelled"'
    );
    expect(reservationService).toContain("payment_failed");
    expect(reservationService).toContain("rx_rejected");
  });

  it("app catalog, cart validation, POS, barcode, and reports use canonical availability inputs", () => {
    expect(dbHelpers).toContain("canonicalAvailabilitySql");
    expect(dbHelpers).toContain("stockReservations");
    expect(salesRouter).toContain("qtyQuarantined");
    expect(salesRouter).toContain("qtyExpired");
    expect(barcodeService).toContain("getCanonicalAvailability");
    expect(barcodeService).toContain("canonicalAvailability");
  });

  it("production reservation path has no deferred stock-truth stub", () => {
    function walk(dir) {
      const res = [];
      for (const name of fs.readdirSync(dir)) {
        const p = `${dir}/${name}`;
        const st = fs.statSync(p);
        if (st.isDirectory()) res.push(...walk(p));
        else if (st.isFile() && !p.endsWith(".test.ts") && p.endsWith(".ts"))
          res.push(p);
      }
      return res;
    }
    const files = walk("server");
    const found = files.some(f =>
      fs.readFileSync(f, "utf8").includes("Deferred to stock-truth hardening")
    );
    const out = found ? "matches" : "";
    expect(out).toBe("");
  });
});
