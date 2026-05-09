OPEN BLOCKERS

This file lists current unresolved production blockers and their severity.

P0
---
- DB-backed concurrency proof gaps
  Impact: Potential lost reservations / invoice collisions in high concurrency
  Affected systems: reservationService, purchase/sale commit flows
  Production risk: High (data-loss / double-reservation)
  Mitigation path: Enable TEST_DATABASE_URL for CI, run mysql concurrency harness, implement transactional proofs
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
