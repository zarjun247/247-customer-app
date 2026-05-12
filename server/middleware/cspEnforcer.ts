import type { RequestHandler } from "express";

export type CspMode = "off" | "report_only" | "enforce";

// Base directives suitable for a React SPA served by a Node/Express backend.
// 'unsafe-inline' is needed for Vite-injected styles and React hydration scripts
// in development; tighten nonce-based CSP in a future hardening pass.
const CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  "script-src": "'self' 'unsafe-inline'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data: blob:",
  "font-src": "'self' data:",
  "connect-src": "'self'",
  "media-src": "'self'",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "frame-ancestors": "'none'",
  "upgrade-insecure-requests": "",
};

export function buildCspHeader(reportUri?: string | null): string {
  const parts = Object.entries(CSP_DIRECTIVES).map(([directive, value]) =>
    value ? `${directive} ${value}` : directive
  );
  if (reportUri) parts.push(`report-uri ${reportUri}`);
  return parts.join("; ");
}

export function parseCspMode(raw: string | undefined): CspMode {
  if (raw === "enforce" || raw === "report_only" || raw === "off") return raw;
  // SM-B: default changed from "off" to "enforce". Set CSP_MODE=report_only for staged rollout.
  return "enforce";
}

export function buildCspMiddleware(
  mode: CspMode,
  reportUri?: string | null
): RequestHandler {
  if (mode === "off") {
    return (_req, _res, next) => next();
  }

  const headerValue = buildCspHeader(reportUri);
  const headerName =
    mode === "enforce"
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only";

  return (_req, res, next) => {
    res.setHeader(headerName, headerValue);
    next();
  };
}
