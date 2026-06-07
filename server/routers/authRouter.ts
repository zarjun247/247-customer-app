import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { router, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { createOtp, verifyOtp, upsertUserByPhone, getUserByPhone } from "../db";
import { ENV } from "../_core/env";
import { redactSensitive } from "../_core/redact";

const otpRateLimit = new Map<string, { count: number; ts: number }>();
const otpVerifyFailures = new Map<string, { count: number; ts: number }>();

export function assertOtpLimiterMode() {
  const mode = (process.env.OTP_RATE_LIMIT_BACKEND ?? "").trim();
  if (
    ENV.isProduction &&
    mode !== "database" &&
    mode !== "memory_allowed_for_single_instance"
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "OTP disabled: OTP_RATE_LIMIT_BACKEND must be set for production",
    });
  }
}

export const authRouter = router({
  /** Returns the current user's session profile, or null if unauthenticated. */
  me: publicProcedure.query(opts => opts.ctx.user),
  /** Terminates the current session and clears the auth cookie. */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
  /** Sends a one-time password to the given phone number. Rate-limited per phone (5 requests per 15 min). */
  sendOtp: publicProcedure
    .input(z.object({ phone: z.string().min(10).max(15) }))
    .mutation(async ({ input }) => {
      assertOtpLimiterMode();
      const now = Date.now();
      const slot = otpRateLimit.get(input.phone);
      if (slot && now - slot.ts < 15 * 60 * 1000 && slot.count >= 5) {
        console.warn("auth.otp_rate_limited", redactSensitive(input.phone));
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many OTP requests",
        });
      }
      otpRateLimit.set(input.phone, {
        count: (slot?.count ?? 0) + 1,
        ts: slot?.ts ?? now,
      });
      // CSPRNG OTP — never Math.random()
      const { randomInt } = await import("node:crypto");
      const code = randomInt(100000, 1000000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      await createOtp(input.phone, code, expiresAt);
      console.info("auth.otp_requested");
      return { success: true, devCode: !ENV.isProduction ? code : undefined };
    }),
  /** Verifies a one-time password and issues an authenticated session cookie on success. */
  verifyOtp: publicProcedure
    .input(z.object({ phone: z.string(), code: z.string() }))
    .mutation(async ({ input, ctx }) => {
      assertOtpLimiterMode();
      const failSlot = otpVerifyFailures.get(input.phone);
      const now = Date.now();
      if (
        failSlot &&
        now - failSlot.ts < 15 * 60 * 1000 &&
        failSlot.count >= 8
      ) {
        console.warn("auth.otp_rate_limited", redactSensitive(input.phone));
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many OTP verification attempts",
        });
      }
      const valid = await verifyOtp(input.phone, input.code);
      if (!valid) {
        otpVerifyFailures.set(input.phone, {
          count: (failSlot?.count ?? 0) + 1,
          ts: failSlot?.ts ?? now,
        });
        console.warn("auth.otp_failed", redactSensitive(input.phone));
        return { valid: false as const };
      }
      otpVerifyFailures.delete(input.phone);
      console.info("auth.otp_verified");

      await upsertUserByPhone(input.phone, { loginMethod: "phone" });
      const user = await getUserByPhone(input.phone);
      if (!user)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });

      const { sdk } = await import("../_core/sdk");
      const sessionToken = await sdk.signSession(
        {
          openId: `phone:${input.phone}`,
          appId: ENV.appId,
          name: user.name ?? "",
        },
        { expiresInMs: 1000 * 60 * 60 * 24 * 365 }
      );
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: 1000 * 60 * 60 * 24 * 365,
      });

      return {
        valid: true as const,
        onboardingComplete: user.onboardingComplete,
        assignedStoreId: user.assignedStoreId,
      };
    }),
});
