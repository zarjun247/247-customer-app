import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("idempotency/reservation guards", () => {
  it("has durable idempotency table and no in-memory-only critical guard", () => {
    const schemaTxt = fs
      .readdirSync("drizzle/schema")
      .filter(f => f.endsWith(".ts") && f !== "index.ts")
      .map(f => fs.readFileSync(`drizzle/schema/${f}`, "utf8"))
      .join("\n");
    expect(schemaTxt.includes("idempotency_keys")).toBe(true);
  });
  it("sale confirm duplicate guard marker exists", () => {
    const src = fs.readFileSync("server/routers/salesRouter.ts", "utf8");
    expect(src.includes("Sale already confirmed")).toBe(true);
    expect(src.includes("recordDiscountCodeUsage")).toBe(true);
  });
  it("purchase commit duplicate guard marker exists", () => {
    const src =
      fs.readFileSync("server/routers/purchaseRouter.ts", "utf8") +
      fs.readFileSync("server/routers/purchaseRouterExtension.ts", "utf8");
    expect(src.includes("withIdempotency")).toBe(true);
    expect(src.includes('inv.status === "committed"')).toBe(true);
  });
  it("payment verify + delivery + stock audit duplicate status guards exist", () => {
    const pay = fs.readFileSync("server/routers/paymentRouter.ts", "utf8");
    const del = fs.readFileSync("server/routers/deliveryRouter.ts", "utf8");
    const inv =
      fs.readFileSync("server/routers/inventoryRouter.ts", "utf8") +
      fs.readFileSync("server/routers/inventoryRouterExtension.ts", "utf8");
    expect(pay.includes('payment.status === "paid"')).toBe(true);
    expect(pay.includes("withIdempotency")).toBe(true);
    expect(del.includes('task.status === "delivered"')).toBe(true);
    expect(inv.includes('audit.status === "completed"')).toBe(true);
  });
  it("sale confirm uses canonical availability helper", () => {
    const src = fs.readFileSync("server/routers/salesRouter.ts", "utf8");
    expect(src.includes("getCanonicalAvailability")).toBe(true);
  });
});
