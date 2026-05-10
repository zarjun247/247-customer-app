# CONCURRENCY_PROOF_STATUS

Updated: 2026-05-10.

## Current status

- `pnpm run test:db:concurrency` is present and targets `server/mysql-concurrency.integration.test.ts`.
- This environment does not provide `TEST_DATABASE_URL`, and Docker is not installed, so local DB-backed concurrency proof is **not claimed** by this pass.
- The harness is intentionally skip-gated when `TEST_DATABASE_URL` is absent; skipped DB tests are warnings, not proof.
- CI proof path has been restored in `.github/workflows/concurrency-proof.yml`; it provisions MySQL 8.4, applies migrations, and runs `pnpm run test:db:concurrency` with `TEST_DATABASE_URL` set.

## DB tests that exist

`server/mysql-concurrency.integration.test.ts` contains MySQL-backed integration cases for:

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

## CI proof path

`.github/workflows/concurrency-proof.yml` runs on pull requests to `main`, pushes to `main`, and manual dispatch. The workflow:

1. Starts MySQL 8.4 with database `247_customer_app_test`.
2. Exports `TEST_DATABASE_URL=mysql://247_test_user:247_test_password@127.0.0.1:3306/247_customer_app_test`.
3. Runs `pnpm run test:db:bootstrap`.
4. Runs `pnpm run test:db:concurrency`.

A green run of that workflow is the CI concurrency evidence. Until it is observed green, DB proof remains unclaimed.

## Runtime parity status

- Purchase commit router delegates to `commitPurchaseInvoiceExactlyOnce`.
- Sale confirmation router delegates to `confirmSaleExactlyOnce`.
- Refund success webhook settlement delegates to `settleProviderRefundExactlyOnce`.
- Payment capture webhooks continue to enter through `handleRazorpayWebhook`, the canonical raw provider webhook seam.

## Remaining unproven guarantees

- Local DB race proof remains unexecuted in this environment because no `TEST_DATABASE_URL` or Docker MySQL service is available.
- CI workflow execution remains pending until GitHub Actions runs `.github/workflows/concurrency-proof.yml` and reports green.
- Supplier invoice duplicate uniqueness/backfill remains a P1 production-hardening item outside this proof sprint.
- Provider dead-letter retry and accounting journal reversal proof remain P1 follow-up areas.
