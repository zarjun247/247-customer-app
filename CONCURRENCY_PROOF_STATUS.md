# CONCURRENCY_PROOF_STATUS

Updated: 2026-05-10.

## Current status

- DB proof status: **CLAIMED for the prior local DB-backed MySQL execution documented below; HOSTED CI proof remains pending until a green GitHub Actions run/artifact is attached.**
- `pnpm run test:db:bootstrap` executed successfully against a real local MySQL server using `TEST_DATABASE_URL=mysql://247_test_user:247_test_password@127.0.0.1:3307/247_customer_app_test`.
- `pnpm run test:db:concurrency` executed the MySQL-backed harness and passed: **1 test file, 11 tests passed**. The checked-in harness now contains 12 DB-backed cases, including a non-destructive duplicate supplier invoice commit guard, and requires a fresh local or hosted run to claim the expanded count.
- Docker is not installed in this environment, so the local proof used an installed MySQL server (`mysqld 8.0.45-0ubuntu0.24.04.1`) instead of the Docker Compose MySQL 8.4 service. The GitHub Actions proof path still uses MySQL 8.4.
- The harness remains intentionally skip-gated when `TEST_DATABASE_URL` is absent; skipped DB tests are warnings, not proof.

## Exact DB proof run from this pass

Environment:

```bash
TEST_DATABASE_URL=mysql://247_test_user:247_test_password@127.0.0.1:3307/247_customer_app_test
```

Commands executed:

```bash
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
```

Observed output summary:

- `pnpm run test:db:bootstrap`: Drizzle migrations applied successfully; test MySQL database reachable.
- `pnpm run test:db:concurrency`: `server/mysql-concurrency.integration.test.ts` passed with `11 passed (11) for the prior local run; the current harness expects 12 cases after this sprint`.

## Failures found and fixed in this proof sprint

- Drizzle migration journal stopped at `0021`, so later SQL migrations were not applied by `pnpm run test:db:bootstrap`; fixed the journal so migrations `0022` through `0048` are included.
- Several hand-written SQL migrations contained multiple statements without Drizzle statement breakpoints; added `--> statement-breakpoint` separators so the MySQL bootstrap can apply them.
- The DB harness set `DATABASE_URL` before creating its safe test context, tripping the safety guard that prevents `TEST_DATABASE_URL` from matching runtime `DATABASE_URL`; fixed setup order so safety validation runs before runtime service seams point at the test DB.
- Deterministic DB seed factories reused the same unique user/product/store identifiers across tests; added suffix support and shortened DB-safe fixture identifiers.
- Invoice-number concurrency failed on simultaneous first-row creation; fixed `reserveInvoiceNumber` to use a MySQL atomic upsert/sequence reservation path and proved concurrent reservations are unique.
- Provider payment webhook replay could reject the duplicate insert through Drizzle-wrapped duplicate-key errors; fixed duplicate-key detection to inspect nested MySQL causes and return an idempotent duplicate result.
- Reservation payment-vs-expiry proof used an app `batches` row where the terminal service expects `batch_ledger`; changed the proof fixture to use `batch_ledger` so it exercises the production terminal seam.

## DB-backed cases covered by the harness

`server/mysql-concurrency.integration.test.ts` covers these integration cases when `TEST_DATABASE_URL` is set. The prior local proof passed the first 11; the 12-case expanded harness still requires fresh local or hosted observation:

1. Last-unit reservation atomic predicate.
2. POS sale vs app reservation last-unit race.
3. Concurrent invoice number reservations.
4. Provider webhook replay uniqueness.
5. Refund replay uniqueness.
6. H1 sale-line duplicate registration uniqueness.
7. Purchase commit double-submit through `commitPurchaseInvoiceExactlyOnce`.
8. Sale confirmation double-submit through `confirmSaleExactlyOnce`.
9. Payment webhook replay through `handleRazorpayWebhook`.
10. Refund replay / over-refund through `settleProviderRefundExactlyOnce`.
11. Reservation payment-vs-expiry terminal race through `claimReservationTerminalState`.
12. Duplicate supplier invoice commit blocked non-destructively before any hard uniqueness migration.

## Exact DB proof command

```bash
export TEST_DATABASE_URL='mysql://USER:PASSWORD@HOST:PORT/DB_NAME_WITH_test'
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
```

Local Docker path:

```bash
docker compose -f docker-compose.test.yml up -d mysql-test
export TEST_DATABASE_URL='mysql://247_test_user:247_test_password@127.0.0.1:3307/247_customer_app_test'
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
docker compose -f docker-compose.test.yml down -v
```

## CI proof path and manual dispatch steps

`.github/workflows/concurrency-proof.yml` runs on pull requests to `main`, pushes to `main`, and manual dispatch. The workflow:

1. Starts MySQL 8.4 with database `247_customer_app_test`.
2. Exports `TEST_DATABASE_URL=mysql://247_test_user:247_test_password@127.0.0.1:3306/247_customer_app_test`.
3. Runs `pnpm run test:db:bootstrap`.
4. Runs `pnpm run test:db:concurrency`.
5. Captures `test-db-bootstrap.log`, `mysql-concurrency-proof.log`, `evidence-manifest.md`, and an uploaded `db-concurrency-proof-<run-id>-<attempt>` artifact.

Manual `workflow_dispatch` steps and auditable capture commands are fully specified in `HOSTED_CI_DB_PROOF_STATUS.md`.

Manual `workflow_dispatch` steps:

1. Open the repository's GitHub **Actions** tab.
2. Select **DB Concurrency Proof**.
3. Click **Run workflow** on the target branch.
4. Confirm that the `mysql-concurrency-proof` job passes both migration bootstrap and MySQL concurrency proof steps.
5. Archive the run URL, run ID, commit SHA, full logs, and uploaded evidence artifact before changing hosted status from pending to observed.

## Runtime parity status

- Purchase commit router delegates to `commitPurchaseInvoiceExactlyOnce`.
- Sale confirmation router delegates to `confirmSaleExactlyOnce`.
- Refund success webhook settlement delegates to `settleProviderRefundExactlyOnce`.
- Payment capture webhooks continue to enter through `handleRazorpayWebhook`, the canonical raw provider webhook seam.

## Remaining unproven guarantees

- CI MySQL 8.4 proof should still be observed green via `.github/workflows/concurrency-proof.yml` for hosted-runner parity with the checked-in workflow. CI MySQL 8.4 parity run still needs observation and the evidence artifact described in `HOSTED_CI_DB_PROOF_STATUS.md`.
- Supplier invoice duplicate hard uniqueness/backfill remains a P1 production-hardening item: the purchase commit seam now blocks future committed duplicates for supplier + store + invoice number, but existing dirty data still needs business-review backfill before a hard unique constraint.
- Provider dead-letter retry proof is now covered by guard tests and a non-destructive `provider_dead_letters` exact-once table/constraint.
- Refund accounting reversal proof is now covered by guard tests and settlement wiring to balanced journal batches.
