# MySQL Concurrency Proof Status

## Baseline

- Branch: `test/consolidated-mysql-concurrency-proof`
- Latest main SHA inspected locally: `f7d0498` (`Merge pull request #107 from zarjun247/codex/create-migration-surgery-control-room`)
- GitHub fetch status: unable to fetch `origin/main` or PR refs in this environment because the repository required authentication (`fatal: could not read Username for 'https://github.com'`). The harness was therefore built from the checked-out main snapshot at `f7d0498`.
- PR #89/#90 inspection result: attempted via `git fetch origin main pull/89/head:refs/remotes/origin/pr/89 pull/90/head:refs/remotes/origin/pr/90`; inaccessible for the same authentication reason.
- Reference chosen from #89/#90: none could be imported raw. The current repository DB lifecycle harness was used as the compatibility baseline.

## Files added or changed

- Added `server/mysql-concurrency.integration.test.ts`.
- Updated `server/testUtils/dbTestLifecycle.ts` to refuse DB-backed tests when `NODE_ENV=production`.
- Updated `package.json` with `test:db:concurrency` and `test:mysql:concurrency` scripts.
- Added this proof-status document.
- Added `DB_RACE_MODE_PROOF_REQUIREMENTS.md`.

## Scripts

- `pnpm run test:db:concurrency` runs `vitest run server/mysql-concurrency.integration.test.ts`.
- `pnpm run test:mysql:concurrency` aliases `pnpm run test:db:concurrency`.

## Safety refusal rules

The DB-backed harness uses `TEST_DATABASE_URL` only. It refuses to run when:

1. `TEST_DATABASE_URL` is missing; Vitest marks the suite skipped and prints that DB-backed proof is not claimed.
2. `NODE_ENV=production`.
3. The URL is not a valid MySQL URL.
4. The database name does not contain `test`.
5. `TEST_DATABASE_URL` equals runtime `DATABASE_URL`.

Fixtures are isolated with a unique `mysql_concurrency_<timestamp>_<pid>` run id and cleanup deletes only rows tagged with that run id or rows tracked by the existing DB test context.

## Cases covered by real DB-backed tests

When `TEST_DATABASE_URL` is present and safe, the harness applies migrations and runs these deterministic MySQL-backed checks:

1. **Last-unit reservation race**: two concurrent reservations execute an atomic guarded update against the same one-unit batch. Expected result: exactly one succeeds, `qtyReserved` is `1`, stock is not negative, and there is no over-reservation.
2. **POS/app collision on same SKU/batch**: one app reservation and one POS-style consume operation compete for the same one-unit batch. Expected result: exactly one succeeds, and `qtyOnHand - qtyReserved` never becomes negative.
3. **Invoice number race**: concurrent calls to the existing `reserveInvoiceNumber` service for one store/FY/document type return unique invoice numbers and advance one sequence row exactly once per reservation.
4. **Payment webhook replay uniqueness gate**: concurrent inserts with the same Razorpay provider event/idempotency key prove that MySQL unique constraints allow only one provider event row.
5. **Refund provider replay uniqueness gate**: concurrent inserts with the same provider refund id prove that MySQL unique constraints allow only one refund row for that provider refund id.
6. **H1 duplicate sale path uniqueness gate**: concurrent inserts for the same `saleRef`/`saleLineRef` prove that the H1 register unique key allows only one row.

## Cases explicitly not claimed as proven

The harness includes skipped tests with explicit reasons for paths that still lack safe production-callable seams:

1. **Purchase commit double-submit** remains unproven because purchase commit has no exported DB-backed idempotent test seam and `purchase_invoices` has no idempotency key/unique constraint that can be asserted without changing production behavior.
2. **Sale confirmation double-submit** remains unproven because the sale confirmation path is router/session coupled and no safe exported DB-backed idempotent confirmation seam exists for this harness.
3. **Full payment state-transition replay** remains unproven because webhook processing requires a seeded payment/order graph plus signed raw-body seam; this harness only proves provider event uniqueness.
4. **Over-refund prevention** remains partially unproven: provider refund id replay is constrained, but aggregate over-refund requires the production refund service with a seeded payment graph.
5. **Reservation expiry during payment** remains unproven because expiry/retry recovery has no exported deterministic service seam that can be exercised without altering runtime behavior.

## DB test run status in this environment

`TEST_DATABASE_URL` was not set in this environment. Therefore DB-backed smoke and concurrency proof suites were skipped by design and **DB race-mode production proof is not claimed from this run**.

Expected skip behavior:

- `pnpm run test:db:smoke`: suite skipped when `TEST_DATABASE_URL` is absent.
- `pnpm run test:db:concurrency`: suite skipped when `TEST_DATABASE_URL` is absent.

## Remaining concurrency risks

- Production reservation service path still needs a direct DB-backed test seam so the last-unit proof exercises the actual runtime function rather than only the atomic DB predicate pattern.
- Production POS sale confirmation needs an exported idempotent service seam to prove double-submit safety without router/session coupling.
- Purchase commit needs an idempotency key or equivalent unique guard plus a callable service seam.
- Payment webhook replay should be extended from unique event recording to full payment/order state transition idempotency.
- Refund replay should be extended from provider-refund uniqueness to aggregate amount/ledger over-refund prevention.
- Reservation expiry during payment needs an explicit recovery/abort policy and deterministic service seam.

## Next required fixes if tests fail with a real TEST_DATABASE_URL

1. Do not suppress or skip failures.
2. Capture the failing SQL/service path and final row state.
3. If failure is in the test harness cleanup/safety wiring, fix only that test harness.
4. If failure is in stock, reservation, payment, refund, sale, purchase, or compliance business behavior, open a focused production-fix PR after approval rather than hiding the failure in this proof PR.

## Validation output captured in this environment

- `pnpm install`: passed; lockfile already up to date. pnpm warned that dependency build scripts for `@tailwindcss/oxide` and `esbuild` are ignored until approved.
- `pnpm run check`: passed.
- `pnpm test -- --runInBand`: passed with `84 passed | 2 skipped` test files and `490 passed | 12 skipped` tests. The skipped tests are the DB lifecycle/concurrency suites because `TEST_DATABASE_URL` is unset.
- `pnpm run build`: passed. Vite emitted existing warnings for missing `%VITE_ANALYTICS_ENDPOINT%`, missing `%VITE_ANALYTICS_WEBSITE_ID%`, non-module analytics script bundling, and large chunks.
- `node scripts/verify-migrations.mjs`: passed; `Files: 49; numbered: 46; latest: 0048; Summary: 0 blocking issue(s), 0 warning(s)`.
- `git diff --check`: passed.
- `pnpm run test:db:smoke`: skipped because `TEST_DATABASE_URL` is not set.
- `pnpm run test:db:concurrency`: skipped because `TEST_DATABASE_URL` is not set; DB-backed race proof is not claimed.
- `node scripts/ci-governance-guards.mjs all`: failed with 4 findings unrelated to this test harness: one provider-risk match in `scripts/check-runtime-placeholders.mjs` and three stock-mutation-risk matches in `server/services/stockTruthCertification.ts`.
