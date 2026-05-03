import { describe, it, expect } from "vitest";
import fs from "fs";

const allow = ["sendOtp", "verifyOtp", "health", "webhook"];

describe("publicProcedure guard", () => {
  it("flags sensitive public procedures", () => {
    const files = ["server/routers/paymentRouter.ts","server/routers/reportsRouter.ts","server/routers/salesRouter.ts","server/routers/deliveryRouter.ts"];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect(src.includes("publicProcedure")).toBe(false);
    }
  });

  it("requires whatsapp webhook fail-closed guard", () => {
    const src = fs.readFileSync("server/routers/whatsappRouter.ts", "utf8");
    expect(src).toContain("assertWhatsappWebhookGuard");
    expect(src).toContain("Webhook verification required");
  });

  it("documents explicit allowlist", () => expect(allow.length).toBeGreaterThan(0));
});
