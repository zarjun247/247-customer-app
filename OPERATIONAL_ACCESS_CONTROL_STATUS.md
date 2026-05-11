# Operational Access Control Status

**Status date:** 2026-05-10

## Current control posture

- Public liveness/readiness are intentionally minimal.
- Detailed health, metrics, dashboards, and observability routes are gated by staff/admin authentication.
- Pharmacist/compliance gates remain mandatory for regulated sale confirmation, H/H1/X release, substitution governance, and H1 register creation.
- Override-style activity is expected to carry actor attribution, reason, entity reference, source channel, and audit trail.

## Added hardening

- AI and OCR worker execution is explicitly non-mutating and cannot complete with regulated release/finalization output.
- Audit writes now sanitize PHI/PII/secrets while retaining actor, role, channel, session/device context where available.
- Worker dead-letter/replay/cancel paths preserve actor and reason with sanitized audit entries.

## Operational requirements before go-live

- Enforce named staff accounts; no shared admin users.
- Require written override reason for stock, payment, prescription, delivery, H1, and reconciliation exceptions.
- Review suspicious access from observability/audit dashboards daily during launch.
- Keep store-scoped access tests in CI before each deployment.
