import { describe, it, expect } from "vitest";
import { buildCspHeader, buildCspMiddleware, parseCspMode } from "./cspEnforcer";

// ─── parseCspMode ─────────────────────────────────────────────────────────────

describe("parseCspMode", () => {
  it("returns 'off' for undefined", () => {
    expect(parseCspMode(undefined)).toBe("off");
  });

  it("returns 'off' for unknown string", () => {
    expect(parseCspMode("garbage")).toBe("off");
  });

  it("returns 'enforce' when passed 'enforce'", () => {
    expect(parseCspMode("enforce")).toBe("enforce");
  });

  it("returns 'report_only' when passed 'report_only'", () => {
    expect(parseCspMode("report_only")).toBe("report_only");
  });

  it("returns 'off' when passed 'off'", () => {
    expect(parseCspMode("off")).toBe("off");
  });
});

// ─── buildCspHeader ───────────────────────────────────────────────────────────

describe("buildCspHeader", () => {
  it("includes default-src 'self'", () => {
    expect(buildCspHeader()).toContain("default-src 'self'");
  });

  it("includes frame-ancestors 'none'", () => {
    expect(buildCspHeader()).toContain("frame-ancestors 'none'");
  });

  it("includes object-src 'none'", () => {
    expect(buildCspHeader()).toContain("object-src 'none'");
  });

  it("includes upgrade-insecure-requests", () => {
    expect(buildCspHeader()).toContain("upgrade-insecure-requests");
  });

  it("appends report-uri when provided", () => {
    const header = buildCspHeader("/api/csp-report");
    expect(header).toContain("report-uri /api/csp-report");
  });

  it("does not include report-uri when not provided", () => {
    expect(buildCspHeader()).not.toContain("report-uri");
  });
});

// ─── buildCspMiddleware ───────────────────────────────────────────────────────

function makeRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    headers,
  };
}

describe("buildCspMiddleware", () => {
  it("mode=off: does not set any CSP header", () => {
    const mw = buildCspMiddleware("off");
    const res = makeRes();
    let called = false;
    mw({} as any, res as any, () => { called = true; });
    expect(called).toBe(true);
    expect(res.headers["Content-Security-Policy"]).toBeUndefined();
    expect(res.headers["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });

  it("mode=enforce: sets Content-Security-Policy header", () => {
    const mw = buildCspMiddleware("enforce");
    const res = makeRes();
    mw({} as any, res as any, () => {});
    expect(res.headers["Content-Security-Policy"]).toBeTruthy();
    expect(res.headers["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });

  it("mode=report_only: sets Content-Security-Policy-Report-Only header", () => {
    const mw = buildCspMiddleware("report_only");
    const res = makeRes();
    mw({} as any, res as any, () => {});
    expect(res.headers["Content-Security-Policy-Report-Only"]).toBeTruthy();
    expect(res.headers["Content-Security-Policy"]).toBeUndefined();
  });

  it("enforce mode includes report-uri when provided", () => {
    const mw = buildCspMiddleware("enforce", "/api/csp-report");
    const res = makeRes();
    mw({} as any, res as any, () => {});
    expect(res.headers["Content-Security-Policy"]).toContain("report-uri /api/csp-report");
  });

  it("calls next() in all modes", () => {
    for (const mode of ["off", "enforce", "report_only"] as const) {
      const mw = buildCspMiddleware(mode);
      const res = makeRes();
      let nextCalled = false;
      mw({} as any, res as any, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    }
  });
});
