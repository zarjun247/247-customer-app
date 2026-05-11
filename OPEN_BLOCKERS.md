# OPEN_BLOCKERS

Updated: 2026-05-11.

## Pre-existing test failures observed during PR #155 (logged 2026-05-11)

All 12 suites below failed during the PR #155 test run and were confirmed
pre-existing (present on origin/main or attributable to collection environment,
not to code introduced in #155). See evidence/pr155-prexisting-bisect.txt and
evidence/pr155-introduced-recheck.json for full analysis.

- server/accounting-compliance.guard.test.ts — cause: ReferenceError: describe is not defined; file uses describe/test without importing them from vitest
- server/ci-governance-guards.guard.test.ts — cause: SyntaxError: cannot statically import .mjs (scripts/ci-governance-guards.mjs) from a TypeScript vitest test file
- server/ocr-production-safety.test.ts — cause: SyntaxError: same .mjs static import issue
- server/auth.logout.test.ts — cause: bisect artifact; fails only under NODE_ENV=production (assertProductionEnvSafe at module load); passes cleanly in standard test environment
- server/auth.phone.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/connectors.failclosed.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/ingestion.helpdesk.consent.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/mysql-concurrency.integration.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; skips cleanly (TEST_DATABASE_URL unset) in standard test environment
- server/payment-gateway.guard.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/payment-webhook-lifecycle.guard.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/pharmacy.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/refund-ledger.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment

## Current launch decision

**NO-GO for live controlled production** until all P0 launch blockers below have closure evidence. The repository remains suitable for supervised demos, staging rehearsals, investor evidence review, and launch-preparation work.

## Blocker classification

| Blocker | Class | Why it blocks | Closure evidence |
| --- | --- | --- | --- |
| Deployment evidence missing | P0 launch blocker | Runtime, artifact, health/readiness, and rollback paths are not proven for a real environment. | CI/CD logs, release artifact ID, staging/prod URL, health/readiness output, rollback proof, release owner signoff. |
| Real provider credentials/sandbox verification missing | P0 launch blocker | Payment, WhatsApp/SMS, maps, OCR, printer, storage, and Tally/export flows cannot be trusted from unconfigured/demo/skipped states. | Provider verification matrix with sandbox/staging test IDs, failure cases, disabled states, and owner signoff. |
| Measured staging backup/restore drill missing | P0 launch blocker | Recovery from data loss, failed deploy, or migration incident is not proven. | Backup ID, restore target, start/end time, verification commands, data checks, and restore owner signoff. |
| Staff access assignment missing | P0 launch blocker | Shared/unscoped accounts can breach PHI/PII, stock, payment, prescription, and store isolation controls. | Named staff roster with role, store scope, removal path, and no shared admin accounts. |
| Pharmacist SOP signoff missing | P0 launch blocker | Regulated medicine release, prescription review, substitutions, H/H1/X handling, and exceptions require accountable pharmacy signoff. | Pharmacist-in-charge signed SOP and staff acknowledgements. |
| Legal/compliance review missing | P0 launch blocker | Technical controls do not equal jurisdictional legal compliance. | Written legal/compliance approval or accountable written launch exception. |
| Live monitoring ownership missing | P0 launch blocker | Provider failures, dead letters, refunds, stock exceptions, security events, and incidents may go unowned. | Primary/secondary rota, escalation thresholds, daily review schedule, and incident commander assignment. |
| Emergency stop and rollback rehearsal missing | P0 launch blocker | Launch team has not proven it can safely stop, roll back, and reconcile. | Rehearsal notes with timeline, owner, commands/procedures, and signoff. |
| Hosted CI DB observation missing | P1 controlled rollout blocker | The workflow is wired and evidence-producing, but release branch parity is not archived until a green GitHub Actions run and artifact are attached. | Hosted `DB Concurrency Proof` run URL, run ID, branch, commit SHA, full logs, and `db-concurrency-proof-*` artifact per `HOSTED_CI_DB_PROOF_STATUS.md`. |
| Multi-store runtime data proof missing | P1 controlled rollout blocker before second store | Store isolation checks need production-like counts before expansion. | Report for missing assigned stores, missing order store IDs, negative stock rows, and cross-store anomalies. |
| Supplier invoice duplicate backfill/migration approval | P1 if live purchasing is enabled; P2 scale blocker otherwise | The commit seam blocks future committed duplicates non-destructively, but hard uniqueness cannot be added safely until supplier + store + invoice number duplicates are reviewed. | Business-reviewed duplicate report, remediation plan, and approved non-destructive constraint migration. |
| Accounting/compliance SOP evidence incomplete | P1 controlled rollout blocker | Daily reconciliation, statutory export, refund reversal review, and H1 record ownership need assigned operators. | Named owners and signed daily/monthly accounting/compliance checklist. |
| Incident command center incomplete | P2 scale blocker | Current observability is a foundation, not a complete command center. | Persisted incident records, backed SLA/provider heartbeat/anomaly metrics, and deployment scrape/access policy. |
| Provider heartbeat and SLA rollups absent | P2 scale blocker | Scaling without provider performance trends increases outage risk. | Durable latency/availability counters and alert thresholds. |
| UX/operator polish | P3 polish/deferred | Does not block a one-store launch if training/manual fallback cover gaps. | Prioritized post-launch backlog from launch staff feedback. |

## Current readiness score

**Overall controlled-production readiness: 8.7 / 10 today.**

A 9.5/10 controlled-production rating requires all P0 blockers closed with evidence while validation remains green; hosted DB proof is not closed by skipped local tests or workflow wiring alone. No production proof, provider proof, restore proof, or legal compliance is claimed until the relevant evidence is attached.

## Data backfill blocker preserved from main truth

Supplier invoice hard uniqueness still needs a business-review backfill before adding a destructive-risk unique constraint. The target key is **supplier + store + invoice number**.

## Governance boundaries that must not be weakened

- `stockInvariant`, reservation accounting, and reconciliation truth.
- Commercial truth, provider idempotency, refund reversal safeguards, and no fake provider success.
- Prescription, H/H1/X, pharmacist, statutory, and compliance gates.
- AI assistive-only boundary and no regulated mutation authority.
- PHI/PII/secret redaction and staff/admin gating for sensitive runtime surfaces.
- Migration safety: no destructive migrations without explicit review and rollback/restore proof.

## 2026-05-10 survivability blockers

| Blocker | Severity | Current state | Closure evidence |
| --- | --- | --- | --- |
| Hosted staging deployment evidence | P0 | Checklist and env guard exist; no deployed staging URL/artifact transcript attached. | Artifact ID, commit SHA, URL, health/readiness output, operator, timestamp. |
| Rollback rehearsal evidence | P0 | Rollback checklist exists; no measured rollback attached. | Staging rollback action ID, pre/post readiness, duration, queue/provider reconciliation. |
| Measured restore drill | P0 | Dry-run and verification scripts exist; no isolated restore transcript attached. | Backup checksum, restore duration/exit status, verification queries, app smoke, reconciliation signoff. |
| Provider outage drill evidence | P0 | Exercise matrix/checklist exists; no sandbox outage transcript attached. | Payment, OCR, WhatsApp/SMS, dead-letter/queue drill outputs with expected fail-closed behavior. |
| Monitoring ownership | P0 | Daily review checklist exists; no named 24/7 rota/signoff attached. | Incident commander rota, escalation path, and daily review evidence. |

## 2026-05-10 multi-store runtime blockers

| Blocker | Class | Status | Required closure evidence |
| --- | --- | --- | --- |
| First-class provider dead-letter store scope | P1 before second-store rollout | Open | Add/store-resolve `storeId` for provider events/dead letters or produce a redacted runtime report joining provider events to orders/payments by store with replay permissions verified. |
| First-class worker queue store scope | P1 before second-store rollout | Open | Add/store-resolve `storeId` on worker jobs or prove queue naming/payload correlation with operator visibility and replay restrictions. |
| Transfer receive hosted/staging contention proof | P1 before second-store rollout | Open | Run a two-store transfer contention test against staging/hosted DB and archive evidence showing no negative source stock or phantom destination stock. |
| Access roster and break-glass review | P0 for live launch, P1 for multi-store beta | Open | Named staff/admin roster with role, store assignment, pharmacist privileges, session/device policy, and break-glass owner signoff. |

## 2026-05-10 operationalization blocker update

The operationalization sprint reduces documentation/doctrine gaps but does not close evidence blockers. The following blockers are now narrowed from “missing doctrine” to “missing observed/signoff evidence”:

| Blocker | Updated state | Still required for closure |
| --- | --- | --- |
| Staff access assignment missing | Store opening/closing and ownership doctrine now define named-user, role, store-scope, and no-shared-admin expectations. | Actual roster with named users, roles, store scopes, removal path, and launch owner approval. |
| Pharmacist SOP signoff missing | Pharmacist SOP and training packet now exist. | Pharmacist-in-charge signed SOP, acknowledgement records, observed regulated-flow drills. |
| Live monitoring ownership missing | Incident/escalation and ownership matrices now define incident commander, provider owner, platform owner, and cadence. | Actual rota with primary/secondary contacts, alert thresholds, and launch-period coverage. |
| Emergency stop and rollback rehearsal missing | Stop-the-line, emergency freeze, rollback awareness, and incident commander runbook now exist. | Observed rehearsal notes with artifact/rollback target, timeline, owners, verification output, and signoff. |
| Accounting/compliance SOP evidence incomplete | Reconciliation/override governance now defines daily review, supplier dispute, dead-letter, refund, and rollback review cadence. | Named reconciliation/accounting owners and signed daily/monthly checklist evidence. |

Current score update: **8.9 / 10 controlled-production readiness** for launch preparation. This score reflects improved human-governance doctrine only; it is not legal approval, provider verification, production deployment proof, or pharmacist signoff.
