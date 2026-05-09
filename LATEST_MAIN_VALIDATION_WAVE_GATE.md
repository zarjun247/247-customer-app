# Latest Main Validation Wave Gate

**Date/time (UTC):** 2026-05-09T10:17:03Z  
**Branch:** `chore/latest-main-validation-wave-gate`  
**Inspected SHA:** `200fafcc20451cc43e8d6272588ec7e26e12d9c8`  
**Remote freshness note:** A fetch/pull from `https://github.com/zarjun247/247-customer-app.git` was attempted first, but this environment could not authenticate to GitHub (`fatal: could not read Username for 'https://github.com': No such device or address`). This report is therefore a clean validation of the local checked-out main-equivalent SHA above, not independently authenticated proof that GitHub `main` had no newer commits at validation time.

> This is validation truth only; it does not implement missing production features.

## Baseline capture

### Latest 10 commits at inspected SHA

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
meta
migrations
part10_whatsapp.sql
part11_routing_rider.sql
part12_system_events.sql
relations.ts
schema.ts
```

### Runtime/tooling assumptions observed

| Item | Observed value |
| --- | --- |
| `node --version` | `v24.15.0` |
| `pnpm --version` | `10.4.1` |
| `packageManager` | `pnpm@10.4.1+sha512.c753b6c3ad7afa13af388fa6d808035a008e30ea9993f58c6663e2bc5ff21679aa834db094987129aa4d488b86df57f7b634981b2f827cdcacc698cc0cfb88af` |
| `engines` | Not specified in `package.json` |
| `TEST_DATABASE_URL` | Not present in environment; value was not printed |
| `scripts/verify-migrations.mjs` | Present |
| `scripts/ci-governance-guards.mjs` | Present |

### Package scripts available

```text
dev: NODE_ENV=development tsx watch server/_core/index.ts
build: vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
start: NODE_ENV=production node dist/index.js
check: tsc --noEmit
format: prettier --write .
test: vitest run
db:push: drizzle-kit generate && drizzle-kit migrate
test:db:bootstrap: tsx scripts/bootstrap-test-db.ts
test:db:smoke: vitest run server/mysql-db-lifecycle.integration.test.ts
env:validate: node scripts/validate-production-env.mjs
migrations:verify: node scripts/verify-migrations.mjs
release:gate: node scripts/release-gate.mjs
backup:db:dry-run: node scripts/backup-db.mjs --dry-run
restore:db:dry-run: node scripts/restore-db-drill.mjs --dry-run
test:db:concurrency: vitest run server/mysql-concurrency.integration.test.ts
test:mysql:concurrency: pnpm run test:db:concurrency
```

## Command result table

| # | Command | Result | Notes |
| --- | --- | --- | --- |
| 0 | `git fetch origin main --prune` / `git pull --rebase origin main` | Fail | GitHub authentication was unavailable in this environment. This prevents independent freshness proof for remote `main`. |
| A1 | `git rev-parse HEAD` | Pass | `200fafcc20451cc43e8d6272588ec7e26e12d9c8`. |
| A2 | `git log --oneline -10` | Pass | Latest 10 commits captured above. |
| A3 | `ls drizzle | tail -20` | Pass | Tail captured above; numbered migration tail ends at `0048_rbac_staff_session_governance.sql`. |
| A4 | `pnpm --version` | Pass | `10.4.1`. |
| A5 | `node --version` | Pass | `v24.15.0`. |
| 1 | `pnpm install` | Pass | Lockfile was up to date. Warning: ignored build scripts for `@tailwindcss/oxide` and `esbuild`; no lockfile/package edits were made. |
| 2 | `pnpm run check` | Pass | TypeScript completed with exit code 0. |
| 3 | `pnpm test -- --runInBand` | Pass with skips | 84 test files passed, 2 skipped; 490 tests passed, 12 skipped. DB-backed smoke/concurrency tests skipped because `TEST_DATABASE_URL` is not set. |
| 4 | `pnpm run build` | Pass with warnings | Build succeeded. Warnings: missing `%VITE_ANALYTICS_ENDPOINT%`, missing `%VITE_ANALYTICS_WEBSITE_ID%`, non-module script cannot be bundled, and chunks larger than 500 kB. |
| 5 | `node scripts/verify-migrations.mjs` | Pass | Files: 49; numbered: 46; latest: `0048`; 0 blocking issues; 0 warnings. |
| 6 | `node scripts/ci-governance-guards.mjs all` | Pass | `Governance/security scan passed: no blocked patterns found.` |
| 7 | `git diff --check` | Pass | No whitespace errors. |
| 8 | `pnpm run test:db:smoke` | Skipped | Script exists, but test skipped because `TEST_DATABASE_URL` is not set. No DB-backed smoke proof claimed. |
| 9 | `pnpm run test:db:concurrency` | Skipped | Script exists, but 11 tests skipped because `TEST_DATABASE_URL` is not set. No DB-backed race proof claimed. |

## Migration status

| Item | Status |
| --- | --- |
| Latest migration number | `0048` |
| Latest migration file | `0048_rbac_staff_session_governance.sql` |
| Duplicate numbered migration prefixes detected | No |
| Verification command | `node scripts/verify-migrations.mjs` passed |
| Next migration number recommendation | Reserve `0049` for exactly one schema branch at a time. Provider runtime should take `0049` first if it lands before reservation lifecycle; reservation lifecycle must then use `0050`. |
| Migrations changed in this branch | No |
| Schema changed in this branch | No |

## Governance scan status

**Status:** Green for the inspected tree.

`node scripts/ci-governance-guards.mjs all` exited 0 and reported: `Governance/security scan passed: no blocked patterns found.`

No P0 fake-success/stub findings were reported by the governance scan in this validation pass.

## DB proof status

**Status:** Skipped due missing `TEST_DATABASE_URL`.

- `TEST_DATABASE_URL` was not present in the environment; its value was not printed.
- `pnpm run test:db:smoke` script exists but skipped its single integration test.
- `pnpm run test:db:concurrency` script exists but skipped 11 integration tests.
- Skipped DB tests are a P1 proof gap and are not green DB-backed proof.

## Package/security status

- `pnpm audit` was not run in this branch.
- Dependency vulnerability status is not assessed in this branch.
- The commit history includes a prior supply-chain/security-audit docs branch merge, but this validation does not reuse that as current package-security truth.

## Build warnings

`pnpm run build` succeeded with these warnings:

- `%VITE_ANALYTICS_ENDPOINT%` is not defined in env variables found in `/index.html`.
- `%VITE_ANALYTICS_WEBSITE_ID%` is not defined in env variables found in `/index.html`.
- `<script src="%VITE_ANALYTICS_ENDPOINT%/umami">` in `/index.html` cannot be bundled without `type="module"`.
- Some chunks are larger than 500 kB after minification.

## Test skips

- `server/mysql-db-lifecycle.integration.test.ts`: 1 skipped test because `TEST_DATABASE_URL` is not set.
- `server/mysql-concurrency.integration.test.ts`: 11 skipped tests because `TEST_DATABASE_URL` is not set.
- Overall full-suite result: 84 test files passed, 2 skipped; 490 tests passed, 12 skipped.

## Blockers

### P0 blockers

- None found by TypeScript, unit/static test suite, build, migration verification, or governance scan for the inspected tree.

### P1 blockers / proof gaps

- Remote freshness proof gap: GitHub `main` fetch/pull could not be authenticated in this environment, so this report cannot prove no newer remote commits existed after `200fafcc20451cc43e8d6272588ec7e26e12d9c8`.
- DB proof gap: `TEST_DATABASE_URL` is missing, so MySQL smoke and concurrency integration tests skipped. This is not production DB proof.
- Package/security gap: `pnpm audit` was not run in this branch; vulnerability status is not assessed here.

### P2 issues / warnings

- Build emitted analytics placeholder warnings.
- Build emitted large chunk warning for the main JavaScript bundle.
- `pnpm install` emitted ignored-build-script warnings for `@tailwindcss/oxide` and `esbuild`.

## Safe next tasks

Safe if they remain no-schema or coordinate migrations explicitly:

- OCR fake-path cleanup.
- Observability rebuild.
- Dependency patching / current package audit.
- Stale PR closure docs/control.
- Frontend/mobile audits.
- No-schema docs/control tasks.
- DB proof task after providing `TEST_DATABASE_URL`.

## Unsafe next tasks

Unsafe without explicit migration coordination:

- Running provider runtime schema work in parallel with reservation lifecycle schema work.
- Any branch adding `0049` while another active schema branch may also add `0049`.
- Claiming DB-backed production proof while `TEST_DATABASE_URL` is missing or DB tests are skipped.
- Claiming dependency/security green based on this branch without running `pnpm audit` or an equivalent current audit.

## Production-readiness score after this validation

**Score: 7.5/10 for the inspected SHA.**

Rationale: static validation, build, migration verification, and governance scan are green; however, the gate is not 10/10 because DB-backed proof skipped, package/security was not reassessed in this branch, build warnings remain, and this environment could not independently prove GitHub remote freshness.
