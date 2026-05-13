import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { metricsTokenAuth } from "./metricsAuth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReq(authHeader?: string): any {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRes(): any {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
}

describe("metricsTokenAuth middleware", () => {
  const middleware = metricsTokenAuth();

  beforeEach(() => {
    delete process.env.METRICS_SCRAPE_TOKEN;
  });

  afterEach(() => {
    delete process.env.METRICS_SCRAPE_TOKEN;
  });

  it("calls next() and sets authenticated flag when Bearer token matches env token", () => {
    process.env.METRICS_SCRAPE_TOKEN = "secret-xyz";
    const req = makeReq("Bearer secret-xyz");
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(req.metricsTokenAuthenticated).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it("calls next() without setting flag when Bearer token does not match env token", () => {
    process.env.METRICS_SCRAPE_TOKEN = "secret-xyz";
    const req = makeReq("Bearer wrong-token");
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(req.metricsTokenAuthenticated).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("calls next() when METRICS_SCRAPE_TOKEN is not set in env (permissive)", () => {
    const req = makeReq("Bearer any-token");
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next() when Authorization header is absent", () => {
    process.env.METRICS_SCRAPE_TOKEN = "secret-xyz";
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(req.metricsTokenAuthenticated).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next() when Authorization header is not a Bearer token", () => {
    process.env.METRICS_SCRAPE_TOKEN = "secret-xyz";
    const req = makeReq("Basic dXNlcjpwYXNz");
    const res = makeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.metricsTokenAuthenticated).toBeUndefined();
  });

  it("reads METRICS_SCRAPE_TOKEN at request time, not module load time", () => {
    // Token not set when middleware was created, set now at request time
    const req = makeReq("Bearer late-token");
    const res = makeRes();
    const next = vi.fn();

    process.env.METRICS_SCRAPE_TOKEN = "late-token";
    middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.metricsTokenAuthenticated).toBe(true);
  });
});
