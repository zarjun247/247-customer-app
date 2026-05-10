import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ writeAuditLog: vi.fn(async () => undefined) }));

const { redactObject, safeError, serializeSafeLog } = await import("./services/observability");
const { sanitizeJobPayload, enqueueJob, resetJobQueueForTests } = await import("./services/jobQueue");
const { logAudit, requireOverrideReason } = await import("./services/audit");
const db = await import("./db");

describe("PHI/PII/security redaction seal", () => {
  it("redacts patient identity, contact details, prescription blobs, and secrets from logs", () => {
    const payload = {
      patientName: "Jane Patient",
      email: "jane@example.com",
      phone: "+919999999999",
      address: "Tower A, Flat 101",
      authorization: "Bearer secret-token",
      prescriptionImage: "data:image/png;base64," + "a".repeat(200),
      nested: { apiKey: "abc123", note: "call +919888888888" },
    };
    const text = serializeSafeLog({ event: "test", meta: payload });
    expect(text).not.toContain("Jane Patient");
    expect(text).not.toContain("jane@example.com");
    expect(text).not.toContain("9999999999");
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("aaaa");
    expect(text).toContain("[REDACTED:medical]");
  });

  it("sanitizes worker/provider payload persistence", async () => {
    resetJobQueueForTests();
    const sanitized = sanitizeJobPayload({ patientName: "Jane Patient", email: "jane@example.com", token: "abc", rawPayload: { secret: "value" }, nested: { phone: "+919999999999", ok: "safe" } });
    expect(sanitized).toEqual({ patientName: "[REDACTED:phi]", email: "[REDACTED:phi]", token: "[REDACTED]", rawPayload: "[REDACTED]", nested: { phone: "[REDACTED:phi]", ok: "safe" } });
    const job = await enqueueJob({ queueName: "providers", jobType: "provider.retry", idempotencyKey: "provider:redact:1", payloadJson: sanitized as Record<string, unknown> });
    expect(JSON.stringify(job.job.payloadJson)).not.toContain("Jane Patient");
    expect(JSON.stringify(job.job.payloadJson)).not.toContain("abc");
  });

  it("redacts audit before/after/metadata while preserving actor attribution", async () => {
    await logAudit({ actorId: 42, actorRole: "pharmacist", action: "manual.override.test", entityType: "order", entityRef: "order:1", beforeJson: { patientName: "Jane Patient" }, afterJson: { phone: "+919999999999" }, reason: "operator corrected jane@example.com" });
    const written = vi.mocked(db.writeAuditLog).mock.calls.at(-1)?.[0] as any;
    const serialized = JSON.stringify(written);
    expect(written.actor.id).toBe(42);
    expect(written.actor.role).toBe("pharmacist");
    expect(serialized).not.toContain("Jane Patient");
    expect(serialized).not.toContain("9999999999");
    expect(serialized).not.toContain("jane@example.com");
  });

  it("requires reasons for manual override audit actions", () => {
    expect(requireOverrideReason("stock.override.adjust", "cycle count correction")).toBe("cycle count correction");
    expect(() => requireOverrideReason("stock.override.adjust", "")).toThrow(/override_reason_required/);
  });

  it("safeError removes stack and credentials", () => {
    const err = new Error("failed mysql://user:password@db/app for jane@example.com");
    const safe = safeError(err);
    expect(safe).not.toHaveProperty("stack");
    expect(JSON.stringify(safe)).not.toContain("password@db");
    expect(JSON.stringify(safe)).not.toContain("jane@example.com");
  });
});
