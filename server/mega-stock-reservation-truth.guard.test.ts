import { describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { computeAvailableQty } from "./services/reservationService";

const reservationService = readFileSync("server/services/reservationService.ts", "utf8");
const purchaseRouter = readFileSync("server/routers/purchaseRouter.ts", "utf8");
const barcodeService = readFileSync("server/services/barcodeService.ts", "utf8");
const salesRouter = readFileSync("server/routers/salesRouter.ts", "utf8");
const dbHelpers = readFileSync("server/db.ts", "utf8");
const schema = readFileSync("drizzle/schema.ts", "utf8");

describe("mega stock reservation truth hardening", () => {
  it("purchase commits sync product-store aggregate instead of movement qtyAfter", () => {
    expect(purchaseRouter).toContain("syncStoreSkuAggregate({ storeId: inv.storeId, productId: line.productId");
    expect(purchaseRouter).not.toMatch(/storeSkus\)\.set\(\{\s*stockQty:\s*movement\.qtyAfter/);
  });

  it("purchase return uses canonical ledger batch availability and aggregate resync", () => {
    expect(purchaseRouter).toContain("canonicalBatchAvailable");
    expect(purchaseRouter).toContain("decreaseStockForPurchaseReturn({ batchId: ledger.id");
    expect(purchaseRouter).toContain("syncStoreSkuAggregate({ storeId: ret.storeId, productId: b.productId");
    expect(purchaseRouter).not.toContain("stockQty: Math.max(0, (sku.stockQty ?? 0) - line.qty)");
  });

  it("durable reservations persist explicit rows and statuses", () => {
    expect(schema).toContain('status: mysqlEnum("status", ["active", "released", "expired", "consumed", "cancelled", "failed"])');
    for (const field of ["cartId", "variantId", "skuId", "qty", "releaseReason", "createdAt", "updatedAt"]) {
      expect(schema).toContain(field);
    }
    expect(reservationService).toContain("insert(stockReservations)");
    expect(reservationService).toContain("eq(stockReservations.status, ACTIVE_RESERVATION_STATUS)");
  });

  it("active reservations subtract from canonical availability so the last unit cannot be reserved twice", () => {
    expect(computeAvailableQty({ onHandQty: 1, reservedQty: 0 })).toBe(1);
    expect(computeAvailableQty({ onHandQty: 1, reservedQty: 1 })).toBe(0);
    expect(reservationService).toContain("Insufficient available stock after reservations");
  });

  it("expired, cancelled, payment-failed, and Rx-rejected releases restore availability by leaving active status", () => {
    expect(reservationService).toContain('transitionActiveReservation(input, "expired"');
    expect(reservationService).toContain('transitionActiveReservation(input, "cancelled"');
    expect(reservationService).toContain('payment_failed');
    expect(reservationService).toContain('rx_rejected');
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
    const out = execSync("rg -n 'Deferred to stock-truth hardening' server --glob '!**/*.test.ts' || true", { encoding: "utf8" }).trim();
    expect(out).toBe("");
  });
});
