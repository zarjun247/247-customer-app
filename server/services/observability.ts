import crypto from "crypto";
import type { Request, Response } from "express";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLog = {
  requestId?: string;
  level: LogLevel;
  event: string;
  route?: string;
  actorId?: string | number;
  storeId?: string | number;
  durationMs?: number;
  status?: number | string;
  errorCode?: string;
  reason?: string;
  [key: string]: unknown;
};

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERNS = [
  /otp/i,
  /code/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /secret/i,
  /signature/i,
  /api[_-]?key/i,
  /password/i,
  /prescription.*(image|base64|payload|data)/i,
  /medical.*(payload|data|record|history)/i,
  /raw.*(body|payload|data)/i,
  /razorpay.*(secret|signature)/i,
];

const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const LONG_BASE64_PATTERN = /(?:data:[^;]+;base64,)?[A-Za-z0-9+/]{80,}={0,2}/g;
const OTP_VALUE_PATTERN = /\b(?:otp|code)\b\s*[:=]\s*["']?\d{4,8}["']?/gi;
const COOKIE_TOKEN_PATTERN = /(?:app_session_id|session|jwt|token)=([^;\s]+)/gi;
const RAZORPAY_SIGNATURE_PATTERN = /\b(?:razorpay_signature|x-razorpay-signature|signature)\b\s*[:=]\s*["']?[a-f0-9]{32,}["']?/gi;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

function redactString(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(COOKIE_TOKEN_PATTERN, match => match.split("=")[0] + "=[REDACTED]")
    .replace(OTP_VALUE_PATTERN, match => match.replace(/\d{4,8}/, REDACTED))
    .replace(RAZORPAY_SIGNATURE_PATTERN, match => match.replace(/[a-f0-9]{32,}/i, REDACTED))
    .replace(LONG_BASE64_PATTERN, REDACTED);
}

export function redactForLog<T>(value: T, parentKey = "", seen = new WeakSet<object>()): T {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value) as T;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]" as T;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map(item => redactForLog(item, parentKey, seen)) as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key) || isSensitiveKey(parentKey ? `${parentKey}.${key}` : key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redactForLog(child, key, seen);
    }
  }
  return out as T;
}

export function getOrCreateRequestId(req: Request): string {
  const header = req.header("x-request-id") || req.header("x-correlation-id");
  const existing = Array.isArray(header) ? header[0] : header;
  return existing || crypto.randomUUID();
}

export function buildRequestLog(req: Request, res: Response, startMs: number, error?: { code?: string; reason?: string }): StructuredLog {
  const user = (req as any).user;
  return redactForLog({
    requestId: (req as any).requestId,
    level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    event: "http.request.completed",
    route: req.originalUrl || req.url,
    method: req.method,
    actorId: user?.id ?? user?.userId,
    storeId: user?.storeId ?? (req as any).storeId,
    durationMs: Date.now() - startMs,
    status: res.statusCode,
    errorCode: error?.code,
    reason: error?.reason,
  });
}

export function writeStructuredLog(entry: StructuredLog): void {
  const safe = redactForLog(entry);
  const writer = safe.level === "error" ? console.error : safe.level === "warn" ? console.warn : console.info;
  writer(JSON.stringify(safe));
}
