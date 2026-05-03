export function redactSensitive(input: string): string {
  return input
    .replace(/(otp|code)[:=]\s*\d{4,8}/gi, "$1:[REDACTED]")
    .replace(/bearer\s+[a-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]")
    .replace(/(authorization|token|signature)[:=]\s*[^\s,]+/gi, "$1:[REDACTED]")
    .replace(/(prescriptions\/|invoices\/|reports\/)[^\s"']+/gi, "$1[REDACTED]")
    .replace(/\b\+?\d{10,13}\b/g, "[PHONE]");
}

export function redactObject<T>(obj: T): T {
  return JSON.parse(redactSensitive(JSON.stringify(obj)));
}
