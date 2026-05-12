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

## PR 4.1 follow-ups (logged 2026-05-11)

**OTEL_* env var documentation (D8 follow-up):** Neither `.env.example` nor `docs/ENVIRONMENT.md` exists in this repo. The four new optional OTel env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`) are typed and defaulted in `server/_core/env.ts`. Create `.env.example` or `docs/ENVIRONMENT.md` and document these keys with examples when the project adds environment documentation.

**OTel bootstrap ordering — separate entry file (PR 4.1 design note):** The current `server/_core/index.ts` calls `initializeTelemetry()` as the first line of `startServer()` before `express()` and `createServer()`. This is sufficient for HTTP + Express auto-instrumentation via shimmer prototype patching. If DB-level instrumentation (e.g., `mysql2` via `@opentelemetry/instrumentation-mysql2`) is added in a later MP1 or MP6 PR, a separate `server/bootstrap.ts` entry file using dynamic `import()` will be required so the OTel SDK starts before `mysql2` is required at all. Revisit before adding DB-level OTel instrumentation.

## MP1-rest PR-A follow-ups (logged 2026-05-11)

**SLO emission is wired but no emitter is currently calling sloService.emitSloEvent().** Future PRs will wire emission into critical paths:
  - PR-B (MP1-rest dead-letter router + provider health): emit around dead-letter retry and provider health rollups
  - MP5 (executeCommand wrapper): emit around sale/purchase/payment/refund command latency
  - MP6 (stockReplayEngine): emit around replay lag

**METRICS_SCRAPE_TOKEN is optional.** When unset, the /metrics endpoint continues to require staff cookie auth via the existing requireStaff middleware. When set, Prometheus scrapers can use `Authorization: Bearer <token>` as an alternative auth path. Both work simultaneously.

**slo_events table is migration 0050.** Reserved migration numbers continuing: 0051 (MP5 outbox dispatch tracking), 0052/0053 (MP6 reservation ledger + stock movement locks), 0054/0055/0056 (MP7 audit hash chain + PII keys + capability grants), 0057 (MP8 AI eval ledger).

## MP1-rest PR-B follow-ups (logged 2026-05-11)

**On-call rota is JSON-backed (interim).** `server/services/onCallRota.ts` reads/writes `server/data/oncall-rota.json`. This is intentional for MVP — no migration, no DB dependency. Future migration to a `on_call_shifts` DB table is required before multi-store or multi-node deployment where concurrent writes from different nodes could produce data loss. Tracked as P2 scale blocker.

**PagerDuty integration is best-effort only.** `escalate()` in `onCallRota.ts` fires-and-forgets a PagerDuty Events v2 POST with a 5 s timeout. If `ONCALL_PAGERDUTY_INTEGRATION_KEY` is unset, it logs to pino and returns without throwing. No retry, no DLQ, no acknowledgement. Before launch, either: (a) verify the PD key is present in staging and wire a smoke test, or (b) document the manual escalation path as the sole mechanism.

**Dead-letter retry is mark-only (no worker replay).** `deadLetterRouter.retry` marks `reviewStatus = "replayed"` and writes an audit log, but does not re-enqueue the original event payload. Actual replay requires a worker that reads the `rawPayload` and re-submits to the provider. This is required before the dead-letter remediation surface can be called operationally complete. Wire into the MP5 outbox/dispatch layer.

**Provider health drilldown queries last 50 events/dead-letters.** The `getProviderHealthDrilldown` function returns the 50 most recent rows for each category. If a provider accumulates high event volume, older failures will not appear in the drilldown UI. Adjust the limit or add cursor pagination when provider throughput exceeds ~500 events/day.

**`ONCALL_ALERT_EMAIL` is captured in ENV but not yet used.** The field is reserved for a future email fallback when PagerDuty is not configured. Wire it to an SMTP/SES call before relying on email escalation in any SOP.

## MP2 follow-ups (logged 2026-05-11)

**Chaos drills are script-only, not router-triggered.** The admin UI surfaces drill history but does not trigger drills. This is intentional: drills must run from an operator's terminal with full shell context, env var control, and direct stderr visibility. A future PR may add admin-triggered drills if and only if (a) RBAC for chaos triggers is hardened beyond admin role, (b) an approval workflow is added, (c) staging-only enforcement is verified independently of NODE_ENV (which can be misconfigured).

**Deployment readiness is opt-in.** When `DEPLOYMENT_VALIDATION_REQUIRED` is unset (the default), `/healthz` does not block on stale validation records. Production deployments should set this flag after the readiness check is integrated into the deploy pipeline (likely a follow-up PR or a Manus platform configuration change).

**Restore drill runner is a wrapper.** It depends on `scripts/restore-db-drill.mjs` existing. If that script needs hardening (better error reporting, dry-run mode), it should be done in a follow-up PR. The current wrapper records outcomes; it does not re-implement the underlying restore logic.

**Backup-age check is documentation-only.** `scripts/deployment-readiness-check.mjs` warns if the latest backup is older than `BACKUP_DRILL_MIN_INTERVAL_HOURS`, but it does not actually run a backup. Backup execution remains a separately-scheduled job (likely a cron or Manus-platform-managed task).

## MP5 follow-ups (logged 2026-05-11)

**Outbox dispatcher is not started at boot.** `server/services/outboxDispatcher.ts` ships the polling worker as a library, but `startOutboxDispatcher()` is never called from server boot code. Side effects accumulate in `command_outbox` in `pending` state with no dispatch. Wiring `startOutboxDispatcher()` into server startup is a one-line follow-up change; it is deferred because it requires per-side-effect-kind handler registration (see below), which is incremental work across future PRs.

**Side-effect handlers are not registered.** The three pilot migrations (`sale.confirm`, `purchase.commitInvoice`, `payment.verifyPayment`) emit side effects to `command_outbox` but no `registerOutboxHandler()` calls exist. Until handlers are registered, the dispatcher logs "no handler registered" warnings and skips those rows. Register handlers incrementally in follow-up PRs as in-line side-effect call sites (WhatsApp notifications, inventory snapshot refresh, provider webhook ack) are extracted from router logic.

**Only three procedures are migrated.** `saleRouter.confirmSale`, `purchaseRouter.commitInvoice`, `paymentRouter.verifyPayment`. The remaining ~30 command-style procedures (stock adjustments, refunds, credit notes, prescription dispense, etc.) continue to use direct DB writes and inline side effects. Migrating them to `executeCommand` is incremental — one router per follow-up PR, each requiring careful side-effect identification and idempotency-key design.

**Failed commands are terminal by idempotency key.** Per `executeCommand` contract, a failed command (state=`failed`) cannot be retried with the same `(idempotencyKey, commandName)` pair. Clients must mint a new idempotency key to retry. Existing tRPC retry middleware (if any) must be audited to ensure it does not silently retry with the same key on failure, which would produce a `CommandPriorFailureError`.

**Outbox retry is exponential backoff, hard-capped at 60 s.** Backoff sequence for `attemptNum`: 2 s, 4 s, 8 s, 16 s, 32 s, 60 s, 60 s… Rows that exhaust `maxAttempts` go to `state=failed`. No automatic routing to the dead-letter surface. Admin manual retry via `outbox.retry` tRPC procedure. Auto-DLQ on permanent failure and integration with the existing dead-letter remediation UI is a future enhancement. Note: the spec comment in MP1-rest PR-B (`deadLetterRouter.retry`) noted "wire into the MP5 outbox/dispatch layer" — that integration is now actionable.

**Compensation flow is defined but not used.** `commandStateMachine.ts` permits transitions from `completed`/`failed` to `compensated` (trigger: `compensation_run`), but no compensation runner exists. MP6 (reservation ledger) may need compensation for partial-rollback flows. Defer concrete compensation implementation until a real use case materialises.

**Multi-node dispatcher coordination is unaddressed.** `pollOnce()` uses `state=pending AND nextAttemptAt<=now AND attempts<maxAttempts` filtering with no row-level locking. Under concurrent dispatchers (multi-node production), two workers may pick up the same row. Before scaling beyond a single-node deployment, add a `SELECT ... FOR UPDATE SKIP LOCKED` pattern or a distributed lock (Redis-backed) to prevent double-dispatch.

## MP6 follow-ups (logged 2026-05-11)

**Reservation expiry worker is not started at boot.** `server/services/reservationExpiryWorker.ts` exports `startReservationExpiryWorker()` as a library function. It is intentionally NOT wired into server startup — starting it requires confirming that the production deployment runs a single persistent Node process (not ephemeral workers), and that the sweep interval (`RESERVATION_EXPIRY_SWEEP_INTERVAL_MS`, default 30 s) is acceptable given the reservation TTL. Wire it in server/index.ts in a follow-up PR after verifying deployment topology.

**Stock lock cleanup is not scheduled.** `cleanupExpiredLocks()` in `stockLockService.ts` deletes rows from `stock_lock_keys` where `expires_at < NOW()`. Nothing calls it automatically. Stale lock rows accumulate if processes crash mid-operation. Add a periodic cleanup call (e.g., alongside the expiry worker sweep, or in a separate cron) in a follow-up PR.

**`reservationService.ts` legacy API coexists with the new ledger.** The old `stockReservations` table (used by `reserveBatchAtomic`, `releaseReservationAtomic`, etc.) and the new `reservations`/`reservation_lines` tables (used by `reservationLedger.ts`) coexist. `getCanonicalAvailability` in `reservationService.ts` now delegates to the canonical ledger for read accuracy, but write paths remain split. Migrate all write paths (cart checkout, order confirmation, cancellation) to `reservationLedger.ts` incrementally in follow-up PRs. Until migration is complete, `stockReservations` rows have no impact on `getCanonicalAvailability` results.

**Migration 0054 reserved for `stock_lock_keys` session timeout index.** Once production throughput data is available, evaluate whether a compound index on `(lock_key, expires_at)` is warranted for the cleanup query. Current single-column index on `expires_at` is sufficient for expected lock contention levels during the initial rollout.

**Advisory lock TTL is fixed at `STOCK_LOCK_TIMEOUT_MS` (default 5 s).** The lock row's own `expires_at` is set to `acquired_at + lockTimeoutMs`. Under sustained DB write latency exceeding 5 s, a lock may self-expire and a competing request may acquire it while the original holder is mid-transaction. This is the correct safety valve; the real fix is ensuring DB write latency stays well below the timeout. Alert on P99 `reserve` command duration exceeding 2 s.

**Multi-line reservation atomicity depends on DB transaction.** `reservationLedger.reserve()` inserts the parent `reservations` row and all `reservation_lines` in a single transaction. If the transaction rolls back after partial inserts (e.g., lock acquisition failure), no orphan rows exist. However, the advisory lock acquired via `withLock` is released in a `finally` block that runs after the transaction — ensure the DB transaction commit/rollback completes before the lock is released. Current implementation is correct for the happy path; validate under DB failover scenarios.

**`reservation.confirm` writes `stockMovements` with `movementType='sale_fulfil'`.** This mirrors the existing `consumeReservationAtomic` pattern. If a distinct `movementType` for reservation confirmation is needed for reporting, add it to the `stockMovements` enum in a schema migration and update `confirm()` accordingly.

## MP7 follow-ups (logged 2026-05-11)

**PII encryption is not yet applied at write paths.** `customerPiiService.ts` and `prescriptionPiiService.ts` ship the encrypt/decrypt helpers but no router currently calls them when writing to DB or reading from DB. Wire them into `userRouter` (phone, email) and `prescriptionRouter` (pharmacistNote, ocrText) in follow-up PRs. Until wired, fields remain plaintext in the DB. Master key activation + write-path wiring must happen atomically with a data backfill pass.

**Data backfill required before full PII encryption.** Existing plaintext rows in `users.phone`, `users.email`, `prescriptions.pharmacist_note`, and `prescriptions.ocr_text` must be encrypted in a backfill migration before `decrypt()` can be made mandatory. The backfill must run in a maintenance window with the master key present. A phased approach: (1) wire encrypt on new writes, (2) schedule a backfill job, (3) enforce decrypt-only for `v1:`-prefixed rows.

**CSP is `off` by default.** Set `CSP_MODE=report_only` in staging to collect violation reports via `CSP_REPORT_URI` before promoting to `enforce`. Tighten `unsafe-inline` script/style directives with nonces once Vite-build hash injection is confirmed; the current directives permit inline scripts for dev/Vite compatibility.

**Rate limit store is in-memory.** `MemoryRateLimitStore` is not shared across nodes. Before multi-node production, set `API_RATE_LIMIT_BACKEND=redis` and wire a `RedisRateLimitStore` implementation. The current store works correctly for single-node deployments.

**Capability grants require manual seeding.** `capability_definitions` is seeded by migration 0056 but `capability_grants` is empty at first boot. The `capabilityProcedure` wrapper falls back to role-default mapping (defined in `CAPABILITY_ROLE_DEFAULTS`) so existing admin/manager roles retain access during the pilot. Explicit grants must be issued via `security.grantCapability` before relying on per-user capability enforcement without role fallback.

**Audit chain genesis is DB-seeded.** The genesis row (sequence 0) is inserted by migration 0054 using MySQL `SHA2()`. The `verifyChain()` function skips hash recomputation for sequence 0 because the genesis hash is computed server-side. All subsequent rows (sequence ≥ 1) are fully verified by `verifyChain()`.

**`onCall.upsert` uses `chaos.trigger` capability.** This is a semantic approximation — on-call rota management is not exactly a chaos action. A dedicated `oncall.manage` capability should be added to `capability_definitions` in a follow-up migration if fine-grained on-call scheduling control is required.

**`helpdeskRouter.resolve` uses `audit.view` capability.** Ticket resolution is not an audit action. A dedicated `helpdesk.resolve` capability is preferable. Tracked as P3 polish follow-up.

**Audit chain `appendChainedAudit` is best-effort.** Failures are swallowed and return `{sequenceNumber: -1, rowHash: ""}`. Downstream callers (grantCapability, revokeCapability, piiRotateKey) cannot distinguish a successful audit-chain append from a silent failure. Add a monitoring alert on `auditHashChain: append failed after retries` log lines to detect chain gaps in production.
## MP8 follow-ups (logged 2026-05-11)

**Intelligence outputs are advisory-only — no auto-dispatch wired.** `intelligenceRouter` procedures return heuristic scores and forecasts. No workflow currently auto-creates purchase orders, sends refill reminders, or modifies stock from these outputs. Connecting intelligence outputs to actionable workflows (e.g., triggering a purchase order suggestion in the PO workflow) must go through explicit human approval steps, consistent with the AGENTS.MD boundary.

**Continuity graph and refill risk use sales history only.** The `buildCustomerContinuityGraph`, `buildProductContinuityGraph`, and `getCustomerRefillRisks` functions query `sales`/`sale_lines` with `status='confirmed'`. App-channel orders (`orders` table) and WhatsApp orders are excluded unless they generate a confirmed sale. Wire in `orders` → `saleLines` contribution in a follow-up if chronic-medication order data is needed for refill cadence.

**Stockout forecast requires `numericStoreId` for live stock data.** `getStockoutForecast` accepts a `numericStoreId` option to query `storeSkus`. If omitted, `currentSellable` defaults to 0 for all products and all demand-positive SKUs appear critical. The `intelligenceRouter.stockoutForecast` procedure exposes `numericStoreId` as an optional input. UI callers should resolve the numeric store ID from the store master and pass it for accurate forecasts.

**`saleLines.productId` (varchar) and `storeSkus.productId` (int) are different type systems.** The stockout service matches them via `String(storeSkus.productId) === saleLines.productId`. This works only if `saleLines.productId` stores the string representation of the int `products.id`. Verify this invariant holds in production data; if not, add a lookup join through `products` in a follow-up migration.

**AI eval ledger genesis row is seeded by migration 0057.** Migration 0057 (`drizzle/0057_ai_eval_ledger.sql`) seeds the genesis row at sequence 0 using MySQL `SHA2()`. The `verifyChain()` function skips hash recomputation for sequence 0. All subsequent rows are fully verified. Run `pnpm verify:ai-eval-chain` to check integrity after large backfill operations.

**`appendSuggestion` is best-effort.** Failures return `{sequenceNumber: -1, rowHash: "", ledgerId: -1}` and never throw. Monitor `aiEvalLedger: append failed after retries` log lines. Persistent failures indicate a sequence uniqueness collision under high concurrency — investigate DB write contention.

**Acceptance rate in `getStats()` uses a 30-day outcome window.** Older outcomes (> 30 days) are excluded from the acceptance rate calculation. This window is appropriate for trending but may misrepresent rates for low-volume suggestion kinds. Consider exposing the window as a parameter in a follow-up.

**Migration number 0057 is reserved for `ai_eval_ledger`.** Do not use migration 0057 for any other purpose. Next available migration numbers for SM-B are 0058–0061 (consent_notice_versions, dsr_requests, family_consent, vault_encryption_columns).

## SM-B follow-ups (logged 2026-05-12)

**CSP mode changed from `off` to `enforce` (SM-B headline change).** Existing deployments must verify that their content includes no inline scripts or styles that violate the CSP policy before upgrading. Test the UI under CSP enforce mode before going live. Use `CSP_MODE=report_only` first if unsure.

**CSRF secret required in production.** `CSRF_SECRET` must be set to a 64-byte random value before serving real users. A `CRITICAL` log warning fires at boot if unset in production. Generate: `openssl rand -hex 64`.

**Retention worker is OFF by default and irreversible.** The retention/erasure worker only runs when `RETENTION_WORKER_ENABLED=true`. Erasure anonymises PII in `users`, `prescriptions`, and `orders` tables and cannot be undone. Enable only after legal sign-off on the statutory retention schedule (see LEGAL_REVIEW_PACK.md item L-1). Test with a staging data set first.

**Region assertion is opt-in.** Set `DPDP_REGION_REQUIRED=true` in production to enforce India data residency at boot. Unset (the default) skips the check. Required before DPDP compliance can be claimed. Verify S3 bucket and RDS instance are in `ap-south-1` or `ap-south-2` before enabling.

**DSR SLA monitoring is not automated.** There is no built-in alert when a DSR request approaches the 30-day SLA. Implement a DB query or monitoring alert as described in `docs/DPDP_OPERATIONS.md §9.1` before going live with DPDP DSR handling.

**Right to Nominate (DPDP Section 11(5)) not yet implemented.** Deferred to SM-C. Until implemented, document the manual workaround in the customer support SOP (customer contacts DPO by email).

**Family consent DOB gate is passive (no DOB in users schema).** `assertConsentForScheduleSale()` treats all customers as adults because `users.dateOfBirth` does not exist in the current schema. The family consent enforcement will not fire until DOB collection is added in a follow-up migration and back-filled for existing customers. Add `dateOfBirth` column to `users` in a follow-up migration.

**`dsrAdminRouter.listFamilyConsents` fetches all records with no store scoping.** In multi-store deployments, admin staff should only see family consent records for their assigned store. Add store-scoped filtering to `listFamilyConsents` before multi-store rollout.

**Breach notification is a template only.** `generateBreachNotification()` returns formatted text but does not send any email or file any incident. Integrate with an SMTP/SES sender in a follow-up PR. Until wired, operator must manually send the notification within 72 hours.

**Migration numbers 0058–0061 are reserved for SM-B DPDP schema.** Do not use these migration numbers for any other purpose. Next available migration number after SM-B is 0062.
