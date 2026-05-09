# LATEST_MAIN_VALIDATION_STATUS

Validation/proof status for latest local main-equivalent after migration-collision surgery claims, schema PR freeze, stale PR triage, branch-protection proof, and migration-control docs.

## Validation metadata

| Item | Value |
| --- | --- |
| Branch | `chore/post-migration-latest-main-validation-proof` |
| Validation date/time | `2026-05-09 05:02:02 UTC` |
| Latest main SHA inspected | `aef2de345c06fce30a298e4a0e195a9ae4039462` |
| Latest merged PR visible locally | `#99` — `Merge pull request #99 from zarjun247/codex/certify-stock-mutation-gateways-and-reporting` |
| Pull/rebase status | `git fetch origin main --prune` could not run because this checkout has no configured `origin` remote; validation used the current local main-equivalent checkout at SHA `aef2de345c06fce30a298e4a0e195a9ae4039462`. |
| Live GitHub PR inspection | Blocked: no `gh` CLI installed, no git remote configured, and unauthenticated GitHub API request to `zarjun247/247-customer-app` returned `404 Not Found`. Open-PR status below is therefore based on requested PR numbers plus local docs/history only. |

## Pre-validation findings

| Check | Result | Evidence / notes |
| --- | --- | --- |
| Latest local main SHA | Pass | `git rev-parse HEAD` returned `aef2de345c06fce30a298e4a0e195a9ae4039462`. |
| Latest merged PR | Pass | `git log --merges -1 --oneline` returned `aef2de3 Merge pull request #99 from zarjun247/codex/certify-stock-mutation-gateways-and-reporting`. |
| Migration surgery merged | Fail | Latest `drizzle/*.sql` still contains duplicate numbered prefixes `0045` and `0046`; migration surgery is not proven complete on this checkout. |
| Drizzle SQL inventory | Fail | 49 SQL files total; 46 numbered files; duplicate prefixes remain. |
| Duplicate migration prefixes | Fail | Duplicate `0045`: `0045_commercial_event_ledger.sql`, `0045_provider_webhook_events.sql`; duplicate `0046`: `0046_rbac_staff_session_governance.sql`, `0046_worker_jobs.sql`. |
| Next reserved migration number | Blocked | Tentative next number after latest visible prefix is `0047`, but it must not be used until the duplicate `0045`/`0046` P0 migration collision is resolved and `MIGRATION_AUDIT_STATUS.md` is updated by the repair branch. |
| Validation scripts inspected | Pass | `scripts/verify-migrations.mjs` checks duplicate prefixes/destructive SQL; `scripts/ci-governance-guards.mjs` includes duplicate migration-name governance checks. |
| Schema-changing PR freeze | Active | Because migration verification fails, schema branches remain frozen/rebuild-only. |

## Required validation command table

| # | Command | Result | Notes |
| --- | --- | --- | --- |
| 1 | `pnpm install` | Pass with warnings | Completed successfully. Warning: ignored build scripts for `@tailwindcss/oxide` and `esbuild`; Node emitted `[DEP0169]` `url.parse()` deprecation warning. |
| 2 | `pnpm run check` | Pass | TypeScript completed with exit code 0. |
| 3 | `pnpm test -- --runInBand` | Fail | 82 test files passed, 2 failed, 1 skipped; 488 tests passed, 2 failed, 1 skipped. Failures are duplicate migration-prefix guards. |
| 4 | `pnpm run build` | Pass with warnings | Build completed. Vite warned that analytics env placeholders are undefined, script cannot be bundled without `type="module"`, and some chunks exceed 500 kB. |
| 5 | `node scripts/verify-migrations.mjs` | Fail | Blocking duplicate migration numbers `0045` and `0046`; 2 blocking issues, 0 warnings. |
| 6 | `node scripts/ci-governance-guards.mjs all` | Fail | 8 findings: 4 migration-risk duplicates, 3 stock-mutation-risk scanner hits in `server/services/stockTruthCertification.ts`, and 1 provider-risk scanner hit in `scripts/check-runtime-placeholders.mjs`. No runtime patches made in this proof PR. |
| 7 | `git diff --check` | Pass | No whitespace errors. |
| 8 | `pnpm run test:db:smoke` | Skipped by test harness | Command exited 0, but the only MySQL lifecycle integration test was skipped because `TEST_DATABASE_URL` is not set. This is a P1 proof gap, not a P0 code failure. |
| 9 | DB concurrency script | Skipped | No `test:db:concurrency`, `test:mysql:concurrency`, or equivalent concurrency script is present in `package.json`; `TEST_DATABASE_URL` is also missing. |

## Exact failure logs captured

### `pnpm test -- --runInBand`

```text
FAIL  server/database-index-audit.guard.test.ts > database index audit migration guards > does not duplicate a migration number
AssertionError: expected [ '0045', '0046' ] to deeply equal []

FAIL  server/migration-smoke.guard.test.ts > migration smoke guard > has unique numbered migration prefixes
AssertionError: expected 44 to be 46 // Object.is equality

Test Files  2 failed | 82 passed | 1 skipped (85)
Tests  2 failed | 488 passed | 1 skipped (491)
```

### `node scripts/verify-migrations.mjs`

```text
Migration verification for drizzle
Files: 49; numbered: 46; latest: 0046
FAIL Duplicate migration number 0045: 0045_commercial_event_ledger.sql and 0045_provider_webhook_events.sql
FAIL Duplicate migration number 0046: 0046_rbac_staff_session_governance.sql and 0046_worker_jobs.sql
Summary: 2 blocking issue(s), 0 warning(s).
```

### `node scripts/ci-governance-guards.mjs all`

```text
Governance/security scan failed with 8 finding(s):
- [provider-risk] scripts/check-runtime-placeholders.mjs:9 Fake/stub/mock production success language found.
- [stock-mutation-risk] server/services/stockTruthCertification.ts:27 Direct stock mutation outside an allowed stock/reservation service.
- [stock-mutation-risk] server/services/stockTruthCertification.ts:28 Direct stock mutation outside an allowed stock/reservation service.
- [stock-mutation-risk] server/services/stockTruthCertification.ts:29 Direct stock mutation outside an allowed stock/reservation service.
- [migration-risk] drizzle/0045_commercial_event_ledger.sql:1 Duplicate Drizzle migration number 0045.
- [migration-risk] drizzle/0045_provider_webhook_events.sql:1 Duplicate Drizzle migration number 0045.
- [migration-risk] drizzle/0046_rbac_staff_session_governance.sql:1 Duplicate Drizzle migration number 0046.
- [migration-risk] drizzle/0046_worker_jobs.sql:1 Duplicate Drizzle migration number 0046.
```

## DB-backed test status

| DB-backed check | Status | Notes |
| --- | --- | --- |
| MySQL lifecycle smoke | Skipped by harness | `TEST_DATABASE_URL` missing; command exited 0 with one skipped file/test. |
| MySQL concurrency proof | Skipped | No matching concurrency script is present in `package.json`, and `TEST_DATABASE_URL` is missing. |
| DB-backed production/concurrency claim | Not claimed | This PR does not claim DB-backed proof or race-mode production readiness. |

## Migration verification result

**Failed.** Duplicate numbered migration prefixes remain in `drizzle/*.sql`:

- `0045_commercial_event_ledger.sql`
- `0045_provider_webhook_events.sql`
- `0046_rbac_staff_session_governance.sql`
- `0046_worker_jobs.sql`

This is a **P0 migration blocker**. This validation branch did not rename migrations because the requested scope is proof/status only and migration surgery should happen in a dedicated P0 repair branch if not already merged elsewhere.

## Governance scan result

**Failed.** Governance/security scan reported 8 findings:

- P0 migration-risk findings for duplicate `0045`/`0046` migration prefixes.
- P1 governance follow-up for scanner findings in `server/services/stockTruthCertification.ts` and `scripts/check-runtime-placeholders.mjs`; this proof branch did not change runtime stock/provider logic.

## Current open PR risk summary

Live open PR inspection was not available in this environment. Until maintainers verify GitHub state, treat the following requested PRs as rebuild-only/do-not-merge-directly:

| PR / group | Status | Required handling |
| --- | --- | --- |
| `#88` reservation lifecycle | Rebuild-only | Rebuild from latest main after P0 migration collision is fixed; do not merge directly. |
| `#89` / `#90` MySQL concurrency harness | Consolidate | Consolidate into one latest-main DB proof branch after core validation and migration verification are green. |
| `#91` observability | Salvage/rebuild if still open | Safe to prioritize after P0 migration repair if it remains docs/test/observability scoped. |
| `#94` / `#95` / `#96` schema branches | Frozen | Must wait for duplicate-prefix repair; must use the next migration number reserved in `MIGRATION_AUDIT_STATUS.md` after repair. |
| Older stale PRs | Do-not-merge | Keep stale branches closed or rebuild unique work from latest main. |

## Stale PR status

Stale PR policy remains active: stale runtime/schema/payment/stock/reservation/provider/legal/offline branches must not merge raw. Unique work should be salvaged by rebuilding from latest main only after the P0 migration collision is resolved and validation is rerun.

## Schema freeze status

Schema-changing PRs remain **frozen/rebuild-only** because migration verification failed. No new migrations should be added until duplicate `0045`/`0046` prefixes are repaired and the next reserved number is recorded.

## Current P0 / P1 / P2 risks

| Severity | Risk | Status / next action |
| --- | --- | --- |
| P0 | Duplicate migration prefixes `0045` and `0046` | Blocker. Create `fix/p0-migration-prefix-collision-latest-main` or equivalent dedicated migration surgery branch. |
| P0 | Full test suite failure | Caused by duplicate migration-prefix guards. Rerun after migration repair. |
| P0 | Migration verification failure | Caused by duplicate `0045`/`0046` prefixes. |
| P1 | DB-backed smoke/concurrency proof gap | `TEST_DATABASE_URL` missing and no concurrency script present. Add/provide DB proof only after P0 migration repair. |
| P1 | Governance scan findings outside migration duplicates | Scanner flags stock/provider-risk patterns; should be reviewed in a dedicated governance branch without broad runtime changes from this proof PR. |
| P2 | Build warnings | Vite analytics placeholder and large chunk warnings remain non-blocking for this proof pass. |
| P2 | Live open PR state not verified | No remote/`gh` access; maintainers should run authenticated PR-state inspection. |

## Current readiness score

| Category | Score | Rationale |
| --- | --- | --- |
| Code maturity | 7.0 / 10 | TypeScript and build pass, but test suite is red due to migration collision. |
| Migration hygiene | 2.0 / 10 | Duplicate numbered migrations remain; migration verification fails. |
| CI/governance hygiene | 5.0 / 10 | Validation scripts exist and correctly catch blockers; governance scan is red. |
| Proof maturity | 4.0 / 10 | Core commands were run and documented, but DB-backed proof is skipped and migrations are blocked. |
| Investor demo readiness | 6.0 / 10 | Build passes, but demo should clearly disclose migration/test blockers. |
| Controlled pilot readiness | 3.0 / 10 | Not ready until P0 migration and test failures are resolved and DB proof is added. |
| Multi-store beta readiness | 2.0 / 10 | Not ready without green tests, migration hygiene, and DB concurrency proof. |
| Race-mode production readiness | 0.0 / 10 | Not claimed; blocked by P0 migration/test failures and missing DB-backed concurrency proof. |

## Current launch mode

| Mode | Status |
| --- | --- |
| Investor demo | Conditionally possible only with explicit blocker disclosure; not a green certification. |
| Controlled pilot | Blocked. |
| Multi-store beta | Blocked. |
| Race-mode production | Blocked / not claimed. |

## Next recommended prompts

1. **P0 migration collision repair:** create a dedicated branch to resolve duplicate `0045`/`0046` prefixes, update `MIGRATION_AUDIT_STATUS.md` with the next reserved number, and rerun `pnpm test -- --runInBand`, `node scripts/verify-migrations.mjs`, and `node scripts/ci-governance-guards.mjs all`.
2. **Post-repair latest-main validation:** rerun this exact validation sequence from latest main after migration repair merges.
3. **DB proof branch:** after core validation is green, add/prove a consolidated MySQL concurrency harness and run it with `TEST_DATABASE_URL` configured.
4. **Open PR rebuild captain:** authenticated GitHub PR scan to close/rebuild stale branches and enforce schema freeze/rebuild-only rules for `#88` through `#96`.
5. **Governance scanner follow-up:** review non-migration governance scan findings in a narrow branch without changing business logic unless separately approved.
