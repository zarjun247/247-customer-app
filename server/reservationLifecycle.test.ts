import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { assertReservationTransition, RESERVATION_STATUSES } from "./services/reservationLifecycle";

describe("reservation lifecycle truth", () => {
  it("declares the production reservation states", () => {
    expect(RESERVATION_STATUSES).toEqual(["active", "consumed", "released", "expired", "cancelled", "failed"]);
  });

  it("allows active to terminal transitions", () => {
    for (const next of ["consumed", "released", "expired", "cancelled", "failed"] as const) {
      expect(assertReservationTransition("active", next)).toEqual({ allowed: true, idempotent: false });
    }
  });

  it("treats repeated terminal calls as idempotent", () => {
    expect(assertReservationTransition("released", "released")).toEqual({ allowed: true, idempotent: true });
    expect(assertReservationTransition("consumed", "consumed")).toEqual({ allowed: true, idempotent: true });
  });

  it("rejects terminal-to-different-terminal drift", () => {
    expect(assertReservationTransition("released", "consumed")).toMatchObject({ allowed: false });
    expect(assertReservationTransition("failed", "released")).toMatchObject({ allowed: false });
  });

  it("uses explicit safe refs instead of nullable/fake production identifiers", () => {
    const lifecycle = fs.readFileSync("server/services/reservationLifecycle.ts", "utf8");
    expect(lifecycle).not.toContain("Number(uuid)");
    expect(lifecycle).not.toContain("entityId: 0");
    expect(lifecycle).not.toContain("as unknown as string");
    expect(lifecycle).not.toContain("idempotencyKey: null");
    expect(lifecycle).not.toMatch(/success:\s*true[^\n]+reservation/i);
  });

  it("wires checkout, payment failure, Rx rejection, cancellation, expiry, and fulfillment lifecycle calls", () => {
    const db = fs.readFileSync("server/db.ts", "utf8");
    const paymentRouter = fs.readFileSync("server/routers/paymentRouter.ts", "utf8");
    const paymentLifecycle = fs.readFileSync("server/services/paymentWebhookLifecycle.ts", "utf8");
    const pharmacy = fs.readFileSync("server/pharmacy.ts", "utf8");
    const prescriptionGov = fs.readFileSync("server/routers/prescriptionGovRouter.ts", "utf8");
    const lifecycle = fs.readFileSync("server/services/reservationLifecycle.ts", "utf8");

    expect(db).toContain("createReservation({");
    expect(db).toContain("checkout_failed");
    expect(db).toContain("cancelReservation({ orderId");
    expect(paymentRouter).toContain("failReservation({ orderId: payment.orderId");
    expect(paymentLifecycle).toContain("assertOrderHasActiveReservations(payment.orderId)");
    expect(paymentLifecycle).toContain("failReservation({ orderId");
    expect(pharmacy).toContain("rx_rejected");
    expect(prescriptionGov).toContain("rx_rejected");
    expect(lifecycle).toContain("reconcileExpiredReservations");
    expect(lifecycle).toContain("consumeReservation");
  });

  it("keeps reservation code away from direct stock mutation gateways", () => {
    const lifecycle = fs.readFileSync("server/services/reservationLifecycle.ts", "utf8");
    expect(lifecycle).not.toMatch(/update\(storeSkus\)|update\(batchLedger\)|qtyOnHand\s*:|stockQty\s*:/);
    expect(lifecycle).toContain("assertCanonicalAvailableForReservation");
  });
});
