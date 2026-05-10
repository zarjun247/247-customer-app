# CURRENT_MAIN_TRUTH

Canonical production-readiness and merge-control entry as of 2026-05-08.

> **Canonical warning:** older status documents in this repository may contain stale scores, stale branch assumptions, or pre-merge blocker lists. Until the final merge-captain pass completes, this file is the canonical audit entry for current-main readiness and launch gating.

> **2026-05-09 supersession note:** latest-main validation is now recorded in `LATEST_MAIN_VALIDATION_STATUS.md` at SHA `f7d049825eb17922e9fa0c47326620e26a396186`, with latest visible merge PR #107 and no duplicate migration prefixes detected. Treat older SHA/PR values below as historical context unless refreshed.

## 1. CURRENT CANONICAL STATE

- Current sprint branch: sprint/production-readiness-integration
- Current branch SHA: 008f54fdc9a5f004fa6195c5b43e2d0d2e48b7a8
- Current main SHA: b7d2ede9f07916ae4223a184c57f7b84701d7e08
- Latest visible merge (local): 6686a6fadac240508d6cdbfd654d237ac999e580 (Merge pull request #123)
- Latest governance sprint applied: sprint/production-readiness-integration
- Current migration count: 47 (drizzle)
- Latest migration number: 0049
- Latest validation timestamp: 2026-05-10T07:12:40.864+05:30
- Latest validation status: PARTIAL PASS — typecheck, unit tests, build, and migration verification passed; repo governance scan completed with WARNINGS (provider placeholders). Dead-letter processing not run locally due to DATABASE_URL missing. Service-level guards for provider dead-letter uniqueness and refund journal posting have been implemented; CI observation required to claim full proof. CI workflow added to run DB-backed concurrency proof; proof unclaimed until workflow run.
- Current repo score (conservative): 7.2 / 10
- Current launch posture: controlled pilot

## 2. CURRENT REALISTIC SCORES (conservative / honest)

- architecture: 7 / 10 — modular services, but migration and deployment hardening required
- governance: 6 / 10 — governance infra present; runtime placeholders and roadmap drift found
- stock truth: 7 / 10 — canonical orchestrator present; DB concurrency proof pending
- OCR safety: 7 / 10 — handoff gates present; provider edge cases need tightening
- accounting maturity: 6 / 10 — refund reversal posting added; further ledger backfill & exports needed
- observability: 4 / 10 — limited dashboards/alerts
- provider/runtime truth: 6 / 10 — provider dead-letter guards added; runtime placeholders remain in some files
- compliance: 6 / 10 — basic scanning present; reporting incomplete
- deployment readiness: 6 / 10 — build OK; deployment infra and rollback procedures need documentation
- scalability: 5 / 10 — no verified concurrency proofs; load testing absent
- auditability: 7 / 10 — centralized audit scaffolds, some legacy direct audit calls removed
- production readiness (composite): 6 / 10

Overall conservative repo score: 7.2 / 10

## 3. CURRENT BLOCKERS (AUTHORITATIVE)
Aligned to OPEN_BLOCKERS.md and repo-governance-audit findings.

- P0: DB-backed concurrency proof gaps — Unresolved
- P1: provider_unconfigured / fake success placeholders in runtime code — Unresolved
- P1: Production backup/restore proof gaps — Unresolved
- P1: Accounting export/GST/Tally completion — Unresolved

## 4. CURRENT LAUNCH POSTURE
Allowed (with controls): supervised investor demos; controlled pilot with manual fallback; limited store rollout with manual operator override.

Not allowed: unsupervised race-mode scaling, multi-region unattended rollout, unattended provider fail-open behavior, unverified concurrency-heavy rollout.

## 5. HISTORY — Historical Notes (retain for audit only)
- Previous values and scores are retained here but are superseded by the sections above. Do not use historical values for launch/merge decisions.

---

This file is the canonical CURRENT truth. Any other document claiming production readiness for the repository must reference this file and CANONICAL_REPO_STATE_LOCK.md.
