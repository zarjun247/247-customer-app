import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("delivery regulated release guard", () => {
  const source = fs.readFileSync("server/routers/deliveryRouter.ts", "utf8");
  it("has regulated delivery guard helper and audits", () => {
    expect(source).toContain("assertRegulatedDeliveryAllowed");
    expect(source).toContain("delivery.regulated_release_blocked");
    expect(source).toContain("delivery.regulated_release_allowed");
  });
  it("checks delivery guard before out for delivery and delivery completion", () => {
    expect(source).toContain("outForDelivery");
    expect(source).toContain("deliverWithOtp");
    expect(source).toContain("deliverWithPhoto");
  });
});
