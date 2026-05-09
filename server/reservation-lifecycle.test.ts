import { describe, expect, it } from "vitest";
import {
  createInMemoryReservationLifecycleStore,
  evaluateReservationTransition,
} from "./services/reservationLifecycle";

describe("reservation lifecycle state machine", () => {
  it("allows active reservations to reach each truthful terminal state", () => {
    for (const status of [
      "consumed",
      "released",
      "expired",
      "cancelled",
      "failed",
    ] as const) {
      expect(
        evaluateReservationTransition("active", status, {
          idempotencyKey: `key-${status}`,
        })
      ).toMatchObject({ ok: true, status, idempotent: false });
    }
  });

  it("rejects terminal to consumed transitions unless consumed repeats the same key", () => {
    for (const status of [
      "released",
      "expired",
      "cancelled",
      "failed",
    ] as const) {
      expect(
        evaluateReservationTransition(status, "consumed", {
          idempotencyKey: `consume-${status}`,
        })
      ).toMatchObject({ ok: false, status });
    }
    expect(
      evaluateReservationTransition("consumed", "consumed", {
        idempotencyKey: "same",
        lastTransitionKey: "same",
      })
    ).toMatchObject({ ok: true, idempotent: true });
    expect(
      evaluateReservationTransition("consumed", "consumed", {
        idempotencyKey: "different",
        lastTransitionKey: "same",
      }).ok
    ).toBe(false);
  });

  it("makes release, cancel, fail, and expire idempotent without duplicate audit events", () => {
    const store = createInMemoryReservationLifecycleStore([
      { id: "r1", storeId: 1, productId: 10, qty: 1, status: "active" },
    ]);
    expect(
      store.release({ id: "r1", idempotencyKey: "release-1" })
    ).toMatchObject({ ok: true, idempotent: false, status: "released" });
    expect(
      store.release({ id: "r1", idempotencyKey: "release-2" })
    ).toMatchObject({ ok: true, idempotent: true, status: "released" });

    store.create({
      id: "r2",
      storeId: 1,
      productId: 11,
      qty: 1,
      idempotencyKey: "create-r2",
    });
    expect(
      store.cancel({ id: "r2", idempotencyKey: "cancel-1" })
    ).toMatchObject({ status: "cancelled", idempotent: false });
    expect(
      store.cancel({ id: "r2", idempotencyKey: "cancel-2" })
    ).toMatchObject({ status: "cancelled", idempotent: true });

    store.create({
      id: "r3",
      storeId: 1,
      productId: 12,
      qty: 1,
      idempotencyKey: "create-r3",
    });
    expect(store.fail({ id: "r3", idempotencyKey: "fail-1" })).toMatchObject({
      status: "failed",
      idempotent: false,
    });
    expect(store.fail({ id: "r3", idempotencyKey: "fail-2" })).toMatchObject({
      status: "failed",
      idempotent: true,
    });

    store.create({
      id: "r4",
      storeId: 1,
      productId: 13,
      qty: 1,
      idempotencyKey: "create-r4",
    });
    expect(
      store.expire({ id: "r4", idempotencyKey: "expire-1" })
    ).toMatchObject({ status: "expired", idempotent: false });
    expect(
      store.expire({ id: "r4", idempotencyKey: "expire-2" })
    ).toMatchObject({ status: "expired", idempotent: true });
  });

  it("makes repeated consume safe only for the same idempotency key", () => {
    const store = createInMemoryReservationLifecycleStore([
      { id: "r1", storeId: 1, productId: 10, qty: 2, status: "active" },
    ]);
    expect(
      store.consume({ id: "r1", idempotencyKey: "consume-1" })
    ).toMatchObject({ ok: true, idempotent: false, status: "consumed" });
    expect(
      store.consume({ id: "r1", idempotencyKey: "consume-1" })
    ).toMatchObject({ ok: true, idempotent: true, status: "consumed" });
    expect(() =>
      store.consume({ id: "r1", idempotencyKey: "consume-2" })
    ).toThrow(
      /Invalid reservation lifecycle transition|invalid reservation transition/
    );
    expect(
      store.events.filter(event => event.type === "reservation_consumed")
    ).toHaveLength(1);
  });
});
