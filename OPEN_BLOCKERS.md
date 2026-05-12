# OPEN_BLOCKERS.md

Updated: 2026-05-12 (SM-E).

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

| Blocker | Details |
|---------|---------|
| CSRF client wiring (P0) | `CSRF_ENFORCEMENT` defaults to `log_only` — blocks are skipped with a console warning. Required before setting `enforce`: (1) `generateCsrfToken` tRPC endpoint that returns a token, (2) client-side header injection (axios/fetch interceptor sends `x-csrf-token` on every mutation), (3) integration test asserting that a mutation without the header is rejected in enforce mode. Until these land, CSRF protect is advisory only. |

### P1 Controlled rollout blockers

| Blocker | Status |
|---------|--------|
| Hosted CI DB observation (GitHub Actions `DB Concurrency Proof` run) | Wired, not yet archived |
| Multi-store runtime data proof | Required before second store |
| Supplier invoice duplicate backfill/migration approval | Required before hard uniqueness constraint. Target key: supplier + store + invoice number. A business-review backfill must be completed before `ALTER TABLE ... ADD UNIQUE`. |
| Accounting/compliance SOP evidence | Named owners + signed checklist required |

### Infrastructure / wiring follow-ups

**Outbox dispatcher** — `startOutboxDispatcher()` not called at boot. Side-effect handlers not registered. Three procedures migrated (`sale.confirm`, `purchase.commitInvoice`, `payment.verifyPayment`); ~30 others still use direct DB writes. Multi-node requires `SELECT ... FOR UPDATE SKIP LOCKED`.

**Reservation expiry worker** — `startReservationExpiryWorker()` not wired at boot. `cleanupExpiredLocks()` not scheduled. Old `stockReservations` table coexists with new `reservations`/`reservation_lines` — write paths need incremental migration.

**PII encryption** — `customerPiiService.ts` and `prescriptionPiiService.ts` ship helpers but no write path calls them yet. Requires write-path wiring + data backfill migration atomically.

**SMTP/SES breach notification** — `breachNotificationDispatcher.ts` wired; generates correct payload. No email transport configured. Set `BREACH_NOTIFY_RECIPIENT_EMAIL` in production env. See [FUTURE_FEATURES.md](./FUTURE_FEATURES.md).

**On-call rota** — JSON-backed (`server/data/oncall-rota.json`). Must migrate to DB table before multi-node deployment. PagerDuty integration is fire-and-forget with no retry.

**Dead-letter retry** — marks `reviewStatus="replayed"` but does not re-enqueue original payload. Actual replay requires worker reading `rawPayload`.

**CSP mode** — set `CSP_MODE=report_only` in staging before `enforce`. Tighten `unsafe-inline` directives once Vite nonce injection is confirmed.

**Rate limit store** — in-memory; not shared across nodes. Set `API_RATE_LIMIT_BACKEND=redis` before multi-node production.

**Capability grants** — `capability_grants` empty at first boot; `capabilityProcedure` falls back to role defaults. Explicit grants must be issued via `security.grantCapability` before relying on per-user enforcement.

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
