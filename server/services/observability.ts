import crypto from "crypto";

export type SafeLogLevel = "info" | "warn" | "error";

export type SafeStructuredLog = {
  event: string;
  level?: SafeLogLevel;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  actor?: { userId?: string; role?: string; storeId?: string };
  error?: SafeSerializedError;
  meta?: unknown;
};

export type SafeSerializedError = {
  name: string;
  message: string;
  code?: string;
  reason?: string;
};

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;
const REDACTED = "[REDACTED]";
const OMITTED_BINARY = "[REDACTED:binary]";
const OMITTED_MEDICAL = "[REDACTED:medical]";
const MAX_STRING_LENGTH = 800;
const MAX_DEPTH = 8;

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|set-cookie|password|passwd|pwd|secret|token|session|jwt|otp|code|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|signature|razorpay[_-]?signature|razorpay[_-]?secret|whatsapp.*token|whatsapp.*secret|database[_-]?url|db[_-]?url|payment.*secret|payment.*signature)/i;
const PHI_KEY_PATTERN = /(prescription|medical|diagnosis|symptom|notes?|doctor|patient|rx|h1|schedule[_-]?h|phone|email|address|flatNumber|userAddress)/i;
const BINARY_KEY_PATTERN = /(buffer|blob|base64|image|imageData|file|fileData|document|documentData|rawBody|rawPayload|ocrRawText|prescriptionImage)/i;
const DB_URL_PATTERN = /\b(?:mysql|postgres(?:ql)?|mongodb|redis):\/\/[^\s"'<>]+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+\-/]+=*/gi;
const AWS_KEY_PATTERN = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?\d[\s-]?){10,14}\b/g;
const BASE64_IMAGE_PATTERN = /data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi;
const LONG_BASE64_PATTERN = /\b[A-Za-z0-9+/]{160,}={0,2}\b/g;

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value) && !/[\r\n]/.test(value);
}

export function createRequestId(inbound?: unknown): string {
  if (isSafeRequestId(inbound)) return inbound;
  return crypto.randomUUID();
}

export function redactString(value: string): string {
  return value
    .replace(BASE64_IMAGE_PATTERN, "data:[REDACTED]")
    .replace(DB_URL_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(AWS_KEY_PATTERN, REDACTED)
    .replace(JWT_PATTERN, REDACTED)
    .replace(/(razorpay_signature|signature|secret|token|password|otp|api[_-]?key|database_url)(["'\s:=]+)([^\s,"'}]+)/gi, `$1$2${REDACTED}`)
    .replace(EMAIL_PATTERN, "[EMAIL]")
    .replace(PHONE_PATTERN, "[PHONE]")
    .replace(LONG_BASE64_PATTERN, REDACTED);
}

function isBufferLike(value: unknown): boolean {
  return value instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer(value));
}

export function redactValue(value: unknown, depth = 0, keyHint = ""): unknown {
  if (depth > MAX_DEPTH) return "[REDACTED:depth_limit]";
  if (value === null || value === undefined) return value;
  if (isBufferLike(value)) return OMITTED_BINARY;
  if (value instanceof Date) return value.toISOString();

  if (SENSITIVE_KEY_PATTERN.test(keyHint)) return REDACTED;
  if (BINARY_KEY_PATTERN.test(keyHint)) return OMITTED_BINARY;
  if (PHI_KEY_PATTERN.test(keyHint)) return OMITTED_MEDICAL;

  if (typeof value === "string") {
    const redacted = redactString(value);
    if (redacted.length > MAX_STRING_LENGTH) return `[REDACTED:length:${redacted.length}]`;
    return redacted;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactValue(item, depth + 1, keyHint));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = redactValue(nested, depth + 1, key);
    }
    return output;
  }
  return REDACTED;
}

export function redactObject<T = unknown>(value: T): T {
  return redactValue(value) as T;
}

export function safeMetadata(value: unknown): unknown {
  return redactValue(value);
}

export function safeError(error: unknown): SafeSerializedError {
  const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  const name = error instanceof Error ? error.name : typeof record.name === "string" ? record.name : "Error";
  const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : typeof record.message === "string" ? record.message : "Unknown error";
  const code = typeof record.code === "string" ? record.code : undefined;
  const reason = typeof record.reason === "string" ? record.reason : undefined;
  return {
    name: redactString(name).slice(0, 120),
    message: redactString(rawMessage).slice(0, 300),
    ...(code ? { code: redactString(code).slice(0, 120) } : {}),
    ...(reason ? { reason: redactString(reason).slice(0, 200) } : {}),
  };
}

export function serializeSafeLog(entry: SafeStructuredLog): string {
  return JSON.stringify(redactValue(entry));
}
