# LATEST_MAIN_VALIDATION_STATUS

Validation status for migration sequence collision surgery on 2026-05-09.

## Scope

| Item | Value |
| --- | --- |
| Branch | `fix/migration-sequence-collision-surgery` |
| Local main-equivalent SHA inspected | `aef2de3` |
| Corrected latest migration | `0048_rbac_staff_session_governance.sql` |
| Next reserved migration number | `0049` |
| Migrations added | None |
| Migrations renamed | `0045_commercial_event_ledger.sql` → `0046_commercial_event_ledger.sql`; `0046_worker_jobs.sql` → `0047_worker_jobs.sql`; `0046_rbac_staff_session_governance.sql` → `0048_rbac_staff_session_governance.sql` |

## Command results

| Command | Result | Notes |
| --- | --- | --- |
| `git fetch origin main` / `git checkout main` / `git pull --rebase origin main` | Failed before coding due environment checkout shape | No `origin` remote and no local `main` branch are configured. Work proceeded from local main-equivalent SHA `aef2de3`. |
| `node scripts/verify-migrations.mjs` | Passed | Reports 49 SQL files, 46 numbered migrations, latest `0048`, 0 blocking issues, 0 warnings. |
| `node scripts/ci-governance-guards.mjs all` | Failed | Migration duplicate finding is fixed, but full governance scan reports pre-existing provider/stock findings in `scripts/check-runtime-placeholders.mjs` and `server/services/stockTruthCertification.ts`, outside this migration-only scope. |
| `pnpm install` | Passed | Completed with existing pnpm warning that build scripts for `@tailwindcss/oxide` and `esbuild` are ignored until approved. |
| `pnpm run check` | Passed | TypeScript check completed successfully. |
| `pnpm test -- --runInBand` | Passed with DB skip | 84 test files passed, 1 MySQL lifecycle integration file skipped because `TEST_DATABASE_URL` is not set; 490 tests passed, 1 skipped. |
| `pnpm run build` | Passed with Vite warnings | Existing analytics env placeholder and chunk-size warnings were emitted; build completed. |
| `git diff --check` | Passed | No whitespace errors. |

## DB-backed proof caveat

Fresh DB migration proof and existing DB upgrade proof are not claimed unless a `TEST_DATABASE_URL` or equivalent existing database URL is provided and the DB-backed lifecycle smoke is run successfully. No fake green DB claim is made by this status file.

## Safe-to-merge assessment at this checkpoint

Migration prefix collisions are repaired statically. Static migration verification, TypeScript, unit/guard tests, build, and diff whitespace checks pass. Safe-to-merge is conditional on reviewer acceptance that the full governance scan still reports pre-existing out-of-scope provider/stock findings; migration duplicate findings are fixed.
