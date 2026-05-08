import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ConsentRequiredError,
  InMemoryPrivacyConsentStore,
  assertConsentForSensitiveAction,
  assertFamilyProfileAccessConsent,
  getConsentAuditTrail,
  getConsentStatus,
  grantConsent,
  isReminderOrMarketingAllowed,
  isTransactionalNotificationAllowed,
  revokeConsent,
} from "./services/privacyConsent";
import { buildSensitiveAccessAuditEvent, maskEmail, maskPhone, redactSensitiveForLogs } from "./services/sensitiveDataPolicy";

const schema = readFileSync("drizzle/schema.ts", "utf8");
const migration = readFileSync("drizzle/0043_privacy_staff_session.sql", "utf8");

describe("privacy consent and sensitive data policy", () => {
  it("adds explicit additive consent schema without replacing existing consent history", () => {
    expect(schema).toContain("privacyConsents");
    expect(schema).toContain("prescription_storage");
    expect(schema).toContain("invoice_claim_bundle");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `privacy_consents`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `staff_acknowledgements`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `staff_device_sessions`");
  });

  it("can grant and revoke consent while preserving an audit trail", async () => {
    const store = new InMemoryPrivacyConsentStore();
    await grantConsent({ userId: 7, phone: "+919999999999" }, "refill_reminder", { changedBy: 7, source: "app" }, store);
    expect(await getConsentStatus({ userId: 7 }, "refill_reminder", store)).toBe("granted");

    await revokeConsent({ userId: 7, phone: "+919999999999" }, "refill_reminder", { changedBy: 7, source: "app" }, store);
    expect(await getConsentStatus({ userId: 7 }, "refill_reminder", store)).toBe("revoked");

    const trail = await getConsentAuditTrail({ userId: 7 }, "refill_reminder", store);
    expect(trail).toHaveLength(2);
    expect(store.audits.map((audit) => audit.action)).toEqual(["privacy.consent.granted", "privacy.consent.revoked"]);
    expect(JSON.stringify(store.audits)).not.toContain("9999999999");
  });

  it("blocks marketing, refill, dosage, and family profile access unless explicit consent is granted", async () => {
    const store = new InMemoryPrivacyConsentStore();
    expect(isReminderOrMarketingAllowed(await getConsentStatus({ userId: 8 }, "whatsapp_marketing", store), "whatsapp_marketing")).toBe(false);
    expect(isReminderOrMarketingAllowed(await getConsentStatus({ userId: 8 }, "dosage_reminder", store), "dosage_reminder")).toBe(false);
    await expect(assertConsentForSensitiveAction({ userId: 8 }, "refill_reminder", store)).rejects.toBeInstanceOf(ConsentRequiredError);
    await expect(assertFamilyProfileAccessConsent({ userId: 8 }, store)).rejects.toThrow(/family_profile_access/);

    await grantConsent({ userId: 8 }, "family_profile_access", { source: "staff", changedBy: 44 }, store);
    await expect(assertFamilyProfileAccessConsent({ userId: 8 }, store)).resolves.toEqual({ consentType: "family_profile_access", status: "granted" });
  });

  it("keeps transactional notification treatment explicit and separate from reminders or marketing", () => {
    expect(isTransactionalNotificationAllowed("pending", "whatsapp_transactional")).toBe(true);
    expect(isTransactionalNotificationAllowed("revoked", "sms_transactional")).toBe(false);
    expect(isReminderOrMarketingAllowed("pending", "refill_reminder")).toBe(false);
    expect(isReminderOrMarketingAllowed("revoked", "sms_marketing")).toBe(false);
    expect(isReminderOrMarketingAllowed("granted", "dosage_reminder")).toBe(true);
  });

  it("redacts OTPs, tokens, payment signatures, cookies, base64 files, prescription images, and PII from logs", () => {
    const redacted = redactSensitiveForLogs({
      phone: "+919876543210",
      email: "patient@example.com",
      otp: "123456",
      token: "secret-token",
      razorpay_signature: "provider-secret-value",
      cookie: "sid=secret",
      prescriptionImage: "data:image/png;base64," + "A".repeat(120),
      nested: { authorization: "Bearer abc.def.ghi", note: "ok" },
    });

    const text = JSON.stringify(redacted);
    expect(text).not.toContain("123456");
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("provider-secret-value");
    expect(text).not.toContain("abc.def.ghi");
    expect(text).not.toContain("9876543210");
    expect(text).not.toContain("patient@example.com");
    expect(text).toContain("[REMOVED_SENSITIVE_PAYLOAD]");
    expect(maskPhone("+919876543210")).toBe("+********3210");
    expect(maskEmail("patient@example.com")).toBe("p***@example.com");
  });

  it("builds prescription, invoice, H1, export, and denied access audit metadata without raw sensitive payloads", () => {
    const event = buildSensitiveAccessAuditEvent({
      accessType: "h1_record",
      actorId: 12,
      actorRole: "pharmacist",
      entityType: "h1_register",
      entityId: 99,
      purpose: "statutory_review",
      decision: "allowed",
      metadata: { phone: "+919999999999", diagnosis: "sensitive condition", token: "secret" },
    });
    expect(event.action).toBe("privacy.h1_record.allowed");
    expect(JSON.stringify(event)).not.toContain("9999999999");
    expect(JSON.stringify(event)).not.toContain("sensitive condition");
    expect(JSON.stringify(event)).not.toContain("secret");
  });
});
