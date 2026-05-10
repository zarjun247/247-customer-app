# CURRENT_MAIN_TRUTH

Canonical production-readiness and merge-control entry as of 2026-05-10.

## Current pass summary

- Real DB-backed MySQL concurrency proof is **claimed locally only for the prior documented MySQL run**; hosted CI DB proof is wired but remains **pending observation** until a green GitHub Actions run/artifact is attached.
- `pnpm run test:db:bootstrap` applied the full Drizzle migration set against `TEST_DATABASE_URL` during that prior proof.
- `pnpm run test:db:concurrency` executed `server/mysql-concurrency.integration.test.ts` and passed all 11 MySQL-backed race/replay cases during that prior proof; the checked-in harness now contains 12 cases after adding the non-destructive duplicate supplier invoice commit guard, so the expanded count still requires fresh hosted or local observation.
- Migration metadata and statement splitting were fixed so the DB proof path can bootstrap through the post-`0021` migrations.
- Invoice collision handling, provider webhook replay idempotency, deterministic fixture isolation, and reservation terminal proof setup were fixed based on real MySQL failures.
- Provider retry/dead-letter proof covers retry scheduling, attempt counts, exact-once dead-letter insertion, preserved review fields, and no fake success state.
- Successful provider refund settlement posts a balanced refund accounting reversal through existing journal batches exactly once; failed refund webhooks do not post reversal entries.
- Supplier invoice duplicate enforcement remains a non-destructive guard plus business-review backfill plan for supplier + store + invoice number before hard DB uniqueness; the MySQL harness now covers the guard without adding a destructive migration.
- Operational visibility audit hardened the observability foundation: staff/admin gating was added to observability endpoints, sensitive HTTP log fields are sanitized, provider/dead-letter metrics derive from durable provider/worker tables, and dashboard definitions no longer claim unbacked capabilities.
- Final controlled-production gate documents now separate software readiness from operations, legal, provider, hosted CI DB proof, deployment, and restore evidence instead of claiming unevidenced production proof.

## Launch mode decision

| Launch mode | Current decision | Rationale |
| --- | --- | --- |
| Investor demo | Allowed | Supervised demo flows and evidence walkthroughs are supported, with explicit non-claims for production proof. |
| Staging launch rehearsal | Allowed | The next appropriate activity is evidence collection: staged deploy, provider sandbox checks, restore drill, access roster, SOP training, and rollback rehearsal. |
| Controlled live first store | **No-go today** | Software foundations are strong, but P0 operational evidence is missing: hosted CI DB observation, provider verification, measured restore drill, staff access assignment, pharmacist SOP signoff, legal/compliance review, live monitoring ownership, and deployment/rollback proof. |
| Multi-store beta | Not yet | Requires successful first-store period, multi-store data proof, hosted CI observation, provider stability evidence, incident ownership, and scale-readiness review. |
| Race-mode unsupervised production | Not allowed | Still requires hosted CI parity, deployment proof, restore evidence, provider verification, live monitoring, incident drills, and operational controls. |

## Final 9.5 gate scorecard

| Area | Estimated score | Meaning |
| --- | ---: | --- |
| Architecture | 8.9 / 10 | Strong modular runtime, MySQL-backed proof path, hosted workflow wiring with evidence artifacts, guarded routers, worker/provider foundations, and governance checks. |
| Stock truth | 9.0 / 10 | `stockInvariant`, reservations, batch/ledger posture, FEFO discipline, and race-proof foundations are preserved; hosted DB observation is still required before closing the proof gap. |
| Commercial truth | 8.8 / 10 | Idempotency, webhook replay, refund reversal, provider retry/dead-letter, duplicate supplier invoice guard, and accounting recognition seams are materially improved. |
| Accounting/compliance ops | 8.1 / 10 | Technical statutory/accounting surfaces exist; legal/pharmacist review and supplier duplicate backfill approval remain required. |
| Observability | 7.8 / 10 | Staff/admin-gated metrics and provider/dead-letter visibility are backed; incident/SLA/anomaly command-center capabilities remain incomplete. |
| Deployment runtime | 7.4 / 10 | Safe readiness surfaces exist; no production deployment/rollback proof is claimed. |
| Multi-store readiness | 7.6 / 10 | Runtime visibility exists; production-like store data proof and second-store gates remain required. |
| AI governance | 9.4 / 10 | AI remains assistive-only, audited, PHI/PII-aware, and blocked from regulated mutation. |
| PHI/PII/security | 8.8 / 10 | Redaction and staff-gated sensitive endpoints are strong; external encryption/access/retention/breach evidence remains required. |
| Backup/restore readiness | 6.5 / 10 | Dry-run doctrine exists; measured staging restore drill is still mandatory. |
| UX/operator readiness | 7.0 / 10 | Operator flows have foundations; staff training, SOP signoff, manual fallback, and UX polish remain. |
| Investor diligence readiness | 8.8 / 10 | Documentation is honest and evidence-oriented, with a production evidence register and hosted CI capture steps; external proof attachments are still needed. |

**Overall controlled-production readiness: 8.7 / 10 today; evidence-system readiness is roughly 9.1 / 10, but actual controlled-production readiness cannot be marked 9.5 / 10 until hosted DB proof and the other P0 external evidence are attached.** A 9.5/10 controlled-production rating is achievable only after P0 evidence is collected without weakening core gates.

## Software-ready vs operational truth

| Readiness category | Status | Notes |
| --- | --- | --- |
| Software-ready | Near-ready for controlled pilot | Must keep `pnpm run check`, `pnpm test`, `pnpm run build`, migration verification, governance guards, and diff checks green. |
| Ops-ready | Not yet | Needs named owners, staff access roster, monitoring rota, training, manual fallback, daily reviews, and incident rehearsal. |
| Legally reviewed | Not claimed | Repository controls are not legal certification. |
| Provider-verified | Not claimed | Real sandbox/staging provider evidence is missing. |
| Deployment-proven | Not claimed | No production/staging artifact, runtime URL, or rollback evidence is stored in this repo. |
| Backup/restore-proven | Not claimed | Dry-run docs exist; measured staging restore evidence is not present. |

## Remaining blockers

See `OPEN_BLOCKERS.md`, `PRODUCTION_9_5_READINESS.md`, `CONTROLLED_ROLLOUT_CHECKLIST.md`, and `LAUNCH_GO_NO_GO_MATRIX.md` for the canonical remaining blocker list and launch rules.

## Deployment/runtime readiness update

- Staff/admin-gated deployment readiness and multi-store runtime tRPC surfaces exist.
- Safe health/readiness/degraded-mode visibility exists without exposing secrets, connection strings, PHI, or PII.
- Worker/provider/queue health visibility uses existing safe healthcheck and queue stats paths.
- Aggregate store isolation checks cover missing assigned stores, missing order store IDs, and negative stock rows.
- Backup/restore remains dry-run documentation only; destructive restore execution is intentionally not implemented.
- No production deployment proof is claimed by this update.

## Governance seal

- AI remains assistive only and cannot diagnose, prescribe, substitute, approve prescriptions, or release regulated medicines.
- AI/OCR worker jobs have explicit governance boundaries and are dead-lettered on regulated mutation attempts.
- Audit events preserve actor attribution and are sanitized for PHI/PII/secrets.
- Worker/provider persisted payloads are sanitized before storage.
- Public runtime endpoints are minimal; detailed health/observability remains staff/admin gated.
- Existing stockInvariant, reconciliation truth, H/H1/X, pharmacist gates, and commercial lifecycle protections are not weakened.
- Controlled production remains a no-go until evidence, owner, legal, provider, restore, monitoring, and rollout gates are closed.

## 2026-05-10 survivability sprint update

- Staging deployment, rollback, degraded-mode, and restore evidence templates/checklists are now present, but no real staging deploy/rollback/restore proof is claimed.
- Safe deployment environment validation was added via `scripts/validate-deployment-env.mjs`; it validates URL/artifact/rollback assumptions without printing secret values.
- Safe restore verification planning was added via `scripts/restore-verify.mjs`; it refuses destructive execution and production-looking targets.
- Deployment readiness now exposes a staff/admin-gated failure exercise matrix for payment, OCR, WhatsApp/SMS, queue, dead-letter, DB, worker, and rollback drills as exercise plan data only.
- Controlled-production readiness remains **8.8 / 10** after this sprint: evidence infrastructure improved, but hosted CI, measured staging deployment, rollback, restore, provider outage, legal/pharmacist, and monitoring evidence remain open.

## 2026-05-10 multi-store runtime evidence sprint update

- Multi-store runtime readiness is now estimated at **8.6 / 10** for controlled staging rehearsal, up from foundational readiness, but it is **not closed at 9.5 / 10** because provider dead-letter and worker queue store isolation are not first-class schema-backed proofs yet.
- Fixed a true isolation gap: `multiStoreRuntime.store` now enforces store assignment for store staff while allowing admin/ops/super-admin operational cross-store visibility.
- Fixed transfer safety gaps: transfer initiation validates source/destination separation, source batch ownership, product match, destination store existence, and source-store authority; transfer receive now fails closed inside one transaction for reservation consumption, source debit, destination inventory creation, movement evidence, and transfer state transition.
- Reconciliation visibility was tightened: stock audit list defaults to caller store for non-admin users and audit line reads check the parent audit store before returning rows.
- New status and drill documents distinguish implemented guarantees, simulated proof, observed guard proof, and unsupported/not-yet-proven behavior.
