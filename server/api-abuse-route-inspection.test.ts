import { describe, expect, it } from "vitest";
import fs from "fs";

describe("public/high-risk route inspection guard", () => {
  const routers = fs.readFileSync("server/routers.ts", "utf8");
  const whatsapp = fs.readFileSync("server/routers/whatsappRouter.ts", "utf8");
  const payment = fs.readFileSync("server/routers/paymentRouter.ts", "utf8");
  const abuse = fs.readFileSync("server/services/abuseProtection.ts", "utf8");

  it("inspects existing auth/OTP routes and preserves no-OTP logging posture", () => {
    expect(routers).toContain("sendOtp");
    expect(routers).toContain("verifyOtp");
    expect(routers).toContain("console.info(\"auth.otp_requested\")");
    expect(routers).not.toMatch(/console\.(log|info|warn|error)\([^\n]*(devCode|code)[^\n]*\)/);
    expect(abuse).toContain("checkOtpSend");
    expect(abuse).toContain("checkOtpVerifyFailure");
  });

  it("inspects upload route and central upload abuse guard", () => {
    expect(routers).toContain("imageBase64");
    expect(routers).toContain("buffer.length > 8 * 1024 * 1024");
    expect(routers).toContain("Invalid file signature");
    expect(abuse).toContain("checkUploadAttempt");
  });

  it("inspects cart/checkout routes and central spam guards", () => {
    expect(routers).toContain("const cartRouter = router");
    expect(routers).toContain("upsertCartItem");
    expect(routers).toContain("checkout: protectedProcedure");
    expect(abuse).toContain("checkCartUpsert");
    expect(abuse).toContain("checkCheckoutAttempt");
  });

  it("inspects provider webhook signature posture and central replay/signature guards", () => {
    expect(whatsapp).toContain("assertWhatsappWebhookGuard");
    expect(whatsapp).toContain("validateWebhookSignature");
    expect(payment).toContain("verifyGatewayPaymentSignature");
    expect(payment).toContain("withIdempotency");
    expect(abuse).toContain("checkWebhookReplay");
    expect(abuse).toContain("checkWebhookSignatureFailure");
  });
});
