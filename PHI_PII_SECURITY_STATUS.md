# PHI / PII / Secret Security Status

**Status date:** 2026-05-10

## Implemented protections

- Structured logs use `redactObject`, `redactString`, `safeError`, and `serializeSafeLog` to remove secrets, bearer tokens, database URLs, emails, phones, long base64 blobs, medical keys, and stack traces from production-safe paths.
- Worker/provider payload persistence now redacts secret keys, webhook signatures, raw payloads, prescription blobs, patient/customer names, phones, emails, addresses, doctors, diagnoses, symptoms, and medical notes.
- Audit logging preserves actor attribution while redacting before/after/metadata and reason text before writing audit events.
- Health/readiness endpoints remain minimal publicly; detailed health, metrics, dashboards, and observability provider summaries remain staff/admin gated.

## Explicit non-claims

- This repository does not claim encryption-at-rest proof unless the deployed database/object-storage provider is configured and verified externally.
- Redaction is defense-in-depth, not a substitute for RBAC, staff training, restricted database access, or statutory retention controls.

## Evidence tests

- `server/phi-pii-redaction-seal.guard.test.ts` proves log, audit, worker/provider payload, and error redaction.
- Existing health and deployment readiness tests prove public runtime endpoints do not leak secrets.
