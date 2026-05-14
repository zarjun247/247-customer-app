import { describe, expect, it } from "vitest";
import fs from "fs";

describe("public/high-risk route inspection guard", () => {
  const routers = fs.readFileSync("server/routers.ts", "utf8");
  const authRouter = fs.readFileSync("server/routers/authRouter.ts", "utf8");
  const prescriptionRouter = fs.readFileSync(
    "server/routers/prescriptionRouter.ts",
    "utf8"
  );
  const orderRouter = fs.readFileSync("server/routers/orderRouter.ts", "utf8");
  const whatsapp = fs.readFileSync("server/routers/whatsappRouter.ts", "utf8");
  const payment = fs.readFileSync("server/routers/paymentRouter.ts", "utf8");
  const abuse = fs.readFileSync("server/services/abuseProtection.ts", "utf8");

  it("inspects existing auth/OTP routes and preserves no-OTP logging posture", () => {
    expect(authRouter).toContain("sendOtp");
    expect(authRouter).toContain("verifyOtp");
    expect(authRouter).toContain('console.info("auth.otp_requested")');
    expect(authRouter).not.toMatch(
      /console\.(log|info|warn|error)\([^\n]*(devCode|code)[^\n]*\)/
    );
    expect(abuse).toContain("checkOtpSend");
    expect(abuse).toContain("checkOtpVerifyFailure");
  });

  it("inspects upload route and central upload abuse guard", () => {
    expect(prescriptionRouter).toContain("imageBase64");
    expect(prescriptionRouter).toContain("buffer.length > 8 * 1024 * 1024");
    expect(prescriptionRouter).toContain("Invalid file signature");
    expect(abuse).toContain("checkUploadAttempt");
  });

  it("inspects cart/checkout routes and central spam guards", () => {
    expect(routers).toContain("const cartRouter = router");
    expect(routers).toContain("upsertCartItem");
    expect(orderRouter).toContain("checkout: customerMutationProcedure");
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
