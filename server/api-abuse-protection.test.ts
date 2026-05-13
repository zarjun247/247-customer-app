import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  MemoryRateLimitStore,
  getProductionRateLimitPosture,
} from "./services/rateLimitService";
import {
  checkAdminBruteforce,
  checkCartUpsert,
  checkCheckoutAttempt,
  checkOtpSend,
  checkOtpVerifyFailure,
  checkUploadAttempt,
  checkWebhookReplay,
  checkWebhookSignatureFailure,
  createSuspiciousActivityEvent,
  resetAbuseProtectionForTests,
  sanitizeAbuseDetails,
} from "./services/abuseProtection";

describe("api abuse protection service", () => {
  beforeEach(() => resetAbuseProtectionForTests());

  it("throttles OTP send by phone/IP actor key", () => {
    const store = new MemoryRateLimitStore();
    const actor = {
      phone: "+919876543210",
      ip: "203.0.113.9",
      route: "auth.sendOtp",
    };
    const decisions = Array.from({ length: 6 }, (_, i) =>
      checkOtpSend(actor, store, i)
    );
    expect(decisions.slice(0, 5).every(d => d.decision === "allow")).toBe(true);
    expect(decisions[5].decision).toBe("throttle");
    expect(decisions[5].reason).toBe("otp_spam");
  });

  it("throttles repeated failed OTP verification without logging OTP material", () => {
    const store = new MemoryRateLimitStore();
    const actor = {
      phone: "+919876543210",
      ip: "203.0.113.9",
      route: "auth.verifyOtp",
    };
    const decisions = Array.from({ length: 9 }, (_, i) =>
      checkOtpVerifyFailure(actor, store, i)
    );
    expect(decisions[8].decision).toBe("throttle");
    const event = createSuspiciousActivityEvent({
      actor: { ...actor, action: "otp.verify" },
      reason: "login_bruteforce",
      details: { otp: "123456", code: "123456", token: "secret" },
    });
    expect(JSON.stringify(event)).not.toContain("123456");
    expect(JSON.stringify(event)).not.toContain("secret");
  });

  it("rejects/throttles repeated upload abuse attempts with safe details", () => {
    const store = new MemoryRateLimitStore();
    const actor = {
      userId: 42,
      ip: "203.0.113.10",
      route: "prescription.upload",
    };
    let last = checkUploadAttempt(actor, store, 1);
    for (let i = 2; i <= 21; i += 1) last = checkUploadAttempt(actor, store, i);
    expect(last.decision).toBe("throttle");
    const safe = sanitizeAbuseDetails({
      imageBase64: "data:image/png;base64,AAAA",
      prescriptionPayload: "raw medical details",
    });
    expect(safe.imageBase64).toBe("[REDACTED]");
    expect(safe.prescriptionPayload).toBe("[REDACTED]");
  });

  it("has conservative cart and checkout spam guards", () => {
    const store = new MemoryRateLimitStore();
    const actor = { userId: 7, ip: "198.51.100.2", route: "cart.upsert" };
    for (let i = 0; i < 120; i += 1)
      expect(checkCartUpsert(actor, store, i).decision).toBe("allow");
    expect(checkCartUpsert(actor, store, 121).decision).toBe("throttle");

    const checkoutStore = new MemoryRateLimitStore();
    const checkoutActor = {
      userId: 7,
      ip: "198.51.100.2",
      route: "orders.checkout",
    };
    for (let i = 0; i < 12; i += 1)
      expect(
        checkCheckoutAttempt(checkoutActor, checkoutStore, i).decision
      ).toBe("allow");
    expect(
      checkCheckoutAttempt(checkoutActor, checkoutStore, 13).decision
    ).toBe("throttle");
  });

  it("has an admin brute-force guard", () => {
    const store = new MemoryRateLimitStore();
    const actor = {
      phone: "+919999999999",
      ip: "192.0.2.44",
      route: "admin.login",
    };
    for (let i = 0; i < 6; i += 1)
      expect(checkAdminBruteforce(actor, store, i).decision).toBe("allow");
    expect(checkAdminBruteforce(actor, store, 7).decision).toBe("throttle");
  });

  it("counts malformed provider signatures as suspicious without crashing", () => {
    const store = new MemoryRateLimitStore();
    const actor = { ip: "192.0.2.55", route: "webhook.whatsapp" };
    for (let i = 0; i < 25; i += 1)
      expect(checkWebhookSignatureFailure(actor, store, i).decision).toBe(
        "allow"
      );
    expect(checkWebhookSignatureFailure(actor, store, 26).decision).toBe(
      "suspicious"
    );
  });

  it("detects webhook replay in static in-memory guard and documents durable P1 elsewhere", () => {
    expect(checkWebhookReplay("razorpay", "evt_123", 1000).decision).toBe(
      "allow"
    );
    expect(checkWebhookReplay("razorpay", "evt_123", 1001).decision).toBe(
      "suspicious"
    );
  });

  it("redacts suspicious activity phone/token/signature/prescription payload", () => {
    const event = createSuspiciousActivityEvent({
      actor: {
        action: "checkout.create",
        phone: "+919876543210",
        ip: "203.0.113.77",
        route: "orders.checkout",
      },
      reason: "checkout_spam",
      details: {
        signature: "pay_sig_secret",
        authCookie: "cookie: app_session_id=raw",
        prescriptionImage: "data:image/jpeg;base64,/9j/AAAA",
        note: "safe",
      },
    });
    const asJson = JSON.stringify(event);
    expect(asJson).not.toContain("9876543210");
    expect(asJson).not.toContain("pay_sig_secret");
    expect(asJson).not.toContain("app_session_id");
    expect(asJson).not.toContain("/9j/AAAA");
    expect(event.phoneMasked).toBe("[PHONE:3210]");
    expect(event.details?.note).toBe("safe");
  });

  it("does not falsely mark production memory rate limits production-ready", () => {
    const posture = getProductionRateLimitPosture({ NODE_ENV: "production" });
    expect(posture.productionReady).toBe(false);
    expect(posture.limitation).toContain("not horizontally durable");
  });

  it("logs suspicious events through a safe helper", () => {
    const logger = { warn: vi.fn() };
    const event = createSuspiciousActivityEvent({
      actor: { action: "admin.auth", ip: "192.0.2.1" },
      reason: "admin_bruteforce",
    });
    logger.warn("security.suspicious_activity", event);
    expect(logger.warn).toHaveBeenCalledWith(
      "security.suspicious_activity",
      expect.objectContaining({ reason: "admin_bruteforce" })
    );
  });
});
