OPEN BLOCKERS

This file lists current unresolved production blockers and their severity.

P0
---
- DB-backed concurrency proof gaps
  Impact: Potential lost reservations / invoice collisions in high concurrency
  Affected systems: reservationService, purchase/sale commit flows
  Production risk: High (data-loss / double-reservation)
  Mitigation path: Enabled CI workflow for MySQL concurrency proof (.github/workflows/concurrency-proof.yml). Run the workflow to claim DB-backed concurrency proof; implement transactional fixes discovered by the harness.
  Owner status: Assigned - sprint/production-readiness-integration
  State: Unresolved

- Production backup/restore proof gaps
  Impact: No verified restore from backup drills
  Affected systems: DB, S3 evidence
  Mitigation path: Run restore-drill scripts, validate integrity
  State: Unresolved

P1
---
- Invoice collision testing
  Impact: Incorrect ledger states or duplicate receipts
  Affected systems: purchase commit, stock ledger
  Mitigation path: Add concurrency tests, lockless proofs, idempotency guards
  State: Unresolved

- Reservation race testing
  Impact: Over-reservation leading to customer-impact
  Affected systems: reservationService, canonical availability
  Mitigation path: Implement DB-backed concurrency tests and fix hazards
  State: Unresolved

- Observability gaps (alerts, SLIs)
  Impact: Reduced detection/response time
  Mitigation path: Instrument key paths, add dashboards and alerts
  State: Unresolved

- Runtime provider placeholders (provider_unconfigured / fake success markers)
  Impact: Runtime code or configuration may contain placeholder provider markers that can be misinterpreted as successful provider responses
  Affected systems: paymentGateway, notificationService, jobQueue, tallyExport, workerRuntime, payment Router
  Production risk: Medium-High (false positive success claims, hidden failures)
  Mitigation path: Replace provider_unconfigured markers with explicit feature flags; ensure provider contract proofs and fail-closed behavior; add CI checks to block placeholder strings in runtime files
  Owner status: Engineering - address per sprint/accounting
  State: Unresolved

P2
---
- Accounting completion gaps
  Impact: Missing exports for GST/Tally
  Mitigation path: Implement ACCOUNTING_COMPLETION_PLAN.md deliverables
  State: Unresolved

- Infra/deployment gaps (env validation)
  Impact: Deployment failures or misconfigs
  Mitigation path: Add env validation in CI; documented deploy playbook
  State: Unresolved
