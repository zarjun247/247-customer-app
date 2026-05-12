# DPDP Operations Runbook

**Applies to:** 24/7 Customer App  
**Regulation:** India Digital Personal Data Protection (DPDP) Act 2023  
**Last updated:** 2026-05-12

---

## 1. Environment Variables

All DPDP-related features are opt-in via environment variables. None are required in development.

| Variable | Default | Purpose |
|----------|---------|---------|
| `CSRF_SECRET` | `""` (dev placeholder) | Secret for CSRF double-submit cookie. **Required in production.** |
| `CSRF_TOKEN_TTL_HOURS` | `24` | CSRF token lifetime in hours |
| `DPDP_ENFORCEMENT_MODE` | `""` (permissive) | Future flag for strict enforcement mode |
| `DPDP_REGION_REQUIRED` | `""` (off) | Set to any non-empty value to enforce India region at boot |
| `VAULT_ENCRYPTION_KEY_VERSION` | `1` | Active PII encryption key version |
| `RETENTION_WORKER_ENABLED` | `""` (off) | Set to `true` to enable retention/erasure worker |
| `DPO_EMAIL` | `""` | Data Protection Officer email for breach notifications |

---

## 2. Pre-Production Checklist

Before enabling DPDP features in production, complete this checklist:

- [ ] `CSRF_SECRET` set to a 64-byte random hex string (generate: `openssl rand -hex 64`)
- [ ] `PII_ENCRYPTION_MASTER_KEY` set in AWS Secrets Manager (or equivalent)
- [ ] `DPDP_REGION_REQUIRED=true` set in production environment
- [ ] S3 bucket confirmed in `ap-south-1` or `ap-south-2`
- [ ] RDS instance confirmed in `ap-south-1` or `ap-south-2`
- [ ] `DPO_EMAIL` set to the designated DPO email address
- [ ] Legal sign-off on LEGAL_REVIEW_PACK.md items L-1 through L-8
- [ ] Privacy Policy notice published via Admin → Consent Registry
- [ ] Terms of Service notice published via Admin → Consent Registry
- [ ] Rx Data Use notice published via Admin → Consent Registry

---

## 3. DSR Operations

### 3.1 Monitoring the DSR Queue

Navigate to `/admin/dsr-queue` to view all Data Subject Requests.

Filter by status to find items needing action:
- `pending` — New requests awaiting processing or admin review
- `confirmed` — Erasure requests confirmed by customer (awaiting retention worker)
- `processing` — Being processed
- `completed` — Done
- `rejected` — Rejected by admin or expired

**SLA:** All DSR requests must be responded to within **30 calendar days** of receipt.

### 3.2 Processing a Rectification Request

1. Customer submits rectification via `/privacy` → Correct My Data
2. Request appears in DSR Queue with kind=`rectification`, status=`pending`
3. Admin reviews the `requestPayload` (contains field names, old/new values, reason)
4. If approved: click **Approve** → admin manually updates the customer's data in the relevant table
5. If rejected: click **Reject** and enter the rejection reason
6. Customer notification is the responsibility of the DPO (not automated in MVP)

### 3.3 Processing an Erasure Request

Erasure has a 7-day confirmation safety window:

1. Customer submits via `/privacy` → Delete My Data
2. System creates request with status=`pending` and sends confirmation token to customer
3. Customer clicks email confirmation link → calls `dsr.confirmErasure` → status becomes `confirmed`
4. Retention worker processes `confirmed` requests in batches when next run

**To run the retention worker manually (one-time):**
```bash
curl -X POST https://your-domain.com/api/worker/run \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

The worker only runs if `RETENTION_WORKER_ENABLED=true`.

### 3.4 Handling a Grievance

1. Customer submits via `/privacy` → File Grievance
2. Request appears in DSR Queue with kind=`grievance`
3. DPO receives notification at `DPO_EMAIL`
4. DPO investigates and responds to the customer directly
5. Admin marks request as `completed` with resolution notes

---

## 4. Consent Notice Registry

### 4.1 Publishing a New Notice Version

Use the admin API or contact engineering to insert a new notice version. The `publishNotice()` function in `consentNoticeRegistry.ts` handles the insert and SHA-256 hashing.

Required fields:
- `noticeKind`: `privacy_policy` | `terms` | `rx_data_use` | `marketing`
- `version`: SemVer string (e.g., `"1.2.0"`)
- `effectiveFrom`: Date the notice takes effect
- `contentText`: Full notice text (plain text or markdown)
- `publishedByUserId`: ID of the staff member publishing
- `language`: ISO 639-1 code (default `"en"`)

To expire an old version, set `effectiveUntil` on the previous record.

### 4.2 Viewing Active Notices

Navigate to `/admin/consent-registry` and select the notice kind to view active and historical versions with their SHA-256 content hashes.

---

## 5. Family Consent

### 5.1 Recording Family Consent

When dispensing Schedule H/H1/X to a minor (under-18 customer), the pharmacist must record family consent:

1. Collect guardian's name, relationship (parent/legal_guardian), and ID proof
2. Navigate to `/admin/family-consent`
3. Use the `recordFamilyConsent()` API or contact engineering to insert the consent record
4. The consent is effective immediately after recording

**Required information:**
- Minor's customer ID
- Guardian full name
- Relationship: `parent` or `legal_guardian`
- ID proof kind: `aadhaar` | `voter_id` | `passport`
- Last 4 digits of ID proof number
- Consent scope: `rx_h1` (for H1/X), `rx_h` (for H), or `general` (covers all)
- Consent document storage path (if physical form scanned)

### 5.2 Revoking Family Consent

Navigate to `/admin/family-consent` and click **Revoke** next to the active consent record. Enter the revocation reason. Revocation is immediate and prevents further Schedule drug sales to the minor until new consent is recorded.

---

## 6. Retention Worker

### 6.1 Overview

The retention worker processes confirmed erasure requests, anonymising PII across multiple tables. It is **disabled by default** and must be explicitly enabled.

**Enable:** Set `RETENTION_WORKER_ENABLED=true`

**Trigger:** POST to `/api/worker/run` with the cron secret

### 6.2 What Gets Anonymised

Per confirmed erasure request:
- `users.name` → `[ERASED]`
- `users.email` → `erased-{id}@erased.invalid`
- `users.phone` → `00000000000`
- `prescriptions.patientName` → `[ERASED]`
- `prescriptions.patientPhone` → `[ERASED]`
- `prescriptions.patientAddress` → `[ERASED]`
- `orders.deliveryAddress` → `[ERASED]`

### 6.3 What Is Retained (Statutory)

The following are **not** anonymised (statutory retention):
- Invoice and financial records (GST Act: 8 years)
- Prescription IDs and approval status (Drugs & Cosmetics Act)
- Audit log entries (regulatory requirement)
- Order IDs and status history

> **WARNING:** Erasure is irreversible. Test in staging with a real confirmation token before enabling in production.

---

## 7. Breach Notification

### 7.1 Triggering a Breach Notification

In the event of a confirmed personal data breach:

1. Assess the scope: categories of data affected, estimated number of data principals
2. Call `generateBreachNotification()` with the incident details:
   - `incidentType`: e.g., `"Unauthorised database access"` 
   - `affectedDataCategories`: e.g., `["name", "phone", "email", "prescription_images"]`
   - `estimatedAffectedPersons`: number
   - `detectedAt`: ISO timestamp of when the breach was detected
   - `description`: Free text description of the incident
3. Send the generated notification to the three recipients within 72 hours

### 7.2 Notification Recipients

- **CERT-In:** cert-in@cert-in.org.in (mandatory under IT Act)
- **PDPB/MeitY:** pdpb@meity.gov.in (DPDP Board)
- **DPO:** configured via `DPO_EMAIL` environment variable

### 7.3 72-Hour Deadline

The 72-hour clock starts from `detectedAt`. The `generateBreachNotification()` function includes the deadline timestamp in the notification.

---

## 8. Region Assertion

### 8.1 Enabling Region Check

Set `DPDP_REGION_REQUIRED=true` in the production environment to enforce data residency at boot.

The server will:
1. Check that the S3 bucket is in `ap-south-1` or `ap-south-2` (AWS SDK GetBucketLocation)
2. Check that the RDS endpoint hostname contains `ap-south-1` or `ap-south-2`
3. Fail to start (`process.exit(1)`) if either check fails

### 8.2 Supported Regions

| Region Code | Location |
|-------------|----------|
| `ap-south-1` | Mumbai |
| `ap-south-2` | Hyderabad |

### 8.3 Troubleshooting Boot Failure

If the server fails to start with "India region assertion failed":
1. Check `DPDP_REGION_REQUIRED` — if set in error, remove it
2. If intentionally set, verify S3 bucket region in AWS Console
3. Verify RDS endpoint hostname contains the expected region code
4. Check logs: `regionAssertion: bucket region mismatch` or similar

---

## 9. Monitoring and Alerts

### 9.1 DSR SLA Monitoring

Query the `dsr_requests` table for requests approaching the 30-day SLA:

```sql
SELECT id, request_kind, request_status, created_at,
  DATEDIFF(NOW(), created_at) AS age_days
FROM dsr_requests
WHERE request_status IN ('pending', 'confirmed')
  AND DATEDIFF(NOW(), created_at) >= 25
ORDER BY age_days DESC;
```

### 9.2 CSRF Boot Warning

Monitor application logs for:
```
CRITICAL: CSRF_SECRET is not set. Using insecure development default in production.
```
This is a CRITICAL severity log. Alert immediately if seen in production.

### 9.3 Retention Worker Metrics

After each retention worker run, check logs for:
```
retentionWorker: tick completed
```
with `processed` count and any `error` fields on individual request lines.

---

## 10. Key Rotation Procedure

### 10.1 PII Encryption Key Rotation

1. Generate new key material in AWS KMS / Secrets Manager
2. Bump `VAULT_ENCRYPTION_KEY_VERSION` (e.g., 1 → 2)
3. New PII writes will use key version 2
4. Existing ciphertext (prefixed `v1:1:...`) is still decryptable with key version 1
5. Background re-encryption task (not implemented in MVP): schedule a maintenance window to re-encrypt all existing PII under the new key version

### 10.2 CSRF Secret Rotation

1. Generate new secret: `openssl rand -hex 64`
2. Update `CSRF_SECRET` in environment
3. Rolling restart of app instances
4. Note: existing CSRF tokens become invalid after rotation; users will need to refresh once

---

*Maintained by Engineering. Legal changes require DPO sign-off.*
