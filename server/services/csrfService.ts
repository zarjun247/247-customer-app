/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
import { doubleCsrf } from "csrf-csrf";
import pino from "pino";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// Log a CRITICAL warning at boot if CSRF_SECRET is not configured in production.
// Boot is not halted — SM-D's phase-gating decides whether to enforce.
const csrfSecret = process.env.CSRF_SECRET ?? "";
if (!csrfSecret && process.env.NODE_ENV === "production") {
  logger.error(
    "CRITICAL: CSRF_SECRET is not set. Using insecure development default in production. " +
      "Set CSRF_SECRET to a strong random value before serving real users."
  );
}

const ttlMs = ENV.csrfTokenTtlHours * 60 * 60 * 1000;

export const {
  invalidCsrfTokenError,
  generateCsrfToken,
  validateRequest,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => csrfSecret || "dev-secret-change-me",
  // v4 requires a session identifier to bind the token to a session.
  // We derive it from the session cookie or IP as a fallback.
  getSessionIdentifier: req => {
    const cookie = (req.cookies as Record<string, string> | undefined) ?? {};
    return cookie["app_session"] ?? (req as any).ip ?? "anon";
  },
  cookieName: "__Host-csrf",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(ttlMs / 1000),
    path: "/",
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
});
