# OPEN_BLOCKERS

Updated: 2026-05-10.

## Production readiness blockers

1. **Deployment evidence missing**
   - No production deployment proof is claimed by the codebase.
   - Need CI/CD logs, release artifact IDs, runtime URL checks, and rollback plan evidence.
2. **Hosted CI observation still required**
   - Run and archive the target branch checks on hosted CI after merge/rebase.
3. **Backup/restore drill not proven**
   - Dry-run scripts and runbook exist, but measured staging restore evidence is still required.
4. **Provider verification still required**
   - Payment, WhatsApp/SMS, maps, OCR, printer, storage, and Tally integrations must be verified in staging/sandbox.
   - Unconfigured/demo/skipped states must never be reported as production success.
5. **Operational ownership**
   - Assign owners for dead-letter queues, incident response, degraded mode, backup/restore, provider outages, and store isolation anomalies.
6. **Multi-store runtime data proof**
   - Run new staff/admin-gated aggregate checks against staging/production-like data and record actual counts.

## Current readiness score

**72/100** until deployment evidence, restore evidence, provider verification, and owner sign-off are complete.

## Data backfill blockers preserved from main truth

- Supplier invoice hard uniqueness still needs a business-review backfill before adding a destructive-risk unique constraint. The target key is supplier + store + invoice number.

---

## 2026-05-10 Healthcare governance seal additions

- AI governance boundary is explicit and tested.
- PHI/PII/secret redaction is strengthened across logs, audit, errors, and worker/provider payloads.
- Observability and detailed health remain staff/admin gated.
- Remaining regulated deployment blockers: real provider credentials, backup/restore drills, pharmacist SOP sign-off, named staff access, legal/compliance review, and launch incident monitoring.
- Supplier invoice hard uniqueness remains blocked until **supplier + store + invoice number** duplicates complete **business-review backfill** and approval for a non-destructive constraint migration.
