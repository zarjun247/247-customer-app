import crypto from "crypto";

export const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,80}$/;
const SECRET_KEY_PATTERN = /(authorization|bearer|cookie|set-cookie|password|passwd|secret|token|api[_-]?key|otp|one[_-]?time|signature|razorpay|whatsapp|payment|prescription.*image|image.*base64|raw.*file|file.*blob|blob|base64)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\s-]?){10,14}\d/g;
const BEARER_PATTERN = /bearer\s+[a-z0-9\-._~+/]+=*/gi;
const DATA_URI_PATTERN = /data:(?:image|application)\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi;
const LONG_BASE64_PATTERN = /\b[A-Za-z0-9+/]{120,}={0,2}\b/g;

export type StructuredLogFields = {
  requestId?: string;
  method?: string;
  route?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  actorId?: string | number;
  actorRole?: string;
  storeId?: string | number;
  errorCode?: string;
  [key: string]: unknown;
};

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === "string" && SAFE_REQUEST_ID.test(value);
}

export function getOrCreateRequestId(incoming?: unknown): string {
  if (isSafeRequestId(incoming)) return incoming;
  return crypto.randomUUID();
}

function maskEmail(value: string): string {
  return value.replace(EMAIL_PATTERN, email => {
    const [local, domain] = email.split("@");
    const visible = local.length <= 2 ? `${local[0] ?? "*"}*` : `${local[0]}***${local[local.length - 1]}`;
    return `${visible}@${domain}`;
  });
}

function maskPhone(value: string): string {
  return value.replace(PHONE_PATTERN, phone => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return phone;
    return `[PHONE:${digits.slice(-4)}]`;
  });
}

export function redactString(value: string): string {
  return maskPhone(maskEmail(value))
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(DATA_URI_PATTERN, "[REDACTED_FILE_DATA]")
    .replace(LONG_BASE64_PATTERN, "[REDACTED_BLOB]")
    .replace(/(["']?(?:otp|code|password|secret|token|api[_-]?key|signature|razorpay[_-]?secret|whatsapp[_-]?token)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[REDACTED]");
}

export function redactForLog<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return redactString(input) as T;
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (input instanceof Date) return input.toISOString() as T;
  if (Array.isArray(input)) return input.map(item => redactForLog(item)) as T;
  if (typeof input === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      redacted[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactForLog(value);
    }
    return redacted as T;
  }
  return input;
}

export function createStructuredLog(fields: StructuredLogFields): StructuredLogFields {
  const safe = redactForLog(fields) as StructuredLogFields;
  return {
    event: "http_request",
    requestId: safe.requestId,
    method: safe.method,
    route: safe.route,
    path: safe.path,
    statusCode: safe.statusCode,
    durationMs: safe.durationMs,
    actorId: safe.actorId,
    actorRole: safe.actorRole,
    storeId: safe.storeId,
    errorCode: safe.errorCode,
  };
}
