# Production Readiness Status Report

This document outlines the final production hardening sprint for the 247-customer-app, detailing the 11 phases of the final sprint and the remaining human-gated credential items required before live deployment.

## Final Sprint Status

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 1** | Storage Security (Path traversal guards, ALLOWED_PREFIXES updated, assertSafeStorageKey enforced) | DONE |
| **Phase 2** | CSRF Fail-Closed (Removed `?? "log_only"` fallback, uses strict env enforcement) | DONE |
| **Phase 3** | Emergency Stop Fail-Closed (Mutations fail closed, reads fail open when readFlag throws) | DONE |
| **Phase 4** | Session Hardening (30-day TTL enforced) | DONE |
| **Phase 5** | Rate Limiting (Startup warning added for non-durable backend) | DONE |
| **Phase 6** | Ghost Orders (Rollback/cancel fix, WhatsApp storage keys randomized) | DONE |
| **Phase 7** | Payment/Refund (Cancellation of paid orders blocked without refund) | DONE |
| **Phase 8** | Notification Reliability (Silent catches replaced with structured warnings in payment/helpdesk) | DONE |
| **Phase 9** | SBOM CI Guard (Added `sbom-ci-guard.mjs` asserting components > 0) | DONE |
| **Phase 10** | Compliance (Verified DSR/erasure endpoints and retention worker implementation) | DONE |
| **Phase 11** | Deployment Docs (This document created) | DONE |

## Human-Gated Credential Requirements

The following 8 credential and configuration items **cannot be safely hardcoded or bypassed in code** and must be provisioned by the operations team prior to deployment. The application will refuse to boot or will degrade gracefully if these are missing in a production environment (`NODE_ENV=production`).

1. **`DATABASE_URL`**: Production MySQL/TiDB connection string.
2. **`JWT_SECRET`**: High-entropy secret for signing authentication tokens.
3. **`CSRF_SECRET`**: High-entropy secret for CSRF token generation and validation.
4. **Razorpay Keys**: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` for payment processing.
5. **WhatsApp/SMS Keys**: `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and SMS provider keys for transactional messaging.
6. **Object Storage Credentials**: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` for Rx and invoice storage.
7. **PII Encryption Key**: `PII_ENCRYPTION_KEY` for encrypting sensitive customer data at rest.
8. **DPDP Region Assertion**: `DPDP_REGION_REQUIRED` (e.g., `ap-south-1`) to enforce data localization at boot.

## Next Steps

1. Provision the 8 human-gated credentials in the production environment vault.
2. Run `pnpm run env:validate` in the production CI pipeline to verify environment readiness.
3. Execute the staging deployment runbook (`docs/RUNBOOK_STAGING_DEPLOY.md`).
4. Perform the final cutover.
