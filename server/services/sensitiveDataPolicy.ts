export type SensitiveDataCategory =
  | "prescription_image"
  | "diagnosis_or_doctor_notes"
  | "h1_register"
  | "invoice_customer_contact"
  | "otp_or_secret"
  | "payment_signature_or_token"
  | "session_cookie";

export const SENSITIVE_DATA_POLICY: Record<SensitiveDataCategory, { sensitive: true; auditLogRule: string }> = {
  prescription_image: { sensitive: true, auditLogRule: "Never log prescription image URLs, base64 payloads, or file blobs." },
  diagnosis_or_doctor_notes: { sensitive: true, auditLogRule: "Log only record IDs and purpose; never log diagnosis text or doctor notes." },
  h1_register: { sensitive: true, auditLogRule: "Log H1 access/export metadata only; never log register contents." },
  invoice_customer_contact: { sensitive: true, auditLogRule: "Mask phone/email/address fields before logging invoice context." },
  otp_or_secret: { sensitive: true, auditLogRule: "Never log OTPs, passwords, API keys, or provider secrets." },
  payment_signature_or_token: { sensitive: true, auditLogRule: "Never log payment signatures, tokens, cookies, or authorization headers." },
  session_cookie: { sensitive: true, auditLogRule: "Never log raw session cookies or bearer credentials." },
};

const REDACTED = "[REDACTED]";
const REMOVED = "[REMOVED_SENSITIVE_PAYLOAD]";

const sensitiveKeyPattern = /(otp|one[-_ ]?time|password|passcode|secret|token|signature|authorization|cookie|set-cookie|razorpay_signature|payment_signature|base64|imageBase64|file|blob|buffer|prescriptionImage|prescriptionUrl|mediaUrl|diagnosis|doctorNote|doctorNotes|clinicalNote|h1Register|address|userAddress)/i;
const phoneKeyPattern = /phone|mobile|whatsapp/i;
const emailKeyPattern = /email/i;
const base64DataUriPattern = /^data:[^;]+;base64,/i;
const likelyLongBase64Pattern = /^[A-Za-z0-9+/=\r\n]{80,}$/;
const tokenLikePattern = /(Bearer\s+)[A-Za-z0-9._~+/=-]+|([?&](?:token|signature|otp|key|secret)=)[^&\s]+/gi;

export function maskPhone(phone: string | null | undefined): string | null | undefined {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${phone.startsWith("+") ? "+" : ""}${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskEmail(email: string | null | undefined): string | null | undefined {
  if (!email) return email;
  const [local, domain] = email.split("@");
  if (!domain) return REDACTED;
  return `${local.slice(0, 1)}***@${domain}`;
}

function redactString(value: string): string {
  if (base64DataUriPattern.test(value) || likelyLongBase64Pattern.test(value)) return REMOVED;
  return value.replace(tokenLikePattern, (_match, bearerPrefix, queryPrefix) => `${bearerPrefix ?? queryPrefix}${REDACTED}`);
}

export function redactSensitiveForLogs<T>(input: T): T {
  return redactValue(input, new WeakSet()) as T;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return REMOVED;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) {
      output[key] = REMOVED;
    } else if (phoneKeyPattern.test(key) && typeof raw === "string") {
      output[key] = maskPhone(raw);
    } else if (emailKeyPattern.test(key) && typeof raw === "string") {
      output[key] = maskEmail(raw);
    } else {
      output[key] = redactValue(raw, seen);
    }
  }
  return output;
}

export type SensitiveAuditAccessType = "prescription_image" | "invoice" | "h1_record" | "sensitive_export" | "denied_access";

export function buildSensitiveAccessAuditEvent(params: {
  accessType: SensitiveAuditAccessType;
  actorId?: number | null;
  actorRole?: string | null;
  entityType: string;
  entityId?: number | null;
  purpose: string;
  decision?: "allowed" | "denied";
  metadata?: Record<string, unknown>;
}) {
  return {
    action: `privacy.${params.accessType}.${params.decision ?? "allowed"}`,
    actorId: params.actorId ?? null,
    actorRole: params.actorRole ?? null,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    afterJson: redactSensitiveForLogs({
      purpose: params.purpose,
      decision: params.decision ?? "allowed",
      metadata: params.metadata ?? {},
    }),
    source: "privacy_policy",
  };
}
