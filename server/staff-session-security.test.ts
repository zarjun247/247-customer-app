import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  InMemoryStaffSecurityStore,
  STAFF_SESSION_POLICY,
  hasActiveStaffAcknowledgement,
  listActiveStaffSessions,
  recordStaffAcknowledgement,
  recordStaffDeviceSession,
  revokeStaffSession,
} from "./services/staffSessionSecurity";

const schema = readdirSync("drizzle/schema")
  .filter(f => f.endsWith(".ts") && f !== "index.ts")
  .map(f => readFileSync(`drizzle/schema/${f}`, "utf8"))
  .join("\n");
const migration = readFileSync(
  "drizzle/0043_privacy_staff_session.sql",
  "utf8"
);

describe("staff acknowledgement and session security foundation", () => {
  it("documents additive staff acknowledgement and durable device session tables", () => {
    expect(schema).toContain("staffAcknowledgements");
    expect(schema).toContain("staffDeviceSessions");
    expect(migration).toContain("patient_data_confidentiality");
    expect(migration).toContain("no_shared_accounts");
    expect(migration).toContain("staff_device_sessions_staff_session_uq");
  });

  it("records active staff confidentiality acknowledgements", async () => {
    const store = new InMemoryStaffSecurityStore();
    expect(
      await hasActiveStaffAcknowledgement(
        41,
        "patient_data_confidentiality",
        "2026.05",
        store
      )
    ).toBe(false);
    await recordStaffAcknowledgement(
      {
        staffId: 41,
        acknowledgementType: "patient_data_confidentiality",
        version: "2026.05",
        ipAddress: "10.0.0.1",
        userAgent: "Terminal/1.0",
      },
      store
    );
    expect(
      await hasActiveStaffAcknowledgement(
        41,
        "patient_data_confidentiality",
        "2026.05",
        store
      )
    ).toBe(true);
    expect(store.audits[0].action).toBe("staff.acknowledgement.recorded");
  });

  it("lists and revokes only the targeted staff session without affecting unrelated users", async () => {
    const store = new InMemoryStaffSecurityStore();
    await recordStaffDeviceSession(
      {
        staffId: 1,
        sessionId: "sess-a",
        deviceId: "dev-a",
        terminalId: "cash-1",
      },
      store
    );
    await recordStaffDeviceSession(
      {
        staffId: 2,
        sessionId: "sess-b",
        deviceId: "dev-b",
        terminalId: "cash-2",
      },
      store
    );
    expect(await listActiveStaffSessions(undefined, store)).toHaveLength(2);

    const revoked = await revokeStaffSession(
      "sess-a",
      99,
      "lost terminal",
      store
    );
    expect(revoked?.staffId).toBe(1);
    expect(await listActiveStaffSessions(undefined, store)).toHaveLength(1);
    expect((await listActiveStaffSessions(undefined, store))[0].staffId).toBe(
      2
    );
    expect(store.audits.map(audit => audit.action)).toContain(
      "staff.session.revoked"
    );
  });

  it("keeps timeout, terminal lock, cashier PIN, no shared account, and role switch policies explicit", () => {
    expect(STAFF_SESSION_POLICY.idleTimeoutMinutes).toBe(15);
    expect(STAFF_SESSION_POLICY.terminalLockRequired).toBe(true);
    expect(
      STAFF_SESSION_POLICY.cashierPinRequiredForSensitiveActions
    ).toContain("existing PIN/auth pattern");
    expect(STAFF_SESSION_POLICY.sharedSuperAdminAccounts).toContain(
      "prohibited"
    );
    expect(STAFF_SESSION_POLICY.roleSwitchPrevention).toContain(
      "no in-session role elevation"
    );
  });
});
