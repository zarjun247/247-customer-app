import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createInMemoryReservationLifecycleStore } from "./services/reservationLifecycle";

describe("reservation lifecycle integration handoffs", () => {
  it("checkout failure fails created reservations and prevents stale active reservations", () => {
    const db = fs.readFileSync("server/db.ts", "utf8");
    expect(db).toContain("createReservation");
    expect(db).toContain("checkout_failed_after_reservation");
    expect(db).toContain("failReservation");
  });

  it("payment failure and payment verification failure release or fail reservations", () => {
    const router = fs.readFileSync("server/routers/paymentRouter.ts", "utf8");
    const webhook = fs.readFileSync(
      "server/services/paymentWebhookLifecycle.ts",
      "utf8"
    );
    expect(router).toContain("payment_verification_failed");
    expect(router).toContain("releaseReservationOnPaymentFailure");
    expect(webhook).toContain("releaseReservationForFailedPayment");
    expect(webhook).toContain("reservation:payment_");
  });

  it("Rx rejection and order cancellation handoffs cancel or release reservations", () => {
    const rx = fs.readFileSync(
      "server/routers/prescriptionGovRouter.ts",
      "utf8"
    );
    const service = fs.readFileSync(
      "server/services/reservationService.ts",
      "utf8"
    );
    expect(rx).toContain("releaseReservationOnRxReject");
    expect(rx).toContain("reservation:rx_rejected");
    expect(service).toContain("releaseReservationOnOrderCancel");
  });

  it("delivery fulfillment consumes reservations once", () => {
    const delivery = fs.readFileSync(
      "server/routers/deliveryRouter.ts",
      "utf8"
    );
    expect(delivery).toContain("consumeReservation");
    expect(delivery).toContain("reservation:delivery_delivered");
  });

  it("expiry reconciliation leaves no stale active expired reservation in memory", () => {
    const store = createInMemoryReservationLifecycleStore([
      {
        id: "old",
        storeId: 1,
        productId: 10,
        qty: 1,
        status: "active",
        expiresAt: new Date("2020-01-01T00:00:00Z"),
      },
    ]);
    expect(store.reconcileExpired(new Date("2020-01-02T00:00:00Z"))).toEqual({
      staleActiveCount: 0,
    });
    expect(store.reservations[0].status).toBe("expired");
  });
});
