# Privacy / Consent / Staff Session Security Status

> Status: foundational hardening only. This document does not claim legal compliance is complete; counsel review is required before external compliance claims.

## Current model inspected

- Auth/session: `users` carries app/staff roles and `lastSignedIn`; WhatsApp has `whatsapp_sessions`. No full durable staff web-session table was present before this work.
- Prescription vault: existing vault consent fields and `prescription_access_log` remain unchanged; vault helper `logPrescriptionVaultAccess` continues to own prescription vault access logging.
- Notifications: `notification_preferences` supports per-channel enablement and sensitive-content suppression for unsafe channels. New consent helpers distinguish transactional from marketing/reminder consent.
- Staff/admin roles: staff roles are represented in `users.role`, `staff_assignments`, and `staff_master`; no broad auth redesign was made.
- Audit/redaction: existing `audit_logs` and `logAudit` remain in place. New privacy helpers redact sensitive payloads before writing new privacy/staff audit metadata.

## Consent model/service added

- Added additive `privacy_consents` table in `drizzle/0043_privacy_staff_session.sql` and `drizzle/schema.ts`.
- Added `server/services/privacyConsent.ts` helpers:
  - `grantConsent`
  - `revokeConsent`
  - `getConsentStatus`
  - `assertConsentForSensitiveAction`
  - `getConsentAuditTrail`
  - `assertFamilyProfileAccessConsent`
- Existing `user_consents` was not removed or rewritten.

## Notification consent behavior

- Marketing, refill reminders, and dosage reminders require explicit `granted` state via helper policy.
- Transactional WhatsApp/SMS consent is intentionally separated from marketing/reminder consent.
- Transactional pending state is treated as eligible by helper policy so operational messages can be handled separately from marketing, subject to future product/legal decisions.

## Sensitive data redaction behavior

- Added `server/services/sensitiveDataPolicy.ts`.
- Redacts/removes from new helper logs:
  - prescription image/base64/blob/file payloads
  - diagnosis and doctor notes
  - H1 register payloads
  - raw phone/email/address values
  - OTPs, passwords, secrets, tokens, cookies, authorization headers
  - payment signatures/provider tokens

## Access audit behavior

- Existing prescription vault audit remains authoritative for vault access.
- Added central policy helper `buildSensitiveAccessAuditEvent` for prescription image, invoice, H1 record, sensitive export, and denied access audit metadata.
- Helper output is metadata-only and redacted; it must not include raw medical/customer blobs.

## Staff acknowledgement behavior

- Added additive `staff_acknowledgements` table.
- Added `recordStaffAcknowledgement` and `hasActiveStaffAcknowledgement` helpers.
- Acknowledgement types covered:
  - patient data confidentiality
  - prescription handling
  - H1 register handling
  - payment data handling
  - no shared accounts
- Enforcement is not globally blocking staff workflows yet; rollout should start in targeted staff/admin screens after UX and operations review.

## Staff session/device behavior

- Added additive `staff_device_sessions` table.
- Added helpers:
  - `recordStaffDeviceSession`
  - `listActiveStaffSessions`
  - `revokeStaffSession`
- Policy constants document 15-minute idle timeout, terminal lock requirement, cashier PIN expectation for sensitive actions, no shared super-admin accounts, and role-switch prevention.
- Durable session enforcement remains P1 because current auth/session flow was not redesigned.

## Remaining risks

- P0: none introduced by this additive foundation.
- P1: wire consent helper checks into reminder schedulers and marketing send paths before enabling campaigns at scale.
- P1: integrate staff durable session recording/revoke with the active auth/session middleware.
- P1: add targeted staff acknowledgement gates to high-risk staff pages/actions after operations sign-off.
- P2: add admin UI for consent trail, staff acknowledgement reporting, and active staff session review.

## Validation results

- `pnpm install` — run during PR validation.
- `pnpm run check` — run during PR validation.
- `pnpm test -- --runInBand` — run during PR validation.
- `pnpm run build` — run during PR validation.
- `git diff --check` — run during PR validation.

## Files changed

- `server/services/privacyConsent.ts`
- `server/services/sensitiveDataPolicy.ts`
- `server/services/staffSessionSecurity.ts`
- `server/privacy-consent.test.ts`
- `server/staff-session-security.test.ts`
- `drizzle/0043_privacy_staff_session.sql`
- `drizzle/schema.ts`
- `PRIVACY_STAFF_SECURITY_STATUS.md`
- `DATA_PRIVACY_COMPLIANCE_PACK.md`
- `STAFF_SESSION_SECURITY_STATUS.md`
