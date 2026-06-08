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

  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  it("returns limited=false for an unconfigured procedure", async () => {
    const result = await checkProcedureRateLimit(
      "some.unknown",
      mockCtx(),
      store
    );
    expect(result.limited).toBe(false);
  });

  it("returns limited=false on first call within limit", async () => {
    const config = new Map([["test.proc", { windowMs: 60_000, max: 5 }]]);
    const result = await checkProcedureRateLimit(
      "test.proc",
      mockCtx(),
      store,
      config
    );
    expect(result.limited).toBe(false);
  });

  it("returns limited=true after exceeding max", async () => {
    const config = new Map([["test.proc", { windowMs: 60_000, max: 2 }]]);
    const ctx = mockCtx("5.5.5.5");
    await checkProcedureRateLimit("test.proc", ctx, store, config);
    await checkProcedureRateLimit("test.proc", ctx, store, config);
    const result = await checkProcedureRateLimit(
      "test.proc",
      ctx,
      store,
      config
    ); // 3rd call exceeds max=2
    expect(result.limited).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("different IPs get independent buckets", async () => {
    const config = new Map([["test.proc", { windowMs: 60_000, max: 1 }]]);
    const ctx1 = mockCtx("1.1.1.1");
    const ctx2 = mockCtx("2.2.2.2");
    await checkProcedureRateLimit("test.proc", ctx1, store, config);
    await checkProcedureRateLimit("test.proc", ctx1, store, config); // 2nd for ctx1 → over limit
    const resultCtx1 = await checkProcedureRateLimit(
      "test.proc",
      ctx1,
      store,
      config
    );
    const resultCtx2 = await checkProcedureRateLimit(
      "test.proc",
      ctx2,
      store,
      config
    ); // 1st for ctx2 → OK
    expect(resultCtx1.limited).toBe(true);
    expect(resultCtx2.limited).toBe(false);
  });

  it("authenticated users get user-scoped buckets separate from anon", async () => {
    const config = new Map([["test.proc", { windowMs: 60_000, max: 1 }]]);
    const anonCtx = mockCtx("3.3.3.3", null);
    const authCtx = mockCtx("3.3.3.3", 99);
    await checkProcedureRateLimit("test.proc", anonCtx, store, config);
    await checkProcedureRateLimit("test.proc", anonCtx, store, config); // over for anon
    const anonResult = await checkProcedureRateLimit(
      "test.proc",
      anonCtx,
      store,
      config
    );
    const authResult = await checkProcedureRateLimit(
      "test.proc",
      authCtx,
      store,
      config
    ); // 1st for user 99 → OK
    expect(anonResult.limited).toBe(true);
    expect(authResult.limited).toBe(false);
  });
});

// ─── throwIfRateLimited ───────────────────────────────────────────────────────

describe("throwIfRateLimited", () => {
  it("does not throw for unconfigured procedure", async () => {
    const store = new MemoryRateLimitStore();
    await expect(
      throwIfRateLimited("no.such", mockCtx(), store)
    ).resolves.toBeUndefined();
  });

  it("throws TRPCError with TOO_MANY_REQUESTS when limited", async () => {
    const store = new MemoryRateLimitStore();
    const config = new Map([["otp.send", { windowMs: 60_000, max: 1 }]]);
    const ctx = mockCtx("4.4.4.4");
    // Exhaust the limit
    await checkProcedureRateLimit("otp.send", ctx, store, config);
    await checkProcedureRateLimit("otp.send", ctx, store, config);
    await expect(
      throwIfRateLimited("otp.send", ctx, store, config)
    ).rejects.toThrow(TRPCError);
  });
});

// ─── createExpressRateLimitMiddleware ─────────────────────────────────────────

function makeResMock() {
  const data: {
    status?: number;
    body?: unknown;
    headers: Record<string, string>;
  } = { headers: {} };
  return {
    status: (code: number) => {
      data.status = code;
      return {
        json: (body: unknown) => {
          data.body = body;
        },
      };
    },
    setHeader: (k: string, v: string) => {
      data.headers[k] = v;
    },
    data,
  };
}

describe("createExpressRateLimitMiddleware", () => {
  it("calls next() when under limit", async () => {
    const store = new MemoryRateLimitStore();
    const mw = createExpressRateLimitMiddleware(
      "/api/test",
      { windowMs: 60_000, max: 5 },
      store
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = { ip: "7.7.7.7", socket: {} } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = makeResMock() as any;
    let nextCalled = false;
    await new Promise<void>(resolve => {
      mw(req, res, () => {
        nextCalled = true;
        resolve();
      });
    });
    expect(nextCalled).toBe(true);
  });

  it("responds 429 and does NOT call next() when over limit", async () => {
    const store = new MemoryRateLimitStore();
    const mw = createExpressRateLimitMiddleware(
      "/api/test",
      { windowMs: 60_000, max: 1 },
      store
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = { ip: "8.8.8.8", socket: {} } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res1 = makeResMock() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res2 = makeResMock() as any;
    await new Promise<void>(resolve => mw(req, res1, () => resolve()));
    // exhaust: 2nd call hits the limit so next() may not be called — use timeout fallback
    await new Promise<void>(resolve => {
      mw(req, res1, () => resolve());
      setTimeout(resolve, 100);
    });
    let nextCalled = false;
    await new Promise<void>(resolve => {
      mw(req, res2, () => {
        nextCalled = true;
        resolve();
      });
      // Also resolve if blocked (next won't be called, so we need a timeout)
      setTimeout(resolve, 100);
    });
    expect(nextCalled).toBe(false);
    expect(res2.data.status).toBe(429);
  });

  it("sets Retry-After header on 429", async () => {
    const store = new MemoryRateLimitStore();
    const mw = createExpressRateLimitMiddleware(
      "/api/test",
      { windowMs: 60_000, max: 1, blockMs: 30_000 },
      store
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req = { ip: "9.9.9.9", socket: {} } as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = makeResMock() as any;
    await new Promise<void>(resolve => mw(req, res, () => resolve()));
    // exhaust: 2nd call hits the limit so next() may not be called — use timeout fallback
    await new Promise<void>(resolve => {
      mw(req, res, () => resolve());
      setTimeout(resolve, 100);
    }); // exhaust (blockMs kicks in)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res3 = makeResMock() as any;
    await new Promise<void>(resolve => {
      mw(req, res3, () => resolve());
      setTimeout(resolve, 100);
    });
    expect(res3.data.headers["Retry-After"]).toBeTruthy();
  });
});
