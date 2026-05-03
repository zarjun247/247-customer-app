import { describe, it, expect } from "vitest";
import { computeAvailableQty } from "./services/reservationService";

describe("reservation service", () => {
  it("uses canonical availability formula", () => {
    expect(computeAvailableQty({ onHandQty: 10, reservedQty: 2, softLockedQty: 1, quarantinedQty: 1, expiredQty: 1 })).toBe(5);
  });
});
