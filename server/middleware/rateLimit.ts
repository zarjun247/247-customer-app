/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { NextFunction, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import {
  checkAbuse,
  createSuspiciousActivityEvent,
  logSuspiciousActivity,
  type AbuseReason,
} from "../services/abuseProtection";
import type {
  RateLimitPolicy,
  RateLimitStore,
} from "../services/rateLimitService";

export interface AbuseRateLimitOptions {
  reason: AbuseReason;
  action: string;
  route?: string;
  policy: RateLimitPolicy;
  store?: RateLimitStore;
}

export function expressAbuseRateLimit(options: AbuseRateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const decision = checkAbuse({
      actor: {
        ip: req.ip,
        userId: (req as Request & { user?: { id?: number | string } }).user?.id,
        phone: typeof req.body?.phone === "string" ? req.body.phone : undefined,
        deviceId: req.header("x-device-id") ?? undefined,
        sessionId: req.header("x-session-id") ?? undefined,
        route: options.route ?? req.path,
        action: options.action,
      },
      reason: options.reason,
      policy: options.policy,
      store: options.store,
    });
    if (decision.decision === "allow") return next();
    res.setHeader(
      "Retry-After",
      Math.ceil(decision.rateLimit.retryAfterMs / 1000).toString()
    );
    logSuspiciousActivity(
      createSuspiciousActivityEvent({
        actor: {
          ip: req.ip,
          route: options.route ?? req.path,
          action: options.action,
        },
        reason: options.reason,
      })
    );
    res
      .status(429)
      .json({ error: "Too many requests", reason: options.reason });
  };
}

export function assertAllowedOrThrow(result: {
  decision: string;
  reason: AbuseReason;
  rateLimit: { retryAfterMs: number };
}) {
  if (result.decision === "allow") return;
  throw new TRPCError({
    code: result.decision === "block" ? "FORBIDDEN" : "TOO_MANY_REQUESTS",
    message: "Too many requests",
  });
}
