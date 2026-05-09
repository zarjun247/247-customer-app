# Latest Main Validation Wave Gate

**Validation timestamp (UTC):** 2026-05-09T10:16:34Z  
**Branch:** `chore/latest-main-validation-wave-gate`  
**Latest main SHA inspected:** `200fafcc20451cc43e8d6272588ec7e26e12d9c8`  
**Remote refresh status:** Attempted `git fetch origin main --prune` and `git pull --rebase origin main`, but GitHub HTTPS access failed in this environment with `could not read Username for 'https://github.com': No such device or address`. This report is therefore the truth for the checked-out repository HEAD above, not proof that a newer private GitHub `main` commit does not exist.

> This is validation truth only; it does not implement missing production features.

## Baseline inspection

| Item | Result |
| --- | --- |
| Current branch | `chore/latest-main-validation-wave-gate` |
| Inspected SHA | `200fafcc20451cc43e8d6272588ec7e26e12d9c8` |
| Package manager | `pnpm 10.4.1` (`packageManager` pins `pnpm@10.4.1+sha512...`) |
| Node version used | `v24.15.0` |
| `TEST_DATABASE_URL` present | No; value was not printed |
| CI/governance scripts found | `scripts/ci-governance-guards.mjs`, `scripts/verify-migrations.mjs` |
| DB scripts found | `test:db:smoke`, `test:db:concurrency`, `test:mysql:concurrency` |

### Latest 10 commits at inspected HEAD

```text
200fafc Merge pull request #116 from zarjun247/codex/consolidate-mysql-concurrency-proof-tests
35f3d67 Add MySQL concurrency proof harness
4612cf8 Merge pull request #112 from zarjun247/codex/run-supply-chain-dependency-and-security-audit
1a8ce89 Merge pull request #111 from zarjun247/codex/add-codeowners-review-gates
33a51cb docs: add supply-chain and secret hygiene audits
0f39eb3 chore: add critical file codeowners gates
2699be7 Merge pull request #109 from zarjun247/codex/conduct-production-readiness-validation-pass
e8d5386 chore: validate latest main governance status
f7d0498 Merge pull request #107 from zarjun247/codex/create-migration-surgery-control-room
277e636 docs: add migration surgery control room
```

### Migration tail

```text
0034_prescription_vault_consent.sql
0035_refund_ledger.sql
0036_credit_note_lifecycle.sql
0037_invoice_snapshot.sql
0038_accounting_journal_batches.sql
0039_supplier_ageing_reconciliation.sql
0040_tally_export_proof.sql
0041_ocr_invoice_exceptions.sql
0042_whatsapp_notification_safety.sql
0043_privacy_staff_session.sql
0044_index_performance_audit.sql
0045_provider_webhook_events.sql
0046_commercial_event_ledger.sql
0047_worker_jobs.sql
0048_rbac_staff_session_governance.sql
part10_whatsapp.sql
part11_routing_rider.sql
part12_system_events.sql
relations.ts
schema.ts
```

### Package scripts available

```text
backup:db:dry-run
build
check
db:push
dev
env:validate
format
migrations:verify
release:gate
restore:db:dry-run
start
test
test:db:bootstrap
test:db:concurrency
test:db:smoke
test:mysql:concurrency
```

## Command result table

| Order | Command | Status | Notes |
| ---: | --- | --- | --- |
| Preflight | `git fetch origin main --prune` | Fail | GitHub HTTPS auth unavailable: `could not read Username for 'https://github.com': No such device or address`. |
| Preflight | `git pull --rebase origin main` | Fail | Same GitHub HTTPS auth limitation; no remote update proof. |
| Inspect | `git rev-parse HEAD` | Pass | `200fafcc20451cc43e8d6272588ec7e26e12d9c8`. |
| Inspect | `git log --oneline -10` | Pass | Latest 10 commits captured above. |
| Inspect | `ls drizzle | tail -20` equivalent via sorted file listing | Pass | Tail captured above; latest numbered migration is `0048`. |
| Inspect | `pnpm --version` | Pass | `10.4.1`. |
| Inspect | `node --version` | Pass | `v24.15.0`. |
| 1 | `pnpm install` | Pass | Lockfile already up to date. Warning: ignored build scripts for `@tailwindcss/oxide`, `esbuild`; run `pnpm approve-builds` if the project intends to allow them. |
| 2 | `pnpm run check` | Pass | TypeScript completed with exit code 0. |
| 3 | `pnpm test -- --runInBand` | Pass with skips | 84 files passed, 2 skipped; 490 tests passed, 12 skipped. DB lifecycle and MySQL concurrency tests skipped because `TEST_DATABASE_URL` is not set. OAuth missing-env diagnostic was emitted in an auth test but the suite passed. |
| 4 | `pnpm run build` | Pass with warnings | Build completed. Warnings: missing `%VITE_ANALYTICS_ENDPOINT%` and `%VITE_ANALYTICS_WEBSITE_ID%`, non-module analytics script cannot be bundled, and main JS chunk exceeds 500 kB after minification. |
| 5 | `node scripts/verify-migrations.mjs` | Pass | `Files: 49; numbered: 46; latest: 0048; Summary: 0 blocking issue(s), 0 warning(s).` |
| 6 | `node scripts/ci-governance-guards.mjs all` | Pass | `Governance/security scan passed: no blocked patterns found.` |
| 7 | `git diff --check` | Pass | No whitespace errors before docs. |
| 8 | `pnpm run test:db:smoke` | Skipped | Script exists and ran, but 1 test skipped because `TEST_DATABASE_URL` is not set. No DB-backed smoke proof claimed. |
| 9 | `pnpm run test:db:concurrency` | Skipped | Script exists and ran, but 11 tests skipped because `TEST_DATABASE_URL` is not set. No DB-backed race proof claimed. |

## Migration status

| Item | Status |
| --- | --- |
| Latest migration number | `0048` |
| Latest migration file | `0048_rbac_staff_session_governance.sql` |
| Duplicate numbered migration prefixes detected | No |
| Migration verifier | Green |
| Next migration number recommendation | Reserve `0049` for exactly one schema branch at a time. If provider runtime uses `0049`, reservation lifecycle must wait and use `0050`. |

## Governance scan status

**Status:** Green for the inspected tree.

`node scripts/ci-governance-guards.mjs all` exited 0 with: `Governance/security scan passed: no blocked patterns found.` No P0 fake-success/stub findings were reported by this scan.

## DB proof status

**Status:** P1 proof gap.

`TEST_DATABASE_URL` is missing in this environment. The DB smoke and DB concurrency scripts exist and were invoked, but they skipped their DB-backed tests. Skipped DB tests are not production proof and must not be represented as green DB validation.

| DB command | Status | Proof value |
| --- | --- | --- |
| `pnpm run test:db:smoke` | Skipped | None; requires `TEST_DATABASE_URL`. |
| `pnpm run test:db:concurrency` | Skipped | None; requires `TEST_DATABASE_URL`. |
| `pnpm run test:mysql:concurrency` | Available but not needed after `test:db:concurrency` was selected | Not assessed here. |

## Package/security status

A dependency and security audit appears in the inspected commit history (`Merge pull request #112 from zarjun247/codex/run-supply-chain-dependency-and-security-audit`), but `pnpm audit` was **not** run in this branch. Package/security vulnerability status is therefore not reassessed in this validation branch.

## Build warnings

- `%VITE_ANALYTICS_ENDPOINT%` is not defined for `index.html` substitution.
- `%VITE_ANALYTICS_WEBSITE_ID%` is not defined for `index.html` substitution.
- Analytics script using `%VITE_ANALYTICS_ENDPOINT%/umami` cannot be bundled without `type="module"`.
- `dist/public/assets/index-*.js` is larger than 500 kB after minification.

## Test skips

- `server/mysql-concurrency.integration.test.ts`: 11 skipped tests because `TEST_DATABASE_URL` is not set.
- `server/mysql-db-lifecycle.integration.test.ts`: 1 skipped test because `TEST_DATABASE_URL` is not set.

## Blockers

### P0

- None found by TypeScript, unit/integration suite, build, migration verifier, or governance scan for the inspected tree.
- Remote latest-main proof is incomplete because private GitHub fetch/pull could not authenticate in this environment. Treat this as an operational validation limitation before using this report as absolute GitHub-main truth.

### P1

- DB-backed smoke and concurrency proof is missing because `TEST_DATABASE_URL` is not configured.
- Dependency vulnerability status was not reassessed in this branch; use the dependency patch/audit branch or run a dedicated `pnpm audit` pass.

### P2

- Build emits analytics placeholder and chunk-size warnings.
- `pnpm install` reports ignored dependency build scripts pending `pnpm approve-builds` policy review.

## Safe next tasks

Parallel-safe, no-schema work is reasonable from this inspected tree because static validation, migration verification, and governance scan are green:

- OCR fake-path cleanup.
- Observability rebuild.
- Dependency patch/audit branch.
- Stale PR closure docs/control.
- Frontend/mobile audits.
- No-schema docs/control.

## Unsafe next tasks

- Any schema branch that does not first reserve the next migration number and confirm no active schema PR is using the same number.
- Running provider runtime and reservation lifecycle schema work in parallel.
- Claiming DB-backed launch readiness without running DB smoke and concurrency against a real `TEST_DATABASE_URL`.
- Claiming absolute latest GitHub `main` truth until remote access is authenticated and `origin/main` is refreshed.

## Production-readiness score after this validation

**7.5 / 10 for the inspected tree.** Static validation, migrations, and governance are green, but the score is capped because DB proof was skipped, package/security was not reassessed in this branch, build warnings remain, and remote latest-main refresh could not be proven from this environment.
