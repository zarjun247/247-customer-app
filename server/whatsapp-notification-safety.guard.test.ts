import { describe, expect, it, afterEach } from "vitest";
import crypto from "crypto";
import fs from "fs";
import {
  assertWhatsappWebhookGuard,
  isRegulatedMedicineIntent,
  normalizeWhatsAppPhone,
  validateWebhookSignature,
} from "./routers/whatsappRouter";
import { buildSafeNotificationPayload, normalizeProviderResult } from "./services/notificationService";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("WhatsApp notification safety", () => {
  it("rejects invalid WhatsApp webhook verification in production", () => {
    process.env.NODE_ENV = "production";
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "expected-token";
    expect(() =>
      assertWhatsappWebhookGuard({ req: { header: () => undefined } }, JSON.stringify({ message: "hi" })),
    ).toThrow(/Webhook verification required/);
  });

  it("accepts a valid WhatsApp webhook token in production", () => {
    process.env.NODE_ENV = "production";
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "expected-token";
    expect(() =>
      assertWhatsappWebhookGuard({ req: { header: (name) => (name === "x-webhook-token" ? "expected-token" : undefined) } }, "{}"),
    ).not.toThrow();
  });

  it("accepts a valid WhatsApp webhook signature in production", () => {
    process.env.NODE_ENV = "production";
    process.env.WHATSAPP_WEBHOOK_SECRET = "top-secret";
    const payload = JSON.stringify({ phone: "+919999999999", message: "hi" });
    const signature = `sha256=${crypto.createHmac("sha256", "top-secret").update(payload).digest("hex")}`;
    expect(validateWebhookSignature(payload, signature, "top-secret")).toBe(true);
    expect(() =>
      assertWhatsappWebhookGuard({ req: { header: (name) => (name === "x-hub-signature-256" ? signature : undefined) } }, payload),
    ).not.toThrow();
  });

  it("detects regulated WhatsApp intents that must escalate to staff/pharmacist", () => {
    expect(isRegulatedMedicineIntent("Can I change the dosage of my Schedule H refill? Please substitute it." )).toBe(true);
    expect(isRegulatedMedicineIntent("I have side effects after this Rx medicine, emergency help" )).toBe(true);
  });

  it("keeps regulated refill/order paths non-autonomous in router source", () => {
    const src = fs.readFileSync("server/routers/whatsappRouter.ts", "utf8");
    expect(src).toContain("I cannot auto-confirm this refill/order on WhatsApp");
    expect(src).toContain("whatsapp.regulated_intent.escalated");
    expect(src).toContain("createRegulatedIntentHandoff");
  });

  it("prevents unlinked WhatsApp identity from accessing private order/prescription data", () => {
    expect(normalizeWhatsAppPhone("99999 99999")).toBe("+919999999999");
    const fullRouterSrc = fs.readFileSync("server/routers/whatsappRouter.ts", "utf8");
    const shallowRouterSrc = fs.readFileSync("server/routers.ts", "utf8");
    expect(fullRouterSrc).toContain("!userId || order.userId !== userId");
    expect(fullRouterSrc).toContain("pending_link");
    expect(shallowRouterSrc).toContain("!linkedUser");
    expect(shallowRouterSrc).toContain("order.userId !== linkedUser.id");
  });

  it("supports sensitivity-only notification preference updates and idempotent defaults", () => {
    const src = fs.readFileSync("server/services/notificationService.ts", "utf8");
    expect(src).toContain("updates.allowSensitiveInUnsafeChannels !== undefined");
    expect(src.match(/onDuplicateKeyUpdate/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(src).toContain("getNotificationPreferences(customerId)");
  });

  it("does not mark unavailable providers as sent", () => {
    expect(normalizeProviderResult(undefined).status).toBe("provider_unconfigured");
    expect(normalizeProviderResult(false).status).toBe("failed");
    expect(normalizeProviderResult({ ok: false, error: "boom" }).status).toBe("failed");
  });

  it("blocks sensitive payloads from unsafe channels when preference disallows", () => {
    expect(
      buildSafeNotificationPayload({ channel: "whatsapp", title: "Atorvastatin", body: "Take 10mg tonight", sensitive: true }, false),
    ).toEqual({ title: "Medication reminder", body: "You have an important pharmacy update." });
    expect(
      buildSafeNotificationPayload({ channel: "email", title: "Atorvastatin", body: "Take 10mg tonight", sensitive: true }, false),
    ).toEqual({ title: "Atorvastatin", body: "Take 10mg tonight" });
  });
});
