import { describe, it, expect } from "vitest";
import fs from "fs";

describe("otp hardening", () => {
  it("does not return devCode in production", () => {
    const src = fs.readFileSync("server/routers.ts", "utf8");
    expect(src).toContain("devCode: !ENV.isProduction ? code : undefined");
  });

  it("requires explicit OTP rate limiter mode in production", () => {
    const src = fs.readFileSync("server/routers.ts", "utf8");
    expect(src).toContain("OTP_RATE_LIMIT_BACKEND");
    expect(src).toContain(
      "OTP disabled: OTP_RATE_LIMIT_BACKEND must be set for production"
    );
  });
});
