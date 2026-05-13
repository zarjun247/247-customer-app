# LEGAL REVIEW PACK — SM-B DPDP Compliance

**Prepared for:** Legal / DPO Review  
**Branch:** roadmap/sm-b-security-dpdp  
**Date:** 2026-05-12  
**Reviewers required:** Legal Counsel, Data Protection Officer, CISO

---

## 1. Executive Summary

This pack documents the technical implementation of India Digital Personal Data Protection (DPDP) Act 2023 compliance measures introduced in SM-B. It is intended to support legal review of data handling practices, consent mechanisms, and Data Subject Rights (DSR) workflows before the feature ships to production.

**Headline changes:**
- CSP enforcement mode changed from report-only to enforce (security hardening)
- CSRF double-submit cookie protection added across all state-mutating endpoints
- India region data residency assertion at boot (opt-in via `DPDP_REGION_REQUIRED`)
- Full DSR pipeline: access, export, rectification, erasure (7-day window), consent log, grievance
- Consent notice versioning with SHA-256 integrity hashes
- Family consent enforcement for Schedule H/H1/X dispensing to minors
- PII encryption key versioning (non-breaking, ciphertext carries key version)
- Retention worker (OFF by default; irreversible — requires explicit opt-in)
- Breach notification template for DPDP Section 8 + CERT-In 72-hour requirement

---

## 2. DPDP Act 2023 Coverage Matrix

| Section | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| Section 5 | Notice at or before collection | `consentNoticeRegistry` — versioned notices per `NoticeKind` | ✅ |
| Section 6 | Free, specific, informed, unambiguous consent | `privacy_consents` table; `recordUserAcceptance()` | ✅ |
| Section 7 | Lawful processing grounds | Consent-gated by `consentRouter` (existing) | ✅ |
| Section 11(1) | Right to access | `dsr.access` mutation; synchronous profile assembly | ✅ |
| Section 11(2) | Right to correction | `dsr.rectification` mutation; admin approval workflow | ✅ |
| Section 11(3) | Right to erasure | `dsr.erasure` + `dsr.confirmErasure`; 7-day confirmation window | ✅ |
| Section 11(4) | Right to grievance redressal | `dsr.grievance` mutation; forwarded to DPO | ✅ |
| Section 11(5) | Right to nominate | `dsr.nominee.{add,list,revoke}` mutations; `dsr_nominees` table (migration 0074); admin queue via `dsrAdminRouter.listNominees`; customer UI in `dsrRouter`; PII-encrypted contact fields | ✅ |
| Section 8(6) | Breach notification within 72h | `breachNotificationService.generateBreachNotification()` | ✅ (template) |
| Section 13 | Data localisation for sensitive data | Region assertion via `DPDP_REGION_REQUIRED` | ✅ (opt-in) |

---

## 3. Consent Mechanism

### 3.1 Consent Notice Versions

Notices are stored in `consent_notice_versions` table (migration 0058). Each version has:
- SHA-256 hash of the notice text (integrity anchor for legal evidence)
- `effective_from` / `effective_until` date range
- `published_by_user_id` (staff accountability)
- `language` field (en by default; add regional languages via additional rows)

**Notice kinds supported:**
- `privacy_policy` — General privacy policy
- `terms` — Terms of service
- `rx_data_use` — Prescription data handling
- `marketing` — Marketing communications (separate granular consent)

### 3.2 Consent Records

User acceptance is recorded in `privacy_consents` (existing table) via `recordUserAcceptance()`. Each record captures:
- `userId`, `consentType`, `status`, `source`, `grantedAt`
- `auditRef` links to the specific notice version accepted

### 3.3 Withdrawal

Consent can be withdrawn by:
1. Customer via `PrivacySettings` → consent management (UI in `/privacy`)
2. DSR erasure request (full data deletion, irreversible)
3. Admin revocation via `AdminConsentRegistry`

---

## 4. Data Subject Request (DSR) Workflow

### 4.1 Request Kinds and SLAs

| Kind | Trigger | Response Method | SLA |
|------|---------|-----------------|-----|
| `access` | `POST /api/trpc/dsr.access` | Synchronous JSON response | Immediate |
| `export` | `POST /api/trpc/dsr.export` | Base64-encoded JSON/CSV bundle | Immediate |
| `rectification` | `POST /api/trpc/dsr.rectification` | Admin review queue | 30 days |
| `erasure` | `POST /api/trpc/dsr.erasure` + confirmation email | 7-day confirmation → retention worker | 30 days |
| `consent_log` | `GET /api/trpc/dsr.consentLog` | Synchronous consent history | Immediate |
| `grievance` | `POST /api/trpc/dsr.grievance` | DPO notification | 30 days |

### 4.2 Erasure Safety Controls

The erasure flow has two mandatory gates:

1. **7-day confirmation window:** Customer receives a confirmation token. No data is deleted until `dsr.confirmErasure` is called with the correct token and the request is in `pending` status and within 7 days.

2. **Retention worker opt-in:** The actual PII anonymisation is performed by `retentionWorker.runRetentionTick()` which is **OFF by default**. It only runs when `RETENTION_WORKER_ENABLED=true` is set in environment. This prevents accidental erasure in staging environments.

**What is anonymised on erasure:**
- `users.name` → `[ERASED]`
- `users.email` → `erased-{id}@erased.invalid`
- `users.phone` → `00000000000`
- `prescriptions.patientName` → `[ERASED]`
- `prescriptions.patientPhone` → `[ERASED]`
- `prescriptions.patientAddress` → `[ERASED]`
- `orders.deliveryAddress` → `[ERASED]`

**What is NOT erased (statutory retention):**
- Invoice/billing records (GST Act: 8 years)
- Prescription records required by Drugs & Cosmetics Act
- Audit log entries (integrity of audit chain)

> **Legal action required:** Confirm the statutory retention periods and whether our current erasure scope aligns with Section 11(3) read with Schedule I of the DPDP Act. Update `DPDP_OPERATIONS.md` with the confirmed retention schedule.

### 4.3 Admin DSR Queue

Admin staff access the DSR queue at `/admin/dsr-queue`. Actions available:
- Filter by status (`pending`, `confirmed`, `completed`, `rejected`) and kind
- Approve rectification requests (admin applies data corrections)
- Reject any request with documented reason
- View full request/response payloads

All admin actions are audit-logged via `logAudit()` with actor ID and reason.

---

## 5. Family Consent (Minor Protection)

### 5.1 Regulatory Basis

Schedule H, H1, and X drugs require a prescription. Under the Drugs & Cosmetics Act and DPDP Act considerations for children, we additionally require:
- Explicit guardian consent before dispensing Schedule H/H1/X to customers under 18
- Consent recorded with guardian name, relationship, ID proof type, and scope

### 5.2 Technical Implementation

`assertConsentForScheduleSale()` is called in `salesRouter.addLine()` for every Schedule H/H1/X line item. It:
1. Looks up the customer's date of birth (DOB)
2. If DOB absent → treats as adult (no gate — conservative approach pending DOB collection)
3. If under-18 → requires active `family_consent` record covering the required scope
4. Throws `FORBIDDEN` if no consent or consent scope mismatch

**Consent scopes:**
- `rx_h1` — Schedule H1 and X (highest restriction)
- `rx_h` — Schedule H
- `general` — Covers all schedules

### 5.3 Consent Revocation

Admin can revoke family consent via `/admin/family-consent`. Revocation is immediate and prevents further sales to the minor for that consent scope until a new consent is recorded.

> **Legal action required:** Confirm minimum guardian documentation requirements under Indian law. Currently storing ID proof kind (aadhaar/voter_id/passport) and last 4 digits only — confirm if full ID copy is required for Schedule X drugs.

---

## 6. Breach Notification

### 6.1 Template

`breachNotificationService.generateBreachNotification()` produces a structured notification for:
- **CERT-In** (24/7 mandatory reporting within 6h under IT Act, but DPDP Section 8 requires 72h)
- **PDPB/MeitY** (Data Protection Board notification)
- **DPO** (internal escalation)

### 6.2 Required Recipients

```
cert-in@cert-in.org.in
pdpb@meity.gov.in
{DPO_EMAIL from ENV}
```

### 6.3 Timeline

Deadline = detected_at + 72 hours (DPDP Section 8(6))

> **Legal action required:** Review the breach notification template in `server/services/breachNotificationService.ts`. Confirm that the categories of affected data, the risk description, and the remediation steps match legal requirements. The template is currently generic and must be customised per-incident.

---

## 7. PII Encryption

### 7.1 Key Versioning

All PII ciphertext is prefixed with `v1:<keyVersion>:` where `keyVersion` is read from `VAULT_ENCRYPTION_KEY_VERSION` environment variable (default `1`). This enables key rotation without re-encrypting all existing data:

1. Bump `VAULT_ENCRYPTION_KEY_VERSION` in environment
2. New writes use the new key
3. Old ciphertext retains its version prefix and can be decrypted with the old key
4. Background re-encryption (if required) can be scheduled via a maintenance window

### 7.2 Passthrough Mode

When `PII_ENCRYPTION_MASTER_KEY` is not set, the system runs in passthrough mode (data stored plaintext). This is acceptable in development/test but **MUST NOT** be used in production.

> **Legal action required:** Confirm AES-256-GCM key management procedure (key storage in AWS KMS or equivalent). Key rotation schedule should be documented in the security policy.

---

## 8. CSRF Protection

### 8.1 Double-Submit Cookie Pattern

CSRF protection uses the `csrf-csrf` library (double-submit cookie pattern):
- Cookie: `__Host-csrf` (HttpOnly, SameSite=Strict, Secure in production)
- Token TTL: `CSRF_TOKEN_TTL_HOURS` (default: 24h)
- Session binding: tied to `app_session` cookie value (or IP as fallback)

### 8.2 Exempt Paths

The following paths bypass CSRF validation (they use their own verification):
- `/api/webhooks/` — Razorpay HMAC, WhatsApp webhook token
- `/api/worker/` — Cron secret / bearer token
- `/health`, `/metrics` — Infrastructure endpoints

### 8.3 Production Requirement

`CSRF_SECRET` must be set to a cryptographically strong random value in production. A `CRITICAL` log warning is emitted at boot if this is not configured.

---

## 9. Data Residency (DPDP Section 13)

### 9.1 India Region Assertion

When `DPDP_REGION_REQUIRED=true`:
- S3 bucket region must be `ap-south-1` or `ap-south-2`
- RDS endpoint must hostname-contain `ap-south-1` or `ap-south-2`

Boot fails with exit code 1 if the assertion fails and `DPDP_REGION_REQUIRED` is set.

### 9.2 Default Off

Region assertion is **opt-in** to avoid breaking existing deployments. It must be enabled explicitly in the production deployment configuration before going live with DPDP compliance.

> **Legal action required:** Confirm whether cross-border data transfer is required for any third-party processors (WhatsApp, Razorpay, OCR provider). If so, document the Standard Contractual Clauses (SCCs) or DPA agreements under DPDP Schedule I.

---

## 10. Open Items for Legal Sign-Off

| # | Item | Owner | Target |
|---|------|-------|--------|
| L-1 | Statutory retention periods for prescription records | Legal | Before erasure worker enabled |
| L-2 | Guardian documentation requirements for Schedule X | Legal + Pharmacist | Before family consent goes live |
| L-3 | Breach notification template review | DPO | Before production |
| L-4 | Key management SOP (AWS KMS or equivalent) | CISO | Before production |
| L-5 | Third-party DPA / SCC for WhatsApp, Razorpay | Legal | Before production |
| L-6 | Right to nominate implementation (Section 11(5)) | Engineering | Done — SM-LM Phase 11 |
| L-7 | DPDP_REGION_REQUIRED enforcement in prod config | DevOps | Before go-live |
| L-8 | Review marketing consent flow (separate from rx_data_use) | Legal + Product | Before marketing feature ships |

---

## 11. Audit Trail

All DSR operations, family consent changes, and data erasure events are recorded via `logAudit()` which appends to the `audit_logs` table with a cryptographic hash chain (SHA-256 of `previousHash + current_entry`). This provides tamper-evident audit records for regulatory inspection.

Audit chain verification available via `/admin/security` → Audit Chain tab.

---

*This document is confidential. Do not distribute outside the legal/engineering review group.*
