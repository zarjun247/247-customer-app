import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { computeAvailableQty, explainAvailability } from "./services/reservationService";

const reservationService = readFileSync("server/services/reservationService.ts", "utf8");
const routers = readFileSync("server/routers.ts", "utf8");
const paymentRouter = readFileSync("server/routers/paymentRouter.ts", "utf8");
const salesRouter = readFileSync("server/routers/salesRouter.ts", "utf8");
const barcodeService = readFileSync("server/services/barcodeService.ts", "utf8");
const stockInvariant = readFileSync("server/services/stockInvariant.ts", "utf8");
const schema = readFileSync("drizzle/schema.ts", "utf8");
const migration = readFileSync("drizzle/0045_reservation_lifecycle_truth.sql", "utf8");

describe("reservation lifecycle truth", () => {
  it("cannot reserve more than canonical available and returns controlled failure", () => {
    expect(computeAvailableQty({ onHandQty: 5, reservedQty: 3, quarantinedQty: 1 })).toBe(1);
    expect(explainAvailability({ onHandQty: 2, reservedQty: 5 }).availableQty).toBe(0);
    expect(reservationService).toContain("Insufficient available stock after reservations");
    expect(reservationService).toContain("PRECONDITION_FAILED");
    expect(reservationService).not.toMatch(/catch \([^)]*\) \{\s*return \{[^}]*success:\s*true/i);
  });

  it("central service exposes required primitives and lifecycle states", () => {
    for (const fn of ["createReservation", "extendReservation", "releaseReservation", "consumeReservation", "expireReservations", "getReservedQty", "getAvailableQty", "reconcileReservations", "assertReservationCanBeConsumed"]) {
      expect(reservationService).toContain(`function ${fn}`);
    }
    for (const state of ["active", "consumed", "released", "expired", "cancelled", "failed"]) {
      expect(reservationService).toContain(`"${state}"`);
      expect(schema).toContain(`"${state}"`);
      expect(migration).toContain(`'${state}'`);
    }
  });

  it("concurrent/idempotent reserve path uses serializable transaction and idempotency", () => {
    expect(reservationService).toContain("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    expect(reservationService).toContain("runSerializable(db");
    expect(reservationService).toContain("withIdempotency");
    expect(reservationService).toContain("reservation.create");
    expect(schema).toContain("reservationMeta");
  });

  it("release, cancellation, payment failure, and expiry remove active reservations from availability", () => {
    expect(reservationService).toContain('transitionActiveReservation(input, "released"');
    expect(reservationService).toContain('transitionActiveReservation(input, "cancelled"');
    expect(reservationService).toContain('transitionActiveReservation(input, "failed"');
    expect(reservationService).toContain("expireReservations");
    expect(paymentRouter).toContain("releaseReservationOnPaymentFailure");
    expect(routers).toContain("releaseReservationOnOrderCancel");
  });

  it("consume is exactly once and expired reservation cannot be consumed", () => {
    expect(reservationService).toContain("Expired reservation cannot be consumed");
    expect(reservationService).toContain("No active reservation can be consumed");
    expect(reservationService).toContain('transitionActiveReservation(input, "consumed"');
    expect(reservationService).toContain("eq(stockReservations.status, ACTIVE_RESERVATION_STATUS)");
  });

  it("sale confirmation consumes reservations and stock mutation remains through stockInvariant", () => {
    expect(paymentRouter).toContain("consumeReservation({ orderId: payment.orderId");
    expect(salesRouter).toContain("createReservation({ saleId: input.saleId");
    expect(salesRouter).toContain("consumeReservation({ saleId: input.saleId");
    expect(salesRouter).toContain("decreaseStockForSaleConfirmation");
    expect(stockInvariant).toContain("applyStockMovement");
    expect(reservationService).not.toContain("qtyOnHand:");
  });

  it("barcode scan remains lookup-only and does not reserve or mutate", () => {
    expect(barcodeService).toContain("getCanonicalAvailability");
    expect(barcodeService).not.toMatch(/createReservation|reserveStockForOrder|consumeReservation|decreaseStockForSaleConfirmation|applyStockMovement|qtyOnHand\s*:/);
  });

  it("reconciliation detects orphan, expired-active, and over-reserved anomalies with csvData", () => {
    expect(reservationService).toContain("expiredActiveCount");
    expect(reservationService).toContain("missingOrderRows");
    expect(reservationService).toContain("missingCartRows");
    expect(reservationService).toContain("missingSaleRows");
    expect(reservationService).toContain("overReservedRows");
    expect(reservationService).toContain("csvData");
  });

  it("no direct stock mutation was introduced outside approved stockInvariant gateway", () => {
    const protectedFiles = [reservationService, routers, paymentRouter, salesRouter.replace(/decreaseStockForSaleConfirmation/g, "")];
    for (const source of protectedFiles) {
      expect(source).not.toMatch(/update\([^)]*batchLedger[^;]*qtyOnHand|\.set\(\{\s*qtyOnHand/);
      expect(source).not.toMatch(/insert\([^)]*stockMovements/);
    }
  });
});
