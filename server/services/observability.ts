import { randomUUID } from "crypto";

const REDACTED = "[REDACTED]";
const PII_REDACTED = "[REDACTED_PII]";

const SENSITIVE_KEY_PATTERN = /(?:password|passwd|pwd|otp|code|cookie|set-cookie|authorization|bearer|token|session|sessionid|api[_-]?key|secret|signature|aws[_-]?access|aws[_-]?secret|database[_-]?url|db[_-]?url|prescription|rx|image|base64|blob|medical|notes?)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+?\d[\s-]?){10,14}\d/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const DB_URL_PATTERN = /\b(?:mysql|postgres(?:ql)?|mariadb):\/\/[^\s"'<>]+/gi;
const DATA_IMAGE_PATTERN = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi;
const LONG_BASE64_PATTERN = /\b[A-Za-z0-9+/]{80,}={0,2}\b/g;
const COOKIE_PAIR_PATTERN = /\b(?:connect\.sid|app_session_id|session|sid|csrf|refresh_token|access_token)=[^;\s]+/gi;
const OTP_INLINE_PATTERN = /\b(?:otp|one[-_\s]?time[-_\s]?password|verification\s*code|code)\b\s*[:=]?\s*["']?\d{4,8}["']?/gi;
const SECRET_ASSIGNMENT_PATTERN = /\b(?:DATABASE_URL|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|WHATSAPP_TOKEN|WHATSAPP_ACCESS_TOKEN|WHATSAPP_API_TOKEN|PAYMENT_WEBHOOK_SECRET|JWT_SECRET|API_KEY|SECRET|TOKEN|SIGNATURE)\b\s*[:=]\s*[^\s,}"']+/gi;

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  actorId?: string | number;
  storeId?: string | number;
  status?: number;
  durationMs?: number;
  errorCode?: string;
  reason?: string;
  data?: unknown;
}

export function createRequestId(existing?: unknown): string {
  if (typeof existing === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(existing)) return existing;
  return randomUUID();
}

export function redactText(input: string): string {
  return input
    .replace(DATA_IMAGE_PATTERN, "data:image/[REDACTED]")
    .replace(DB_URL_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(COOKIE_PAIR_PATTERN, REDACTED)
    .replace(OTP_INLINE_PATTERN, (match) => match.replace(/\d{4,8}/, REDACTED))
    .replace(SECRET_ASSIGNMENT_PATTERN, (match) => match.replace(/[:=]\s*[^\s,}"']+/, `=${REDACTED}`))
    .replace(/\b[A-Za-z0-9_-]*(?:signature|secret|token|api[_-]?key)[A-Za-z0-9_-]*\b\s*[:=]\s*[^\s,}"']+/gi, (match) => match.replace(/[:=]\s*[^\s,}"']+/, `=${REDACTED}`))
    .replace(LONG_BASE64_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, PII_REDACTED)
    .replace(PHONE_PATTERN, PII_REDACTED);
}

export function redactForObservability<T>(value: T, depth = 0): T {
  if (depth > 12) return REDACTED as T;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value) as T;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value;
  if (value instanceof Date) return value.toISOString() as T;
  if (Array.isArray(value)) return value.map((item) => redactForObservability(item, depth + 1)) as T;
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        output[key] = REDACTED;
      } else {
        output[key] = redactForObservability(item, depth + 1);
      }
    }
    return output as T;
  }
  return REDACTED as T;
}

export function serializeSafe(value: unknown): string {
  return JSON.stringify(redactForObservability(value));
}

export function buildStructuredLog(entry: Omit<StructuredLogEntry, "timestamp">): StructuredLogEntry {
  const safe = redactForObservability(entry) as Omit<StructuredLogEntry, "timestamp">;
  return {
    timestamp: new Date().toISOString(),
    ...safe,
  };
}
