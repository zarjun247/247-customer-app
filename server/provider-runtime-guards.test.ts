import fs from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = fs.readFileSync("server/services/providerRuntime.ts", "utf8");
const migration = fs.readFileSync("drizzle/0049_provider_operation_attempts.sql", "utf8");

describe("provider runtime governance guards", () => {
  it("declares the full canonical provider operation lifecycle", () => {
    for (const status of ["pending", "queued", "sent", "synced", "verified", "printed", "completed", "failed", "retrying", "dead_letter", "disabled", "not_configured", "manual_required", "cancelled"]) {
      expect(runtime).toContain(`"${status}"`);
      expect(migration).toContain(`'${status}'`);
    }
  });

  it("adds a durable provider_operation_attempts ledger without raw payload columns", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `provider_operation_attempts`");
    for (const column of ["providerType", "operationType", "entityType", "entityRef", "status", "idempotencyKey", "requestHash", "responseHash", "deadLetteredAt"]) {
      expect(migration).toContain(column);
    }
    expect(migration).not.toMatch(/rawPayload|rawBody|secretValue|otpValue|prescriptionText/i);
  });

  it("governance scan should not find provider success guard bypass primitives in provider runtime", () => {
    expect(runtime).toContain("assertProviderOperationNotFakeSuccess");
    expect(runtime).not.toContain("return { status: \"sent\", ok: true };");
    expect(runtime).not.toContain("return true");
  });
});
