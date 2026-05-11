# Current Status

This document is the canonical "where are we now" reference. Update it after each merged MP or significant PR. For the full blocker list, see [OPEN_BLOCKERS.md](../OPEN_BLOCKERS.md) — do not duplicate blocker details here.

---

## Score: ~9.08 / 10 (as of 2026-05-11, post PR 4.1 + MP1)

A score of **9.5/10** (controlled-production rating) requires all P0 blockers closed with evidence. The current score reflects strong software foundations but missing operational evidence. See §Score history below.

---

## What's done

### Completed merges (chronological, most recent first)

| PR / MP | What shipped | Key code artifacts |
|---------|-------------|-------------------|
| PR #157 — PR 4.1: OTel end-to-end instrumentation | OpenTelemetry SDK initialized before Express. OTLP trace export via 4 optional env vars. prom-client Prometheus metrics at `/metrics` (staff/admin gated). Pino structured logging with PHI/PII redaction. Dashboard definitions cleaned of unbacked capabilities. | `server/_core/telemetry.ts`, `server/_core/observability.ts` |
| PR #156 — MP1: Runtime incident command (wire real endpoints to frontend) | AdminCommandCenter and AdminRuntimeIncident wired to real tRPC endpoints. Staff/admin gated. Incident creation and status tracking from admin UI. | `client/src/pages/admin/AdminCommandCenter.tsx`, `server/routers/commandCenterRouter.ts` |
| PR #155 — Transactional refund event + commercial lifecycle hardening | Silent-swallow fix on 7 cross-platform guard tests. Commercial lifecycle, refund ledger, and stock reservation guard improvements. Pre-existing test failures bisected and documented. | `evidence/pr155-prexisting-bisect.txt`, `evidence/pr155-full-test-final.log` |
| Operationalization sprint (2026-05-10) | Pharmacist SOP, shift/store checklists, incident commander runbook, escalation matrix, reconciliation/override governance, backup/restore runbook, deployment runbook, multi-store operator drill, store onboarding checklist. All collapsed into living docs by MP3. | Now in `docs/OPERATIONS.md`, `docs/RUNTIME.md` |
| AI governance seal | `server/services/aiGovernance.ts` central classifier. Worker jobs declare assistive-only governance boundary. AI audit records via `ai.decision_recorded`. Guard test proves prohibited AI tasks fail closed. | `server/services/aiGovernance.ts`, `server/ai-governance-seal.guard.test.ts` |
| Survivability sprint (2026-05-10) | Deployment env validation script, restore verification script, restore drill documentation, degraded-mode failure exercise matrix. | `scripts/validate-deployment-env.mjs`, `scripts/restore-verify.mjs` |
| Multi-store runtime evidence sprint (2026-05-10) | Store isolation gap fixed: `multiStoreRuntime.store` enforces store assignment for store staff. Transfer initiation validates source/destination separation, source batch ownership, product match. Transfer receive fails closed in one transaction. Reconciliation visibility tightened. | `server/routers/multiStoreRuntimeRouter.ts` |
| Commercial truth hardening | Idempotency, webhook replay, refund reversal, provider retry/dead-letter, duplicate supplier invoice guard, accounting recognition seams. | `server/services/commercialLifecycle.ts`, `server/services/commercialTruthSeams.ts` |
| Stock truth (stockInvariant) | `stockInvariant` enforced on all stock mutations. FEFO discipline, batch/ledger posture, race-proof foundations. Reservation truth and expiry. | `server/services/stockInvariant.ts`, `server/services/reservationService.ts` |
| H1 statutory schema | H1 sales register surface. H1 register correctness guard test. | `server/h1RegisterCorrectness` guard area |
| PHI/PII security | Redaction and staff-gated sensitive endpoints. Prescription vault consent design. Audit log field sanitization. | `server/_core/observability.ts`, `server/middleware/` |
| RBAC/session governance | Store-scoped staff access, role hierarchy, session controls. | `server/middleware/`, `server/routers/` |
| Provider failclosed | Payment, WhatsApp, OCR providers fail closed. No fake success states. Dead-letter patterns. | `server/services/`, provider dead-letter tables |
| MySQL concurrency proof | 12-case race/replay test harness against real MySQL. Reservation terminal proof, provider webhook replay idempotency. | `server/mysql-concurrency.integration.test.ts` |
| MP3: Docs collapse (this PR) | 149 root .md files collapsed into 5 living docs + ADR + DPDP scaffold. `scripts/verify-docs-structure.mjs` added. `AGENTS.MD` updated. `README.md` rewritten. | `docs/OPERATIONS.md`, `docs/RUNTIME.md`, `docs/COMPLIANCE.md`, `docs/RELEASE.md`, `docs/STATUS.md`, `docs/adr/`, `docs/dpdp/` |

---

## What's in progress

| MP / Branch | Terminal | What it ships | Status |
|-------------|---------|--------------|--------|
| MP1-rest PR-A — Metrics and SLO framework | Terminal A | `sloService.ts`, `providerHealth.ts`, dead-letter router, provider health router, SLO dashboard wiring. | In progress — branch `roadmap/mp1-rest-pr-a-metrics-and-slo`. |
| MP3 — Docs collapse | Terminal B | This document and the 5 living docs. | In progress — this PR. |

---

## What's blocked

See [OPEN_BLOCKERS.md](../OPEN_BLOCKERS.md) for the full, canonical blocker list with evidence requirements. Key categories:

- **P0 launch blockers:** Deployment proof, provider verification, backup/restore drill, staff access assignment, pharmacist SOP signoff, legal/compliance review, live monitoring ownership, emergency stop rehearsal. None of these are evidenced yet.
- **P1 controlled rollout blockers:** Hosted CI DB concurrency proof not archived; multi-store runtime data proof missing; supplier invoice duplicate backfill/migration approval pending.
- **P2 scale blockers:** Incident command center incomplete; provider heartbeat/SLA rollups absent.

**Current decision:** NO-GO for live controlled production. Staging rehearsal and evidence collection are the appropriate next activities.

---

## Open items needing verification

These items appeared with conflicting or ambiguous states across old status documents. They need a human to verify and close.

| Item | What's unclear | Source |
|------|---------------|--------|
| Hosted CI DB concurrency proof | Workflow is wired and the 12-case harness is in the repo, but it's unclear whether a green GitHub Actions run with the `db-concurrency-proof-*` artifact has been archived for the current main commit. | CURRENT_MAIN_TRUTH.md vs HOSTED_CI_DB_PROOF_STATUS.md |
| `pnpm audit` status | Some status docs claim "audit clean" while others note unresolved moderate vulnerabilities. Run a fresh `pnpm audit` on the release commit and record the result. | Various *_STATUS.md |
| Printer integration status | Some docs say printer is "disabled/queued" while others describe it as "configured for staging". Needs a named owner decision. | PILOT_RUNBOOK.md, various |
| OCR provider readiness | OCR is documented as assistive-only and AI-governed, but it's unclear whether a real OCR provider key is available for staging/production or whether all staging tests used the dry-run path. | OCR_PRODUCTION_SAFETY_STATUS.md |
| WhatsApp template approval status | WhatsApp integration exists, but the status of Meta template approval for production use is not confirmed. | WHATSAPP_NOTIFICATION_SAFETY_STATUS.md |
| Supplier invoice hard uniqueness migration | The business-reviewed duplicate report and remediation plan required before `ALTER TABLE ... ADD UNIQUE` are referenced in OPEN_BLOCKERS.md but no evidence of the review is attached. | OPEN_BLOCKERS.md |
| Worker queue `storeId` | Multiple docs reference adding `storeId` to worker job rows as a P1 item for second-store rollout. No migration or PR is open for this. | MULTI_STORE_READINESS_STATUS.md |
| Provider dead-letter `storeId` | Same as worker queue — referenced as P1 but not yet scheduled. | STORE_ISOLATION_GUARANTEES.md |
| `.nvmrc` / runtime version file | PRODUCTION_DEPENDENCY_POLICY.md recommends a `.nvmrc` or equivalent. One does not appear to exist yet. | PRODUCTION_DEPENDENCY_POLICY.md |

---

## Score history

| Date | Score | What drove the change |
|------|-------|----------------------|
| 2026-05-01 (approx) | ~7.5/10 | Initial stock truth, commercial lifecycle, basic auth. |
| 2026-05-07 (approx) | ~8.5/10 | AI governance seal, PHI/PII hardening, H1 statutory schema, RBAC session governance, MySQL concurrency proof. |
| 2026-05-10 | 8.7/10 | Survivability sprint: deployment env validation, restore drill docs, degraded-mode planning. |
| 2026-05-10 | 8.9/10 | Operationalization sprint: pharmacist SOP, store checklists, incident commander runbook, reconciliation governance. |
| 2026-05-11 | ~9.08/10 | MP1 (AdminCommandCenter real endpoints, PR #156) + PR 4.1 (OTel end-to-end, PR #157). |
| 2026-05-11 | +0.10 → ~9.18 | MP3: docs collapse. Discoverability, operator-readability, stale narrative removed. (Or ~9.30 if MP1-rest PR-A merges first.) |

**Reaching 9.5/10** requires: all P0 blockers closed with external evidence (provider credentials verified, staging deploy/rollback proven, restore drill measured, staff access roster named, pharmacist SOP signed, legal/compliance reviewed, live monitoring rota assigned, emergency stop rehearsed). Software foundations are strong; the gap is operational evidence.

---

## Score breakdown (as of 2026-05-11)

| Area | Score | Notes |
|------|-------|-------|
| Architecture | 8.9/10 | Strong modular runtime, MySQL-backed proof path, hosted CI workflow wired, guarded routers, worker/provider foundations. |
| Stock truth | 9.0/10 | `stockInvariant`, reservations, batch/ledger posture, FEFO discipline, race-proof foundations. Hosted DB observation still required. |
| Commercial truth | 8.8/10 | Idempotency, webhook replay, refund reversal, provider retry/dead-letter, duplicate supplier invoice guard. |
| Accounting/compliance ops | 8.1/10 | Technical statutory/accounting surfaces exist; legal/pharmacist review and supplier duplicate backfill approval required. |
| Observability | 8.2/10 | OTel traces, prom-client metrics, pino logging, staff/admin gated. SLO framework in progress (MP1-rest). |
| Deployment runtime | 7.4/10 | Safe readiness surfaces exist; no production deployment/rollback proof claimed. |
| Multi-store readiness | 7.6/10 | Runtime visibility exists; production-like store data proof and second-store gates remain required. |
| AI governance | 9.4/10 | AI remains assistive-only, audited, PHI/PII-aware, blocked from regulated mutation. |
| PHI/PII/security | 8.8/10 | Redaction and staff-gated sensitive endpoints are strong; external encryption/access/retention/breach evidence required. |
| Backup/restore readiness | 6.5/10 | Dry-run doctrine exists; measured staging restore drill is mandatory before launch. |
| UX/operator readiness | 7.0/10 | Operator flows have foundations; staff training, SOP signoff, manual fallback, and UX polish remain. |
| Documentation quality | 9.0/10 | 5 living docs + ADR + DPDP scaffold (post MP3). Was fragmented across 149+ files. |
