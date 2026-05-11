import { describe, it, expect, beforeEach } from "vitest";
import { MemoryRateLimitStore } from "../services/rateLimitService";
import {
  checkProcedureRateLimit,
  createExpressRateLimitMiddleware,
  throwIfRateLimited,
  PROCEDURE_RATE_LIMITS,
} from "./rateLimitWiring";
import { TRPCError } from "@trpc/server";

const mockCtx = (ip = "1.2.3.4", userId: number | null = null) => ({
  user: userId != null ? { id: userId } : null,
  req: { ip },
});

// ─── PROCEDURE_RATE_LIMITS config ─────────────────────────────────────────────

describe("PROCEDURE_RATE_LIMITS", () => {
  it("has an entry for auth.sendOtp", () => {
    expect(PROCEDURE_RATE_LIMITS.has("auth.sendOtp")).toBe(true);
  });

  it("auth.sendOtp has blockMs set (brute-force protection)", () => {
    expect(PROCEDURE_RATE_LIMITS.get("auth.sendOtp")?.blockMs).toBeTruthy();
  });

  it("has an entry for catalog.list with a generous limit", () => {
    const policy = PROCEDURE_RATE_LIMITS.get("catalog.list");
    expect(policy).toBeDefined();
    expect(policy!.max).toBeGreaterThanOrEqual(60);
  });
});

// ─── checkProcedureRateLimit ──────────────────────────────────────────────────

describe("checkProcedureRateLimit", () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => { store = new MemoryRateLimitStore(); });

  it("returns limited=false for an unconfigured procedure", () => {
    const result = checkProcedureRateLimit("some.unknown", mockCtx(), store);
    expect(result.limited).toBe(false);
  });

  it("returns limited=false on first call within limit", () => {
    const config = new Map([["test.proc", { windowMs: 60_000, max: 5 }]]);
    const result = checkProcedureRateLimit("test.proc", mockCtx(), store, config);
    expect(result.limited).toBe(false);
  });

  it("returns limited=true after exceeding max", () => {
    const config = new Map([["test.proc", { windowMs: 60_000, max: 2 }]]);
    const ctx = mockCtx("5.5.5.5");
    checkProcedureRateLimit("test.proc", ctx, store, config);
    checkProcedureRateLimit("test.proc", ctx, store, config);
    const result = checkProcedureRateLimit("test.proc", ctx, store, config); // 3rd call exceeds max=2
    expect(result.limited).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("different IPs get independent buckets", () => {
    const config = new Map([["test.proc", { windowMs: 60_000, max: 1 }]]);
    const ctx1 = mockCtx("1.1.1.1");
    const ctx2 = mockCtx("2.2.2.2");
    checkProcedureRateLimit("test.proc", ctx1, store, config);
    checkProcedureRateLimit("test.proc", ctx1, store, config); // 2nd for ctx1 → over limit
    const resultCtx1 = checkProcedureRateLimit("test.proc", ctx1, store, config);
    const resultCtx2 = checkProcedureRateLimit("test.proc", ctx2, store, config); // 1st for ctx2 → OK
    expect(resultCtx1.limited).toBe(true);
    expect(resultCtx2.limited).toBe(false);
  });

  it("authenticated users get user-scoped buckets separate from anon", () => {
    const config = new Map([["test.proc", { windowMs: 60_000, max: 1 }]]);
    const anonCtx = mockCtx("3.3.3.3", null);
    const authCtx = mockCtx("3.3.3.3", 99);
    checkProcedureRateLimit("test.proc", anonCtx, store, config);
    checkProcedureRateLimit("test.proc", anonCtx, store, config); // over for anon
    const anonResult = checkProcedureRateLimit("test.proc", anonCtx, store, config);
    const authResult = checkProcedureRateLimit("test.proc", authCtx, store, config); // 1st for user 99 → OK
    expect(anonResult.limited).toBe(true);
    expect(authResult.limited).toBe(false);
  });
});

// ─── throwIfRateLimited ───────────────────────────────────────────────────────

describe("throwIfRateLimited", () => {
  it("does not throw for unconfigured procedure", () => {
    const store = new MemoryRateLimitStore();
    expect(() => throwIfRateLimited("no.such", mockCtx(), store)).not.toThrow();
  });

  it("throws TRPCError with TOO_MANY_REQUESTS when limited", () => {
    const store = new MemoryRateLimitStore();
    const config = new Map([["otp.send", { windowMs: 60_000, max: 1 }]]);
    const ctx = mockCtx("4.4.4.4");
    // Exhaust the limit
    checkProcedureRateLimit("otp.send", ctx, store, config);
    checkProcedureRateLimit("otp.send", ctx, store, config);
    expect(() => throwIfRateLimited("otp.send", ctx, store, config)).toThrow(TRPCError);
  });
});

// ─── createExpressRateLimitMiddleware ─────────────────────────────────────────

function makeResMock() {
  const data: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  return {
    status: (code: number) => { data.status = code; return { json: (body: unknown) => { data.body = body; } }; },
    setHeader: (k: string, v: string) => { data.headers[k] = v; },
    data,
  };
}

describe("createExpressRateLimitMiddleware", () => {
  it("calls next() when under limit", () => {
    const store = new MemoryRateLimitStore();
    const mw = createExpressRateLimitMiddleware("/api/test", { windowMs: 60_000, max: 5 }, store);
    const req = { ip: "7.7.7.7", socket: {} } as any;
    const res = makeResMock() as any;
    let nextCalled = false;
    mw(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it("responds 429 and does NOT call next() when over limit", () => {
    const store = new MemoryRateLimitStore();
    const mw = createExpressRateLimitMiddleware("/api/test", { windowMs: 60_000, max: 1 }, store);
    const req = { ip: "8.8.8.8", socket: {} } as any;
    const res1 = makeResMock() as any;
    const res2 = makeResMock() as any;
    mw(req, res1, () => {});
    mw(req, res1, () => {}); // exhaust
    let nextCalled = false;
    mw(req, res2, () => { nextCalled = true; }); // should be blocked
    expect(nextCalled).toBe(false);
    expect(res2.data.status).toBe(429);
  });

  it("sets Retry-After header on 429", () => {
    const store = new MemoryRateLimitStore();
    const mw = createExpressRateLimitMiddleware("/api/test", { windowMs: 60_000, max: 1, blockMs: 30_000 }, store);
    const req = { ip: "9.9.9.9", socket: {} } as any;
    const res = makeResMock() as any;
    mw(req, res, () => {});
    mw(req, res, () => {}); // exhaust (blockMs kicks in)
    const res3 = makeResMock() as any;
    mw(req, res3, () => {});
    expect(res3.data.headers["Retry-After"]).toBeTruthy();
  });
});
