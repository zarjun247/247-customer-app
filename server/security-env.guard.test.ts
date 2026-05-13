import { describe, it, expect } from "vitest";

describe("env guard", () => {
  it("requires JWT_SECRET and DATABASE_URL in production", async () => {
    const old = { ...process.env };
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "";
    process.env.DATABASE_URL = "";
    process.env.OTP_PROVIDER_ENABLED = "false";
    await expect(import("./_core/env?guard=" + Date.now())).rejects.toThrow(
      /Missing required production env/
    );
    process.env = old;
  });
});
