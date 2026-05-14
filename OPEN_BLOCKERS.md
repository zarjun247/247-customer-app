# OPEN_BLOCKERS.md

Updated: 2026-05-14 (SM-Ω Phase 1).

---

## Humans-must-do

See [SCORECARD.md](./SCORECARD.md) for the 10 items that require human action before production. No code changes can substitute.

---

## Open — technical/process items

### P0 Launch blockers (require evidence, not code)

| Blocker | Why it blocks | Closure evidence needed |
|---------|---------------|------------------------|
| Deployment evidence missing | Runtime, artifact, health/readiness, rollback not proven | CI/CD logs, artifact ID, staging URL, health output, rollback proof, owner signoff |
| Real provider credentials missing | Payment, WhatsApp/SMS, OCR, storage flows untested | Provider verification matrix with sandbox/staging test IDs |
| Measured staging backup/restore drill missing | Recovery from data loss not proven | Backup ID, restore duration, verification queries, owner signoff |
| Staff access assignment missing | Shared/unscoped accounts breach PHI/PII, store isolation | Named staff roster with role, store scope, removal path |
| Pharmacist SOP signoff missing | Regulated medicine release requires licensed pharmacist sign-off | Pharmacist-in-charge signed SOP |
| Legal/compliance review missing | Technical controls do not equal jurisdictional compliance | Written legal/compliance approval |
| Live monitoring ownership missing | Provider failures, dead letters, incidents may go unowned | Primary/secondary rota, escalation thresholds, daily review |
| Emergency stop and rollback rehearsal missing | Launch team has not proven it can stop, roll back, and reconcile | Rehearsal notes with timeline, owners, commands, signoff |

### P0 Code blockers (engineering, not evidence)

_No open P0 code blockers. All closed by SM-N (see closed section)._

### P1 Controlled rollout blockers

| Blocker | Status |
|---------|--------|
| Hosted CI DB observation (GitHub Actions `DB Concurrency Proof` run) | Wired, not yet archived |
| Multi-store runtime data proof | Required before second store |
| Supplier invoice duplicate backfill/migration approval | Required before hard uniqueness constraint. Target key: supplier + store + invoice number. A business-review backfill must be completed before `ALTER TABLE ... ADD UNIQUE`. |
| Accounting/compliance SOP evidence | Named owners + signed checklist required |

### Infrastructure / wiring follow-ups

**Outbox dispatcher** — `startOutboxDispatcher()` not called at boot. Side-effect handlers not registered. Three procedures migrated (`sale.confirm`, `purchase.commitInvoice`, `payment.verifyPayment`); 97 direct DB writes across routers still bypass `executeCommand` (SM-LM Phase 4.2 deferred — requires per-procedure domain analysis, idempotency key design, command naming, and outbox wiring; estimated 3–5 engineering days). Multi-node requires `SELECT ... FOR UPDATE SKIP LOCKED`.

**stockReservations drop deferred** — table is still actively written by `reservationService.ts` and read by `inventoryRouter.ts`, `healthcheck.ts`, and stock availability queries in `db.ts`/`db-extended.ts`. Full migration to `reservation_ledger` required before drop. Deferred to post-launch architecture cleanup.

**Large files (>600 lines) — advisory** — `max-lines: warn` lint rule added (SM-LM Phase 4.5); pre-commit gate exempts this rule. 31 existing source files exceed the threshold. Split deferred to post-launch. Known offenders: `server/routers.ts` (1609), `server/routers/whatsappRouter.ts` (1425), `server/routers/masterDataRouter.ts` (1223), `server/routers/commandCenterOcrRouter.ts` (1113), `server/routers/deliveryRouter.ts` (1048), `server/routers/inventoryRouter.ts` (1015), `server/routers/ocrIngestionRouter.ts` (975), `server/services/supplierLedger.ts` (879), and 23 more files (600–780 lines).

**Circular imports (Part2 pattern)** — `db.ts ↔ db-extended.ts`, `connectors.ts ↔ connectors-peripheral.ts`, `pharmacy.ts ↔ pharmacy-metrics.ts`, `routingEngine.ts ↔ routing-engine-extended.ts`. These are intentional file-size splits where the extended file re-uses helpers from the base and the base barrel-exports the extended file. The `trpc ↔ rbac` cycle was fixed by extracting `_core/roles.ts` (SM-LM Phase 4.3). The Part2 cycles require splitting the shared helpers into a third module to resolve — deferred to post-launch architecture cleanup.

**Coverage measurement** — `@vitest/coverage-v8` installed (SM-Ω Phase 1). Real floor measured 2026-05-14: statements 37.25%, branches 69.45%, functions 46.94%, lines 37.25%. Thresholds anchored 1% below measured in `vitest.config.ts` (statements 36%, branches 68%, functions 45%, lines 36%) as a regression gate. Gap-fill (Phase 8) and Stryker mutation testing (Phase 9) remain deferred.

**Reservation expiry worker** — `startReservationExpiryWorker()` not wired at boot. `cleanupExpiredLocks()` not scheduled. Old `stockReservations` table coexists with new `reservations`/`reservation_lines` — write paths need incremental migration.

**PII encryption write paths** — fully wired (SM-Ω Phase 1). `users.phone`/`email` encrypted on all write paths (SM-N + SM-Ω); `prescriptions.patientPhone` and `pharmacistNote` encrypted on all write paths and decrypted on all read paths. `users.phoneHash` (HMAC-SHA256) added for deterministic lookup when encryption is active; `getUserByPhone` uses hash lookup. Column widths widened: `users.phone VARCHAR(500)` (migration 0075), `prescriptions.patientPhone VARCHAR(500)` (migration 0076). Existing plaintext rows: run `pnpm tsx scripts/pii-backfill.ts --apply` in a maintenance window with `PII_ENCRYPTION_MASTER_KEY` set.

**SMTP/SES breach notification** — `breachNotificationDispatcher.ts` wired; generates correct payload. No email transport configured. Set `BREACH_NOTIFY_RECIPIENT_EMAIL` in production env. See [FUTURE_FEATURES.md](./FUTURE_FEATURES.md).

**On-call rota** — JSON-backed (`server/data/oncall-rota.json`). Must migrate to DB table before multi-node deployment. PagerDuty integration is fire-and-forget with no retry.

**Dead-letter retry** — marks `reviewStatus="replayed"` but does not re-enqueue original payload. Actual replay requires worker reading `rawPayload`.

**CSP mode** — set `CSP_MODE=report_only` in staging before `enforce`. Tighten `unsafe-inline` directives once Vite nonce injection is confirmed.

**Rate limit store** — in-memory; not shared across nodes. Set `API_RATE_LIMIT_BACKEND=redis` before multi-node production.

**Capability grants** — ~~`capability_grants` empty at first boot~~ — by design (SM-Ω Phase 1): `CAPABILITY_ROLE_DEFAULTS` in `capabilityGrantService.ts` (sealed) provides comprehensive role-based defaults. The system is fully operational without seeding any DB grants; `capabilityProcedure` already consults defaults before the DB. Explicit grants via `security.grantCapability` are only needed for per-user overrides beyond role defaults.

**Intelligence — stockoutForecast** — requires `numericStoreId` for accurate live stock data; defaults to 0 otherwise.

**saleLines.productId vs storeSkus.productId type mismatch** — matched via `String()` coercion; verify invariant holds in production data.

**`appendSuggestion` / `appendChainedAudit` best-effort** — silent failures return sentinel values. Monitor log lines for chain gaps.

**OTel bootstrap ordering** — current wiring sufficient for HTTP instrumentation. Separate `bootstrap.ts` required if DB-level (`mysql2`) OTel is added.

**`OTEL_*` env vars undocumented** — four optional OTel keys typed in `server/_core/env.ts` but no `.env.example` or `docs/ENVIRONMENT.md` exists yet.

**`ONCALL_ALERT_EMAIL`** — captured in ENV, not yet wired to SMTP/SES fallback.

---

## Closed by SM-*

### Closed by SM-K (Phase 0)

- Drizzle journal drift recovery: `_journal.json` tracked only 47 of 68 SQL files. Custom runner (`scripts/apply-migrations.mjs`) replaces drizzle-kit migrate and handles all 68 files idempotently via SHA-256 hash tracking in `_app_migrations`.
- SM-E2-ci inline mysql2 loops removed from `ci.yml` and `concurrency-proof.yml`; both now use `pnpm run test:db:bootstrap` (single step, all 68 migrations).
- Production deploy via `pnpm run db:push` no longer broken.

**Compatibility shim retained from SM-E2-ci.** The apply-migrations.mjs
runner inherits two behaviors from the SM-E2-ci inline mysql2 loop:
skipping idempotency errors (ER_TABLE_EXISTS_ERROR, ER_DUP_FIELDNAME,
ER_DUP_KEYNAME, ER_CANT_DROP_FIELD_OR_KEY) and stripping invalid
`AFTER` clauses on `ER_BAD_FIELD_ERROR`. Specifically,
`0061_vault_encryption_columns.sql` references
`prescriptions.pharmacist_note` which does not exist when 0061 runs.
SM-L Phase 4 (architecture cleanup) should audit drizzle/0050-0067
for invalid AFTER clauses and produce corrected migration files.

**Legacy partN_*.sql files skipped by the runner.** apply-migrations.mjs
and bootstrap-migrations-table.mjs skip files matching `part\d+_*.sql`
(part10_whatsapp.sql, part11_routing_rider.sql, part12_system_events.sql).
These contain only `CREATE TABLE IF NOT EXISTS` for tables that
drizzle-generated migrations 0019, 0020, and 0021 already create. The
part-files also use `CREATE INDEX IF NOT EXISTS` (Postgres syntax)
that MySQL rejects. Every other tool in the codebase
(`verify-migrations.mjs`, the original SM-E2-ci inline loop) similarly
filters by `NNNN_` pattern.

**Dead one-shot migration scripts to remove.**
scripts/migrate-part10.mjs, scripts/migrate-part11.mjs,
scripts/migrate-part12.mjs, and scripts/migrate-v10.mjs are dead
one-shot apply tools. Their content is fully covered by numbered
migrations (0019/0020/0021 for the part-files, 0010 for migrate-v10).
They are not invoked by CI, package.json scripts, or any runtime
code. SM-L Phase 4 should delete them along with the partN_*.sql
files in drizzle/.

**dbTestLifecycle.ts retired from drizzle-kit migrate (round 3).**
applyTestMigrations() now invokes scripts/apply-migrations.mjs.
drizzle-kit is no longer invoked anywhere in the codebase for
migration apply — only retained for schema TS type generation via
the drizzle:types script.

**mysql-db-lifecycle test assertion retired from Drizzle journal (round 4).**
server/mysql-db-lifecycle.integration.test.ts now verifies
_app_migrations rather than __drizzle_migrations. All active migration
apply and verification paths now consistently use the SM-K runner ledger.

### Closed by SM-Ω Phase 1

- Coverage measurement unblocked: `@vitest/coverage-v8` installed; real floor anchored in `vitest.config.ts`.
- PII write paths fully wired: `prescriptions.patientPhone` and `pharmacistNote` encrypt on write, decrypt on read; `getUserByPhone` uses HMAC-SHA256 `phoneHash` index for correctness under AES-GCM.
- Column widths fixed: `users.phone` and `prescriptions.patientPhone` widened to VARCHAR(500) via migrations 0075/0076.
- PII backfill script added: `scripts/pii-backfill.ts` handles users + prescriptions in batches.
- Capability grants: documented as by-design; `CAPABILITY_ROLE_DEFAULTS` provides full boot-time coverage.

### Closed by SM-N

- CSRF client wiring (P0): Client now sends `x-csrf-token` header on every tRPC call via `httpBatchLink.headers`. Cookie name: `__Host-csrf`. CSRF enforcement can now be promoted from `log_only` to `enforce` in production.
- Emergency stop middleware applied to `/api/trpc`: `createEmergencyStopMiddleware` inserted before tRPC mount; `readFlag()` blocks customer mutations when active; fails open if DB unreachable.

### Closed by SM-E (this PR)

- Family consent DOB gate passive — FIXED: migration 0064 adds `users.date_of_birth`; `assertConsentForScheduleSale()` will enforce once DOB is collected
- DSR SLA monitoring not automated — FIXED: `dsrSlaMonitor.ts` wired, inserts into `dsr_sla_monitor_log`, started at boot
- Retention worker not started at boot — FIXED: `startRetentionWorker()` wired in server startup
- CSRF middleware not wired — FIXED: `applyHttpSecurity()` now installs `csrfMiddleware` + `handleCsrfError`
- Schema file `system.ts` bloated (41 tables) — FIXED: split into `system_ops`, `system_comms`, `system_consumer` via barrel
- Intelligence/AI Eval Ledger phase-gating missing — FIXED: `assertPhaseAtLeast("scaled", ...)` in all 12 procedures; UI `PhaseGate` components added
- APP_PHASE feature flagging absent — FIXED: `featureFlags.ts` server + client, `PhaseProvider`, `PhaseGate`
- `notImplementedLifecycleResult` dead helper in `paymentGateway.ts` — REMOVED

### Closed by SM-C

- SBOM generation, Docker multi-stage build, Trivy scan CI
- Staging deploy workflow, release-please, backup/restore drill workflows
- Incident rehearsal scripts (5 scenarios), emergency-stop script
- Capacity snapshot, SLO coverage verifier, provider contract verifier, on-call rota validator
- Pharmacist SOP template, staff access roster template
- Realistic-data seed script
- Runbooks: incidents, deploy, backups, on-call, SLO coverage doc
- Migrations 0062-0063 (backup_drill_results, incident_rehearsal_log)

### Closed by SM-B

- CSRF middleware (added; was not wired until SM-E)
- CSP headers (now `enforce` mode by default)
- DPDP consent registry, DSR pipeline, family consent service
- Retention worker, breach notification generator
- Region assertion, DPDP operations runbook

### Closed by SM-A

- Stock atomicity P0 gaps, RBAC guards, CI hardening
- Schema/server/router structural splits

---

## Governance boundaries (must not be weakened)

- `stockInvariant`, reservation accounting, reconciliation truth
- Commercial truth, provider idempotency, refund reversal safeguards
- Prescription, H/H1/X, pharmacist, statutory, compliance gates
- AI assistive-only boundary — no regulated mutation authority
- PHI/PII/secret redaction, staff/admin gating for sensitive surfaces
- Migration safety: no destructive migrations without review and rollback proof

## Lesson: do not use feature branches for branch-protection rule tests (logged 2026-05-11)

Commits `e902ffc` and `cf4c3f0` ('test: branch protection check (will revert)') are now permanent in main's history after being pushed to test GitHub branch-protection rules. They are harmless (empty README edits) but create noise in `git log`. Future branch-protection or CI rule validation should use a dedicated throwaway branch (e.g. `chore/protection-test-YYYYMMDD`) that is deleted after the check, never a roadmap or feature branch that will be merged to main.
