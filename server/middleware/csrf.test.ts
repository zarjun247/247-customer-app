import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const mockDoubleCsrfProtection = vi.fn(
  (_req: Request, _res: Response, next: NextFunction) => next()
);
const mockInvalidCsrfTokenError = new Error("InvalidCsrfTokenError");
mockInvalidCsrfTokenError.name = "InvalidCsrfTokenError";

vi.mock("../services/csrfService", () => ({
  doubleCsrfProtection: mockDoubleCsrfProtection,
  invalidCsrfTokenError: mockInvalidCsrfTokenError,
}));

vi.mock("pino", () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { csrfMiddleware, handleCsrfError } = await import("./csrf");

function makeReq(path: string, method = "POST"): Partial<Request> {
  return { path, method } as Partial<Request>;
}

function makeRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as Partial<Response>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDoubleCsrfProtection.mockImplementation(
    (_req: unknown, _res: unknown, next: () => void) => next()
  );
});

describe("csrfMiddleware", () => {
  it("exempts /api/webhooks/ routes", () => {
    const next = vi.fn();
    csrfMiddleware(
      makeReq("/api/webhooks/razorpay") as Request,
      makeRes() as Response,
      next
    );
    expect(next).toHaveBeenCalledOnce();
    expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
  });

  it("exempts /api/worker/ routes", () => {
    const next = vi.fn();
    csrfMiddleware(
      makeReq("/api/worker/run") as Request,
      makeRes() as Response,
      next
    );
    expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
  });

  it("exempts /health routes", () => {
    const next = vi.fn();
    csrfMiddleware(
      makeReq("/health/live") as Request,
      makeRes() as Response,
      next
    );
    expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
  });

  it("exempts /metrics route", () => {
    const next = vi.fn();
    csrfMiddleware(makeReq("/metrics") as Request, makeRes() as Response, next);
    expect(mockDoubleCsrfProtection).not.toHaveBeenCalled();
  });

  it("applies CSRF protection to /api/trpc routes", () => {
    const next = vi.fn();
    csrfMiddleware(
      makeReq("/api/trpc/dsr.access") as Request,
      makeRes() as Response,
      next
    );
    expect(mockDoubleCsrfProtection).toHaveBeenCalledOnce();
  });

  it("applies CSRF protection to POST /api/anything", () => {
    const next = vi.fn();
    csrfMiddleware(
      makeReq("/api/some-action", "POST") as Request,
      makeRes() as Response,
      next
    );
    expect(mockDoubleCsrfProtection).toHaveBeenCalledOnce();
  });

  it("calls next when doubleCsrfProtection passes", () => {
    const next = vi.fn();
    csrfMiddleware(
      makeReq("/api/trpc/foo") as Request,
      makeRes() as Response,
      next
    );
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("handleCsrfError", () => {
  it("returns 403 for CSRF token error", () => {
    const res = makeRes() as Response;
    const next = vi.fn();
    handleCsrfError(
      mockInvalidCsrfTokenError,
      makeReq("/api/trpc/foo") as Request,
      res,
      next as unknown
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("CSRF") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes non-CSRF errors to next", () => {
    const res = makeRes() as Response;
    const next = vi.fn();
    const otherError = new Error("other error");
    handleCsrfError(
      otherError,
      makeReq("/api/trpc/foo") as Request,
      res,
      next as unknown
    );
    expect(next).toHaveBeenCalledWith(otherError);
    expect(res.status).not.toHaveBeenCalled();
  });
});
