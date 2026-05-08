const SENSITIVE_KEY_PATTERN = /(image|file|blob|token|secret|password|authorization|bearer|prescriptionUrl|prescriptionFile|customerMobile|patientPhone|phone|email|address)/i;

export function safeRef(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redactSensitive(nested);
    }
  }
  return out;
}

export function csvEscape(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
