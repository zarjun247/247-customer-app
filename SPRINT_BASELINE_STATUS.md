SPRINT BASELINE STATUS

Repository: zarjun247/247-customer-app
Branch: sprint/production-readiness-integration
Latest SHA: 6686a6f

Migration tail: drizzle/0048_rbac_staff_session_governance.sql
Next valid migration number: 0049

Current repo score (conservative, documented): 7.4 / 10
Current production stage: Controlled internal pilot candidate (NOT race-mode production)

Confirmed merged capabilities (observed):
- Drizzle SQL migrations present up to 0048; idempotency migration (0026) and reservation lifecycle (0029) exist.
- Provider webhook table migration present (0045_provider_webhook_events.sql).
- Healthcheck and observability modules implemented (server/services/healthcheck.ts, server/services/observability.ts, health routes registered).
- Idempotency keys table and invoice/reservation sequences present in migrations.
- Governance and validation scripts present: scripts/verify-migrations.mjs, scripts/ci-governance-guards.mjs, scripts/check-runtime-placeholders.mjs.

Exact validation commands attempted in this environment and results (honest):
- pnpm install
  Result: failed locally — PowerShell error: "pnpm: The term 'pnpm' is not recognized as a name of a cmdlet, function, script file, or executable program." (pnpm not in PATH here)

- pnpm run check
  Result: not executed successfully due to pnpm missing (same error)

- pnpm test -- --runInBand
  Result: not executed successfully due to pnpm missing

- pnpm run build
  Result: not executed successfully due to pnpm missing

- node scripts/verify-migrations.mjs
  Result: not executed — PowerShell error: "node: The term 'node' is not recognized as a name of a cmdlet, function, script file, or executable program." (node not in PATH here)

- node scripts/ci-governance-guards.mjs all
  Result: not executed — node missing (same error)

- git diff --check
  Result: ran successfully (exit code 0) in this environment

Important contextual findings from static inspection (no runtime execution):
- Migrations: listed and numbered; latest prefix 0048. No duplicate prefixes visible in file listing.
- Reservation lifecycle migration present (0029_stock_reservation_truth.sql) and idempotency (0026_idempotency_reservations.sql).
- Provider webhook migration present (0045_provider_webhook_events.sql).
- Health/observability endpoints and checks implemented; health check includes migrations check and provider configuration checks.
- Governance scripts and provider contract matrix exist and codify that demo_skipped/provider_unconfigured must not be treated as successful — runtime code references these states widely.
- Many router/service handlers return { success: true } as normal success responses; a CI guard exists to detect placeholder-stubbed success paths when adjacent to TODO/placeholder markers.

Known P0 blockers (must fix before uncontrolled production):
1) DB-backed concurrency proof missing: production-like MySQL concurrency/integration tests are not runnable/verified here; TEST_DATABASE_URL is not present in environment. DB race and invoice/idempotency proof required.
2) Local validation environment missing (node/pnpm): cannot run official validation toolchain in this checkout here — blocks reproducible local proof and immediate CI smoke reproduction.
3) GitHub CI status and protected-branch checks not verifiable from this environment (no remote/GitHub auth); branch-protection and required checks must be enforced remotely.

Known P1 blockers:
- Some runtime paths may still contain placeholder language; CI guard scripts exist but were not executed here (node missing).
- Worker queue dead-letter/durable retry for provider syncs is incomplete (docs note DLQ not implemented).
- Backup/restore proof and full restore drills remain unproven.

Unresolved provider/runtime gaps:
- Provider adapters are coded to return non-success states (provider_unconfigured/demo_skipped) when unconfigured — good. But runtime wiring and real-provider proofs (Razorpay, WhatsApp, OCR, storage S3) require env-config and live integration tests.
- Durable worker queue and dead-letter handling for provider retries are not fully implemented.

Unresolved reservation truth gaps:
- Reservation lifecycle migration exists and code references durable reservations; however, high-concurrency integration tests against a production-like MySQL instance are still required to claim oversell-proof durability.

Unresolved observability gaps:
- Health endpoints exist; however live verification (e.g., provider real-health checks, worker queue metrics, SLO dashboards) needs a deployed environment and configured providers to assert readiness.

Unresolved DB-proof gaps:
- No DB concurrency smoke/tests executed in this environment (node/pnpm missing and TEST_DATABASE_URL absent). Scripts for test DB bootstrap exist (scripts/bootstrap-test-db.ts) but were not executed.

Dependency/security gaps:
- Local environment for validations (node/pnpm) not available here — must ensure CI and operator machines have pinned Node and pnpm versions matching packageManager.
- No secrets or obvious hard-coded credentials were detected in static scan results; governance scan script exists to detect such issues (not executed).

Exact recommended 7-mega-sprint execution order (priority-first):
1. Baseline CI & proof reproducibility: Ensure CI runs on protected branch with node/pnpm environment, required checks wired, and remote branch-protection enforced. Add ephemeral DB smoke in CI.
2. DB concurrency proofing: Run production-like MySQL concurrency tests for idempotency, invoice sequences, and reservation races; fix races and harden migrations.
3. Provider integration hardening: Wire real provider credentials in a staging infra, run end-to-end webhook/payment/notification/provider proofs and DLQ flows, ensure fail-closed behavior.
4. Observability & SLOs: Deploy healthchecks, worker metrics, alerting, and dashboards; verify readiness/liveness probes and recovery playbooks.
5. Backup/restore & migration safety: Full backup/restore exercise with migration rollback/forward verification and runbook.
6. RBAC & store-isolation: Finish router-level RBAC, store-scoped staff flows, and authorization proofs across APIs and admin UIs.
7. Final merge-captain proof pass and UAT: Run final proof-suite, close stale docs, verify no duplicate migrations, record CI-green, and obtain merge captain sign-off.

Most dangerous remaining production risk:
- Lack of DB-backed concurrency proof for reservations/invoice/idempotency under real MySQL load. This directly risks silent oversells, duplicate invoices, and financial inconsistency.

Next actions (short):
- Ensure CI environment provides Node and pnpm matching packageManager (pnpm@10.x, Node version per engines/typescript). Re-run the validation suite in CI and record outputs.
- Provision a production-like test MySQL and run the concurrency integration tests; resolve any failures before claiming production readiness.

Notes/caveats:
- A local attempt to run validations failed here due to missing pnpm/node; recorded above verbatim. The repository contains many governance artifacts and appears intentionally hardened, but remote CI/DB proofs are required to convert assertions into verifiable proof.

Generated by automated baseline audit on branch sprint/production-readiness-integration at SHA 6686a6f.

