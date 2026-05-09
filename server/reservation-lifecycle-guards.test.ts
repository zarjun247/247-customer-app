import fs from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createInMemoryReservationLifecycleStore } from "./services/reservationLifecycle";

describe("reservation lifecycle production guards", () => {
  it("requires non-null idempotency keys for all mutation paths", () => {
    const store = createInMemoryReservationLifecycleStore([
      { id: "r1", storeId: 1, productId: 10, qty: 1, status: "active" },
    ]);
    expect(() => store.release({ id: "r1", idempotencyKey: "" })).toThrow(
      /idempotency key/i
    );
    expect(() =>
      store.create({
        id: "r2",
        storeId: 1,
        productId: 10,
        qty: 1,
        idempotencyKey: "",
      })
    ).toThrow(/idempotency key/i);
  });

  it("includes failed as a durable reservation status in schema and migration 0050", () => {
    expect(fs.readFileSync("drizzle/schema.ts", "utf8")).toContain('"failed"');
    expect(
      fs.readFileSync(
        "drizzle/0050_reservation_lifecycle_failed_status.sql",
        "utf8"
      )
    ).toContain("'failed'");
  });

  it("does not use forbidden reservation identifier anti-patterns", () => {
    const src =
      fs.readFileSync("server/services/reservationLifecycle.ts", "utf8") +
      fs.readFileSync("server/services/reservationService.ts", "utf8");
    expect(src).not.toContain("entityId: 0");
    expect(src).not.toContain("Number(uuid)");
    expect(src).not.toContain("as unknown as string");
  });

  it("keeps direct stock mutation out of reservation lifecycle services", () => {
    const out = execSync(
      'rg -n "update\\((batchLedger|storeSkus)\\)|insert\\(stockMovements\\)" server/services/reservationLifecycle.ts || true',
      { encoding: "utf8" }
    ).trim();
    expect(out).toBe("");
  });

  it("does not create fake success return objects in lifecycle service", () => {
    const src = fs.readFileSync(
      "server/services/reservationLifecycle.ts",
      "utf8"
    );
    expect(src).not.toContain("success: true");
    expect(src).not.toContain("synced: true");
  });
});
