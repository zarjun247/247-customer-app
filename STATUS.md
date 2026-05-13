# STATUS.md — 247 Pharmacy OS

**Last updated:** 2026-05-12  
**Current branch for active work:** score-lift/sm-lm-complete  
**Preceding milestone:** SM-K (merged 2026-05-12, PR #176, 14/14 CI green)

---

## Current state summary

The system is **pre-production**. All engineering milestones through SM-K are merged.
Remaining work is SM-LM (this branch): operational wiring, lint cleanup, coverage,
product completeness, and DSR §11(5).

Human-gated launch blockers are tracked in SCORECARD.md (10 items).

---

## Migration state

Last applied migration: `0067_dsr_sla_dedup.sql`  
Pending (to be added in SM-LM):
- 0072: system_settings table (Phase 1)
- 0073: drop stockReservations (Phase 4, requires user confirmation)
- 0074: dsr_nominees (Phase 11)
- 0075+: doctor consult if chosen (Phase 10)

---

## Feature state

### Working end-to-end
- Order state machine (create → pharmacist approve → allocate → dispatch → deliver)
- Schedule H/H1/X pharmacist-gated dispensing (hard gate, no bypass)
- POS sale with stock movement and FEFO batch allocation
- Purchase invoice inward receiving and batch ledger
- Refund flow with provider verification and ledger
- DSR pipeline: access, export, rectification, erasure, consent_log, grievance
- Family consent enforcement for minors on controlled substances
- Capability grants (RBAC) with role defaults
- Audit hash chain for tamper-evident records
- OCR invoice ingestion pipeline (parse → human review gate → commit)
- WhatsApp message dispatch
- Reservation ledger with concurrency proof (20-case)
- Outbox dispatch (wired in code; **not called at boot**)
- Retention worker (OFF by default; RETENTION_WORKER_ENABLED=true to enable)
- Refill reminder calendar (customer UI complete)
- Multi-store intelligence dashboards (stockout forecast, refill alerts, continuity SKUs)
- DPDP privacy settings UI (/privacy)
- Admin DSR queue (/admin/dsr-queue)

### Scaffolded / incomplete
- Doctor consult booking: **no pages or services exist** (to be decided in Phase 10)
- Emergency stop: script writes flag file; **no middleware reads it at runtime**
- Circuit breakers: **none** — all external provider calls are bare
- AbortController timeouts on fetch(): **none**
- SLO emit on 9 critical paths: **0/9 wired** (all show "Planned" in SLO_COVERAGE.md)
- startOutboxDispatcher(): function exists; **not called in boot sequence**
- startReservationExpiryWorker(): function exists; **not called in boot sequence**
- startStockLockCleanup(): **does not exist** (cleanupExpiredLocks() exists)

### Formally deferred (FUTURE_FEATURES.md)
- Medication Continuity Graph
- Building Health Index  
- Smart Refill Mode (auto-draft)
- OCR → Auto Procurement Loop

---

## Test coverage

- **@vitest/coverage-v8**: not installed
- **Estimated coverage**: unknown (no baseline run)
- **Mutation testing**: not installed

---

## Code hygiene

- Lint warnings: 4,248 (across 172 files; baseline in lint-baseline-by-file.json)
- lint-baseline.txt: `4350` (slightly stale; actual current is 4,248)
- Part2/Extension files: 4 × *Part2.ts + 11 × *Extension.ts (to be renamed in Phase 4)
- Circular imports: unknown (madge not run)
- ADRs: 1 of 10 target (only 0001 exists)

---

## Security / compliance

- CSRF: double-submit cookie wired; enforcement mode defaults to `log_only` (not blocking)
- CSP: nonce-based, enforce mode
- HSTS: configured
- PII encryption: key versioning present; write paths not yet calling encrypt()
- pnpm audit --prod --audit-level=high: exits 0 (3 CVEs suppressed via auditConfig.ignoreCves)
- Trivy Docker scan: exits 0 (129 CVE/GHSA IDs in .trivyignore)
- DSR §11(5) Right to Nominate: **not implemented** (LEGAL_REVIEW_PACK L-6)

---

## What SM-LM will close

See the SM-LM prompt for full detail. Summary:
1. Wire 3 workers at boot + emergency stop as real control plane (migration 0072)
2. Wire emitSloEvent() on 9 critical paths
3. Real fault injection in operational scripts
4. Lint baseline 4,248 → 0 (hard-zero gate)
5. Drop stockReservations (migration 0073, requires user confirmation)
6. Migrate ~30 command-style procedures bypassing executeCommand
7. Madge circular import check
8. Rename 15 Part2/Extension files
9. TSDoc on all exported services + routers; 8 new ADRs
10. @vitest/coverage-v8 + Stryker mutation testing
11. DSR §11(5) Right to Nominate (migration 0074)
12. Doctor consult booking (Phase 10 decision)
13. End-to-end tests: refill reminder, DSR pipeline, PrivacySettings
