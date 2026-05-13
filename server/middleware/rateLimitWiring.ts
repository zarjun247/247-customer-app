import type { RequestHandler } from "express";
import { TRPCError } from "@trpc/server";
import {
  MemoryRateLimitStore,
  buildRateLimitKey,
  type RateLimitPolicy,
  type RateLimitStore,
} from "../services/rateLimitService";

// Per-procedure rate-limit config. Keys match tRPC path (e.g. "auth.sendOtp").
// windowMs: sliding window in milliseconds; max: requests allowed per window.
export const PROCEDURE_RATE_LIMITS: ReadonlyMap<string, RateLimitPolicy> =
  new Map([
    ["auth.sendOtp", { windowMs: 60_000, max: 5, blockMs: 300_000 }],
    ["auth.verifyOtp", { windowMs: 60_000, max: 10, blockMs: 300_000 }],
    ["prescription.create", { windowMs: 60_000, max: 10 }],
    ["prescription.upload", { windowMs: 60_000, max: 5 }],
    ["order.create", { windowMs: 60_000, max: 30 }],
    ["cart.addItem", { windowMs: 60_000, max: 60 }],
    ["checkout.initiate", { windowMs: 60_000, max: 20 }],
    ["catalog.list", { windowMs: 60_000, max: 120 }],
  ]);

export const defaultRateLimitStore = new MemoryRateLimitStore();

// ─── tRPC middleware factory ───────────────────────────────────────────────────

export type RateLimitMiddlewareContext = {
  user?: { id?: number | null } | null;
  req?: {
    ip?: string;
    socket?: { remoteAddress?: string };
    headers?: Record<string, string | string[] | undefined>;
  } | null;
};

export function checkProcedureRateLimit(
  path: string,
  ctx: RateLimitMiddlewareContext,
  store: RateLimitStore = defaultRateLimitStore,
  config: ReadonlyMap<string, RateLimitPolicy> = PROCEDURE_RATE_LIMITS,
  now?: number
): { limited: boolean; retryAfterMs: number } {
  const policy = config.get(path);
  if (!policy) return { limited: false, retryAfterMs: 0 };

  const ip = ctx.req?.ip ?? ctx.req?.socket?.remoteAddress ?? "unknown";
  const userId = ctx.user?.id ?? null;
  const key = buildRateLimitKey({
    procedure: path,
    ip,
    userId: userId ?? "anon",
  });

  const result = store.hit(key, policy, now);
  return { limited: result.limited, retryAfterMs: result.retryAfterMs };
}

// ─── Express middleware for REST routes ───────────────────────────────────────

export type RouteRateLimitConfig = {
  windowMs: number;
  max: number;
  blockMs?: number;
};

export function createExpressRateLimitMiddleware(
  routePrefix: string,
  policy: RouteRateLimitConfig,
  store: RateLimitStore = defaultRateLimitStore
): RequestHandler {
  return (req, res, next) => {
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const key = buildRateLimitKey({ route: routePrefix, ip });
    const result = store.hit(key, policy);
    if (result.limited) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil(result.retryAfterMs / 1000))
      );
      res.status(429).json({
        error: "Too many requests",
        retryAfterMs: result.retryAfterMs,
      });
      return;
    }
    next();
  };
}

// Pre-built middleware for the known public REST endpoints

export function rateLimitAuthRoutes(
  store: RateLimitStore = defaultRateLimitStore
): RequestHandler {
  return createExpressRateLimitMiddleware(
    "/api/auth",
    { windowMs: 60_000, max: 10, blockMs: 300_000 },
    store
  );
}

export function rateLimitWebhookRoutes(
  store: RateLimitStore = defaultRateLimitStore
): RequestHandler {
  return createExpressRateLimitMiddleware(
    "/api/webhooks",
    { windowMs: 60_000, max: 300 },
    store
  );
}

// ─── Error thrower for tRPC context ──────────────────────────────────────────

export function throwIfRateLimited(
  path: string,
  ctx: RateLimitMiddlewareContext,
  store?: RateLimitStore,
  config?: ReadonlyMap<string, RateLimitPolicy>
): void {
  const { limited, retryAfterMs } = checkProcedureRateLimit(
    path,
    ctx,
    store,
    config
  );
  if (limited) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded for '${path}'. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`,
    });
  }
}
