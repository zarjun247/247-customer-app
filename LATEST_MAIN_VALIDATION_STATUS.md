# LATEST_MAIN_VALIDATION_STATUS

Validation/status proof for latest local main-equivalent after requested migration collision surgery, stale PR triage, and branch-protection governance updates.

> This is a validation / proof / status document only. It does not add features, does not modify runtime business logic, and does not add or rename migrations.

## Validation metadata

| Item | Value |
| --- | --- |
| Branch | `chore/latest-main-validation-proof-after-migration-surgery` |
| Validation date/time | 2026-05-09 04:42-04:46 UTC |
| Latest local main-equivalent SHA validated | `aef2de345c06fce30a298e4a0e195a9ae4039462` |
| Latest visible merged PR | `#99` — `Merge pull request #99 from zarjun247/codex/certify-stock-mutation-gateways-and-reporting` |
| Remote refresh / pull-rebase status | Attempted `git fetch origin main --prune`; blocked because this container has no configured `origin` remote (`fatal: 'origin' does not appear to be a git repository`). Validation therefore uses the checked-out local main-equivalent HEAD only. |
| Live open PR inspection status | Not fully verifiable in this container: `gh` is not installed, no git remote is configured, and unauthenticated GitHub API lookup for inferred `zarjun247/247-customer-app` returned HTTP 404. |
| Migration surgery status | **Blocked / not complete on validated HEAD.** Duplicate migration prefixes `0045` and `0046` are still present in `drizzle/`. |
| DB-backed proof status | **Skipped due missing `TEST_DATABASE_URL`.** The smoke script executed but skipped its single MySQL lifecycle test. No DB race/concurrency script exists in `package.json`. |
| Latest-main status | **Blocked.** TypeScript and build pass, but test suite, migration verifier, and governance scan fail on duplicate migration prefixes / governance findings. |

## Pre-validation inspection

| Required inspection | Result |
| --- | --- |
| Inspect latest main SHA | Local main-equivalent HEAD is `aef2de345c06fce30a298e4a0e195a9ae4039462`. Remote `main` could not be pulled because no `origin` remote is configured. |
| Inspect latest merged PR | Latest local merge is `aef2de3 Merge pull request #99 from zarjun247/codex/certify-stock-mutation-gateways-and-reporting`. |
| Confirm migration surgery branch/PR merged | Not confirmed. Validated HEAD still contains duplicate `0045` / `0046` migration prefixes, so the surgery is not present/effective on this local main-equivalent. |
| Inspect `drizzle/` duplicate prefixes | **Failed:** `0045_commercial_event_ledger.sql`, `0045_provider_webhook_events.sql`, `0046_rbac_staff_session_governance.sql`, and `0046_worker_jobs.sql` are all present. |
| Inspect `scripts/verify-migrations.mjs` | Present. It detects duplicate numbered migration prefixes, non-monotonic ordering, naming warnings, and destructive SQL patterns. |
| Inspect `scripts/ci-governance-guards.mjs` | Present. It includes migration-name scan and broader governance/security scans. |
| Inspect open PRs | Live open PR state could not be verified from this container. Risk summary below uses local merge history and the requested/current expected context. |

## Validation command table

Commands were run in the requested order.

| # | Command | Result | Exact status / evidence |
| --- | --- | --- | --- |
| 1 | `pnpm install` | Pass with warning | Exit 0. Lockfile up to date. Warnings: Node `[DEP0169] url.parse()` deprecation; pnpm ignored build scripts for `@tailwindcss/oxide` and `esbuild`. |
| 2 | `pnpm run check` | Pass | Exit 0. `tsc --noEmit` completed without errors. |
| 3 | `pnpm test -- --runInBand` | **Fail** | Exit 1. 82 files passed, 2 failed, 1 skipped. Failed tests: duplicate migration-number assertions in `server/database-index-audit.guard.test.ts` and `server/migration-smoke.guard.test.ts`. MySQL lifecycle test skipped because `TEST_DATABASE_URL` is not set. |
| 4 | `pnpm run build` | Pass with warning | Exit 0. Vite/esbuild completed. Warnings: undefined `%VITE_ANALYTICS_ENDPOINT%`, undefined `%VITE_ANALYTICS_WEBSITE_ID%`, non-module analytics script cannot be bundled, and chunk-size warning for >500 kB chunk. |
| 5 | `node scripts/verify-migrations.mjs` | **Fail** | Exit 1. Reports duplicate migration number `0045` and duplicate migration number `0046`; summary: `2 blocking issue(s), 0 warning(s)`. |
| 6 | `node scripts/ci-governance-guards.mjs all` | **Fail** | Exit 1. Reports 8 findings: 1 provider-risk in `scripts/check-runtime-placeholders.mjs`, 3 stock-mutation-risk findings in `server/services/stockTruthCertification.ts`, and 4 migration-risk findings for duplicate `0045`/`0046` files. |
| 7 | `git diff --check` | Pass | Exit 0. No whitespace/conflict-marker issues reported. |
| 8 | `pnpm run test:db:smoke` | Skipped by test due missing DB URL | Command exit 0, but test result is skipped: `Skipping MySQL DB lifecycle integration smoke test because TEST_DATABASE_URL is not set.` This is **not** DB-backed green proof. |
| 9 | DB concurrency script | Skipped / unavailable | `TEST_DATABASE_URL` is missing, and no `test:db:concurrency` or `test:mysql:concurrency` script exists in `package.json`. Classified as P1 proof gap, not P0 code failure. |

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

## Migration verification result

**Blocked.** Duplicate migration prefixes are still present:

- `0045_commercial_event_ledger.sql`
- `0045_provider_webhook_events.sql`
- `0046_rbac_staff_session_governance.sql`
- `0046_worker_jobs.sql`

This branch did **not** rename migrations because the requested branch is validation/status-only and the allowed scope forbids migration surgery unless this branch is explicitly taking over that exact failure.

## Governance/security scan result

**Blocked.** `node scripts/ci-governance-guards.mjs all` failed with 8 findings:

- 4 migration-risk findings from duplicate migration numbers.
- 3 stock-mutation-risk findings in the stock truth certification service.
- 1 provider-risk finding in the runtime placeholder scan script.

The non-migration governance findings may be false positives or may need a tiny governance-script calibration branch, but this validation branch did not patch them because the requested scope is proof/status and the migration failure is already P0-blocking.

## DB-backed test status

| DB proof item | Status | Evidence |
| --- | --- | --- |
| `TEST_DATABASE_URL` | Missing | Shell printed empty value before DB smoke run. |
| `pnpm run test:db:smoke` | Executed but skipped its test | Vitest reported `1 skipped`; stderr says `Skipping MySQL DB lifecycle integration smoke test because TEST_DATABASE_URL is not set.` |
| DB concurrency/race script | Not run | No concurrency script exists in `package.json`, and `TEST_DATABASE_URL` is missing. |
| DB proof classification | **P1 proof gap** | Not a P0 code failure, but latest main cannot claim DB-backed race/concurrency proof. |

## Current open PR risk summary

Live open PR state could not be verified from this container. Treat the following as governance risk until a maintainer verifies GitHub directly:

| PR / branch class | Current risk classification |
| --- | --- |
| Stale schema PRs with old `0045` / `0046` migration prefixes | **Blocked / rebuild-only.** Do not merge until migration proof is green and next reserved migration number is known. |
| Migration surgery branch/PR | **Not confirmed merged into validated HEAD.** Duplicate prefixes remain locally. |
| Active rebuild PRs | Must rebase on the post-surgery main after duplicate prefixes are removed. |
| Duplicate MySQL harness PRs | Need one-source-of-truth decision before merge; current `package.json` only exposes `test:db:smoke`, not a concurrency harness. |
| Older stale product/payment/barcode/accounting/security branches | Do not merge raw; rebuild only unique work from latest verified main after migration hygiene is repaired. |

## Current launch rating

| Launch mode | Rating | Rationale |
| --- | --- | --- |
| Investor demo | **Conditional / yellow** | Static typecheck and build pass, but tests and governance are red because migrations collide. Demo is acceptable only if clearly framed as non-production and no migration deploy is attempted. |
| Controlled pilot | **Blocked** | P0 migration hygiene failure and no DB-backed proof. |
| Multi-store beta | **Blocked** | Duplicate migrations plus skipped DB proof make multi-store rollout unsafe. |
| Race-mode production | **Blocked** | No DB race/concurrency proof and migration verifier is red. Production readiness cannot be claimed. |

## Readiness score table

| Area | Score | Notes |
| --- | ---: | --- |
| Code maturity | 7.2 / 10 | Typecheck and build pass; recent hardening work is visible in merge history, but test suite is red. |
| Migration hygiene | 3.0 / 10 | Duplicate `0045` / `0046` prefixes are P0-blocking. |
| CI/governance hygiene | 5.5 / 10 | Governance scans exist but currently fail with migration and non-migration findings. |
| Test proof maturity | 6.2 / 10 | 488 tests pass, but two migration guard tests fail. |
| DB-backed proof maturity | 2.5 / 10 | DB smoke test skipped due missing `TEST_DATABASE_URL`; no concurrency script exists. |
| Investor-demo readiness | 7.0 / 10 | Demo-only readiness remains possible with caveats. |
| Controlled-pilot readiness | 5.0 / 10 | Blocked until migrations and DB smoke proof are green. |
| Multi-store beta readiness | 4.0 / 10 | Blocked by migration collision and missing DB concurrency proof. |
| Race-mode production readiness | 3.0 / 10 | Blocked; cannot exceed 9 without DB race tests and real-store proof, and current score is far below that due P0 migration failure. |

## Current P0 / P1 / P2 risks

### P0 risks

- **P0 migration:** duplicate `0045` and `0046` Drizzle migration prefixes remain on validated HEAD.
- **P0 tests:** full test suite fails because migration guard tests detect duplicate prefixes.
- **P0 governance:** governance scan fails, including duplicate migration findings.

### P1 risks

- **P1 DB proof skipped:** `TEST_DATABASE_URL` is missing; DB smoke test skipped and no DB concurrency proof ran.
- **P1 governance warning/follow-up:** non-migration governance findings for `stockTruthCertification.ts` and `scripts/check-runtime-placeholders.mjs` need follow-up triage after migration P0 is fixed.
- **P1 stale PR visibility:** live open PR state could not be verified in this container.

### P2 risks

- **P2 build warnings:** analytics env placeholders are undefined during build and Vite reports large chunk warnings.
- **P2 install warnings:** pnpm ignored dependency build scripts and Node emitted `[DEP0169]` deprecation warning.

## Required blocker branches / next recommended prompts

1. `fix/complete-migration-surgery-0045-0046-on-main` — complete or re-apply the migration collision surgery by forward-only renumbering/reconciling duplicate `0045` / `0046` files, then rerun migration verifier and tests.
2. `chore/triage-governance-guard-findings-after-migration-fix` — after migration is green, triage the remaining provider-risk and stock-mutation-risk governance findings without changing runtime behavior unless explicitly scoped.
3. `test/add-one-mysql-concurrency-harness` — add a single agreed DB concurrency/race harness script after migration hygiene is green.
4. `chore/live-pr-triage-after-migration-proof` — run authenticated GitHub PR triage to close/supersede stale schema PRs and identify active rebuild PRs.

## Safe-to-merge assessment

**Safe to merge as a status/proof PR only, not as a production-readiness claim.** This PR documents that latest local main-equivalent is blocked by P0 migration/test/governance failures and a P1 DB proof gap. It should be used to coordinate the next blocker branches, not to release or claim production readiness.
