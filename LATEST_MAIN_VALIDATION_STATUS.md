# LATEST_MAIN_VALIDATION_STATUS

Validation status for the latest-main migration/governance control pass on 2026-05-09.

## Scope and inspected baseline

| Item | Value |
| --- | --- |
| Validation branch | `chore/latest-main-validation-governance-cleanup` |
| Latest main SHA inspected | `f7d049825eb17922e9fa0c47326620e26a396186` |
| Latest merged PR visible in local history | PR `#107` — `Merge pull request #107 from zarjun247/codex/create-migration-surgery-control-room` |
| Remote refresh attempt | `git pull --rebase origin main` failed because this checkout has no `origin` remote configured. The public GitHub API returned `404` for unauthenticated PR inspection, so live GitHub state was not available in this environment. |
| Runtime business logic changed in this pass | No. Only governance scanner false-positive handling and control/status docs were changed. |
| Migrations changed in this pass | No. No `drizzle/*.sql`, Drizzle metadata, or schema files were edited. |

## Command-by-command results

| Command | Result | Notes |
| --- | --- | --- |
| `git rev-parse HEAD` | Passed | Reported `f7d049825eb17922e9fa0c47326620e26a396186` before validation edits. |
| `git log --oneline -10` | Passed | Latest visible merge was PR `#107`; recent visible merges include PRs `#105`, `#102`, `#100`, `#99`, and `#98`. |
| `git pull --rebase origin main` | Failed / environment limitation | No `origin` remote is configured in this checkout; remote-main freshness could not be proven from GitHub. |
| `pnpm install` | Passed with warning | Lockfile was already up to date. pnpm warned that build scripts for `@tailwindcss/oxide` and `esbuild` are ignored until approved. |
| `pnpm run check` | Passed | TypeScript completed with exit code 0. |
| `pnpm test -- --runInBand` | Passed with DB skip | 84 test files passed and 1 MySQL lifecycle integration test file skipped because `TEST_DATABASE_URL` is not set; 490 tests passed and 1 skipped. |
| `pnpm run build` | Passed with warnings | Vite warned that `%VITE_ANALYTICS_ENDPOINT%` and `%VITE_ANALYTICS_WEBSITE_ID%` are not defined, that the analytics script cannot be bundled without `type="module"`, and that some chunks exceed 500 kB. Build completed. |
| `node scripts/verify-migrations.mjs` | Passed | Reports 49 SQL files, 46 numbered migrations, latest numbered migration `0048`, 0 blocking issues, and 0 warnings. |
| `node scripts/ci-governance-guards.mjs all` | Failed before cleanup; passed after cleanup | Before cleanup it reported 4 false-positive/stale-scanner findings. After the narrow scanner cleanup, it passed with no blocked patterns found. |
| `git diff --check` | Passed | No whitespace errors detected. |
| `pnpm run test:db:smoke` | Passed with DB skip | The MySQL lifecycle integration test skipped because `TEST_DATABASE_URL` is not set. |
| `pnpm run test:db:concurrency` | Not available | No `test:db:concurrency` script exists in `package.json`. |
| `pnpm run test:mysql:concurrency` | Not available | No `test:mysql:concurrency` script exists in `package.json`. |

## Migration status

| Item | Status |
| --- | --- |
| Duplicate migration prefixes | None detected by `node scripts/verify-migrations.mjs` or the governance migration scan. |
| Expected migration tail | Present: `0045_provider_webhook_events.sql`, `0046_commercial_event_ledger.sql`, `0047_worker_jobs.sql`, `0048_rbac_staff_session_governance.sql`. |
| Latest numbered migration | `0048_rbac_staff_session_governance.sql`. |
| Next reserved migration number | `0049`. |
| Migration/schema changes in this validation PR | None. |

## Governance scan status

| Stage | Status | Notes |
| --- | --- | --- |
| Before cleanup | Failed | 4 findings: one scanner self-match in `scripts/check-runtime-placeholders.mjs`, and three stock mutation scanner-pattern self-matches in `server/services/stockTruthCertification.ts`. |
| Cleanup action | Narrow scanner false-positive fix | The governance scanner now treats governance rule-definition scripts as scanner paths and recognizes the existing stock truth certification scanner service as an approved stock scanner path. |
| After cleanup | Passed | `Governance/security scan passed: no blocked patterns found.` |

## DB-backed proof status

DB-backed proof skipped; production race-mode proof not claimed.

`TEST_DATABASE_URL` is not set in this environment. The available DB smoke command ran but skipped its MySQL integration test. No DB-backed concurrency script is currently present in `package.json`, so no real MySQL race-mode proof was executed.

## Build warnings

- Vite analytics placeholders are unset in this environment: `%VITE_ANALYTICS_ENDPOINT%` and `%VITE_ANALYTICS_WEBSITE_ID%`.
- Vite warned that the analytics script in `index.html` cannot be bundled without `type="module"`.
- Vite reported chunks larger than 500 kB after minification.
- `pnpm install` warned that build scripts for `@tailwindcss/oxide` and `esbuild` are ignored until approved.

## Test warnings and skips

- `pnpm test -- --runInBand` skipped `server/mysql-db-lifecycle.integration.test.ts` because `TEST_DATABASE_URL` is not set.
- `pnpm run test:db:smoke` also skipped the same DB lifecycle integration test for the same reason.
- `server/auth.phone.test.ts` logged that `OAUTH_SERVER_URL` is not configured; the test suite still passed.

## Exact blockers remaining

1. Remote GitHub `main` freshness and open PR state were not authenticated or inspectable from this container.
2. DB-backed lifecycle proof did not run because `TEST_DATABASE_URL` is missing.
3. DB-backed concurrency proof did not run because no concurrency test script is available in `package.json`.
4. Provider runtime proof is not claimed by this validation pass.
5. Branch protection / required-check enforcement is not proven from this environment.
6. Backup/restore proof remains dry-run/status-level unless executed in controlled infrastructure.
7. Salsette real-store reconciliation and regulated/H1/Rx release proof remain open production-readiness blockers.

## Explicit production score estimate

Current estimated production readiness after this validation pass: **8.3 / 10**.

This is a control-plane estimate only. It is not a production certification because DB-backed race proof, provider runtime proof, live CI/branch protection proof, backup/restore execution proof, Salsette reconciliation, and regulated/H1/Rx release evidence are still incomplete.

## Not production ready until...

- No stubs, placeholders, or fake provider/payment success remain in runtime paths.
- Duplicate migrations remain absent on authenticated latest GitHub `main`.
- GitHub CI is green on protected `main` and this validation PR.
- Branch protection is enforced.
- DB-backed concurrency proof is green against a production-like MySQL database.
- Provider runtime proof is green for payment, webhook, WhatsApp/notification, accounting/export, and other configured external providers.
- Healthcheck/observability is live and verified.
- Backup/restore proof is complete beyond dry-run command generation.
- Salsette real-store reconciliation is complete.
- Regulated/H1/Rx release is proven across all production channels.

## Exact safe next prompts

1. **DB proof prompt:** provide `TEST_DATABASE_URL` for a disposable production-like MySQL database and run `pnpm run test:db:smoke` plus a consolidated DB concurrency harness once added.
2. **Concurrency harness prompt:** rebuild one consolidated MySQL concurrency proof from PR `#89`/`#90` on latest main without schema changes unless the race proof exposes a real gap.
3. **GitHub control prompt:** using authenticated `gh`, refresh open PR mergeability, close superseded/stale PRs, and confirm branch protection required checks.
4. **Provider runtime proof prompt:** run real provider/webhook contract checks without demo success or provider-unconfigured success claims.
5. **Observability prompt:** rebuild likely useful healthcheck/observability PR work from latest main if it remains current and migration-free.
