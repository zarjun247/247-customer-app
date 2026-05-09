# REAL_DB_PROOF_EXECUTION_STATUS

Real DB-backed proof execution status for branch `test/real-mysql-db-proof-execution` on 2026-05-09.

## Scope and guardrails

This branch is documentation/proof-only. It does not change production runtime code, stock logic, reservation logic, payment/provider behavior, compliance behavior, migrations, `drizzle/schema.ts`, or `drizzle/*.sql`.

The mission was to run the MySQL smoke/concurrency harness with `TEST_DATABASE_URL` and document whether the repository can claim real disposable-DB proof. In this container, `TEST_DATABASE_URL` was not present, so no destructive DB-backed proof was executed and no production DB proof is claimed.

## Git / main freshness

| Item | Result |
| --- | --- |
| Requested branch | `test/real-mysql-db-proof-execution` |
| Local SHA inspected | `200fafcc20451cc43e8d6272588ec7e26e12d9c8` |
| Latest GitHub main refresh | Attempted, but unavailable in this checkout because `origin` was absent and adding `https://github.com/zarjun247/247-customer-app.git` could not fetch without credentials. |
| Fresh branch created | Yes, from local checkout SHA `200fafcc20451cc43e8d6272588ec7e26e12d9c8`. |

## TEST_DATABASE_URL safety check

| Check | Result |
| --- | --- |
| `TEST_DATABASE_URL` present | No; value redacted/not printed. |
| URL parsed | Not applicable because the variable is missing. |
| Host/database safety tokens checked | Not applicable because the variable is missing. |
| Destructive DB tests allowed | No. Missing `TEST_DATABASE_URL` is a hard blocker for real DB proof. |
| Production/staging mutation risk | Avoided. No production/staging URL was available or used. |

Required safe setup before real proof can be claimed:

1. Start a disposable MySQL 8.4 database, preferably the checked-in `docker-compose.test.yml` service.
2. Export `TEST_DATABASE_URL` to a database whose name contains `test`, `local`, `ci`, `ephemeral`, or `disposable`; the current harness requires the database name to include `test`.
3. Ensure `TEST_DATABASE_URL` is distinct from `DATABASE_URL`.
4. Do not set `NODE_ENV=production` for DB-backed tests.
5. Run `pnpm run test:db:bootstrap`, `pnpm run test:db:smoke`, and `pnpm run test:db:concurrency` only after the URL passes the safety gate.

Example using the local disposable service, with the URL intentionally omitted from this proof document:

```bash
docker compose -f docker-compose.test.yml up -d mysql-test
# export TEST_DATABASE_URL to the disposable mysql-test database; do not reuse production/staging credentials
pnpm run test:db:bootstrap
pnpm run test:db:smoke
pnpm run test:db:concurrency
pnpm run test:db:concurrency
pnpm run test:db:concurrency
```

## Migration tail

`node scripts/verify-migrations.mjs` reported:

- Migration directory: `drizzle`
- Files: `49`
- Numbered migrations: `46`
- Latest numbered migration: `0048`
- Blocking issues: `0`
- Warnings: `0`

Fresh DB migration application remains unproven in this environment because `TEST_DATABASE_URL` is missing and `pnpm run test:db:bootstrap` refused to run.

## Command result table

| # | Command | Result | Evidence / notes |
| ---: | --- | --- | --- |
| 1 | `pnpm install` | Passed with warnings | Lockfile already up to date. pnpm warned about ignored build scripts for `@tailwindcss/oxide` and `esbuild`, plus a Node `url.parse()` deprecation warning. |
| 2 | `pnpm run check` | Passed | TypeScript completed with no errors. |
| 3 | `pnpm test -- --runInBand` | Passed with skipped DB proof | `84 passed | 2 skipped` test files; `490 passed | 12 skipped` tests. DB lifecycle/concurrency suites skipped because `TEST_DATABASE_URL` is not set. |
| 4 | `pnpm run build` | Passed with warnings | Vite warned about undefined analytics placeholders, non-module analytics script, and large chunks. |
| 5 | `node scripts/verify-migrations.mjs` | Passed | `Files: 49; numbered: 46; latest: 0048; Summary: 0 blocking issue(s), 0 warning(s).` |
| 6 | `node scripts/ci-governance-guards.mjs all` | Passed | Governance/security scan reported no blocked patterns. |
| 7 | `git diff --check` | Passed | No whitespace errors. |
| 8 | `pnpm run test:db:bootstrap` | Failed safely / blocked | Refused to run because `TEST_DATABASE_URL` is required. No DB URL was printed. |
| 9 | `pnpm run test:db:smoke` | Skipped | `1` MySQL lifecycle test skipped because `TEST_DATABASE_URL` is not set. This is not production proof. |
| 10 | `pnpm run test:db:concurrency` | Skipped | `11` MySQL concurrency tests skipped because `TEST_DATABASE_URL` is not set. This is not race proof. |
| 11 | `pnpm run test:db:concurrency` repeated twice | Skipped | Repeated twice more; each run skipped all `11` concurrency tests because `TEST_DATABASE_URL` is not set. |

## DB smoke result

Blocked/skipped. `pnpm run test:db:bootstrap` failed safely before migration application because `TEST_DATABASE_URL` is missing. `pnpm run test:db:smoke` skipped its single lifecycle test for the same reason. No fresh DB bootstrap or smoke proof is claimed.

## DB concurrency result

Skipped. `pnpm run test:db:concurrency` was invoked three total times, and each invocation skipped all `11` tests because `TEST_DATABASE_URL` is missing. Repetition count for real DB execution is therefore `0`; repetition count for skipped harness invocations is `3`.

## Cases covered by implemented harness vs proven in this run

| Case | Harness coverage observed | Real DB ran in this environment | Proof status |
| --- | --- | --- | --- |
| Migration smoke | Yes, via `scripts/bootstrap-test-db.ts` and `server/mysql-db-lifecycle.integration.test.ts` | No | Blocked by missing `TEST_DATABASE_URL`. |
| Fresh DB bootstrap | Yes, via `pnpm run test:db:bootstrap` | No | Failed safely before DB mutation because `TEST_DATABASE_URL` is missing. |
| Last-unit reservation race | Yes | No | Implemented but skipped; not proof. |
| POS/app collision | Yes | No | Implemented but skipped; not proof. |
| Purchase commit double-submit | No | No | Explicitly skipped/unproven by harness. |
| Sale confirmation double-submit | No | No | Explicitly skipped/unproven by harness. |
| Invoice number race | Yes | No | Implemented but skipped; not proof. |
| Payment webhook replay | Partial | No | Provider event uniqueness gate exists, but full payment state transition replay is explicitly unproven. |
| Refund replay / over-refund prevention | Partial | No | Provider refund id replay gate exists, but aggregate over-refund prevention is explicitly unproven. |
| H1 duplicate prevention | Yes | No | Implemented but skipped; not proof. |
| Reservation expiry during payment | No | No | Explicitly skipped/unproven by harness. |

## Failures

No production race/invariant bug was proven because real DB tests did not execute. The only DB-specific failure was an expected safe blocker:

- `pnpm run test:db:bootstrap` exited with code `1` because `TEST_DATABASE_URL` is required for DB-backed tests.

## Skipped tests

Skipped tests observed in the full suite:

- `server/mysql-db-lifecycle.integration.test.ts`: `1` skipped test because `TEST_DATABASE_URL` is not set.
- `server/mysql-concurrency.integration.test.ts`: `11` skipped tests because `TEST_DATABASE_URL` is not set.

The skipped DB tests are proof gaps and are not counted as green production DB evidence.

## Production DB proof claim

No. This branch does **not** claim production DB proof, fresh migration proof, smoke proof, or race-mode proof. The DB proof score for this run is `0/10` for real execution because `TEST_DATABASE_URL` is missing.

## Remaining risks

| Severity | Risk | Required next work |
| --- | --- | --- |
| P0 | Real DB bootstrap/smoke proof is absent. | Provide a safe disposable `TEST_DATABASE_URL` and run bootstrap plus smoke. |
| P0 | Real DB concurrency proof is absent. | Run `pnpm run test:db:concurrency` three times against the disposable DB after safety checks pass. |
| P0 | Purchase commit double-submit remains unproven. | Add a test-only DB harness seam or service-level DB test without changing production behavior. Recommended prompt: `test/add-missing-db-concurrency-cases`. |
| P0 | Sale confirmation double-submit remains unproven. | Add a deterministic DB-backed confirmation idempotency test. Recommended prompt: `test/add-missing-db-concurrency-cases`. |
| P1 | Full payment state-transition replay remains unproven. | Seed payment/order graph and signed webhook seam in a DB-backed test. |
| P1 | Aggregate over-refund prevention remains unproven. | Exercise production refund service against seeded payment/refund graph. |
| P1 | Reservation expiry during payment remains unproven. | Add deterministic expiry/recovery DB-backed test seam. |
| P2 | Latest GitHub main could not be fetched from this container. | Re-run from an authenticated checkout with `origin/main` available. |

## Safe-to-merge assessment

Safe as a docs-only proof-status update, but not sufficient to certify DB race-mode production readiness. Merge should not be interpreted as real MySQL proof.
