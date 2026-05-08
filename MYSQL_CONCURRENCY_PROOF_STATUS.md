# MySQL Concurrency Proof Status

## Scope

Wave 1 / Prompt 4 adds a focused, production-like MySQL concurrency proof harness for high-risk pharmacy OS flows. This is a test/proof PR only. It does not change commercial lifecycle behavior and it does not add production migrations.

## Tests added

Added `server/mysql-concurrency-proof.integration.test.ts`; the suite is written without `test.concurrent`, so Vitest executes the cases serially within the file via `pnpm run test:mysql:concurrency`.

### True DB-backed proof cases

The following cases require a real MySQL database and are skipped when `TEST_DATABASE_URL` is missing:

1. **A. Sale stock decrement race**
   - Runs two concurrent stock-decrement confirmations against the same `batch_ledger` row.
   - Uses an atomic conditional update to prove one-winner behavior when stock can satisfy only one sale.
   - Verifies final stock is exact, non-negative, and a `stock_movements` audit row exists only for the success.

2. **B. Reservation race**
   - Runs concurrent reservations against one `batch_ledger` row.
   - Uses row locking to prove reservations cannot exceed available stock when serialized at the batch row.
   - Verifies reservation totals reconcile to batch availability and that a successful reservation can be released.

3. **C. Invoice number race**
   - Runs concurrent invoice sequence allocation for one store/day/financial-year series.
   - Verifies no duplicate invoice numbers and final `invoice_sequences.last_number` consistency.
   - Mirrors the documented production strategy of sequence uniqueness plus transaction row lock.

4. **D. Refund idempotency race**
   - Runs concurrent inserts for the same provider refund ID.
   - Verifies the database unique key blocks duplicates and pending/success ledger total remains within the paid amount for the proof scenario.

5. **E. H1 register duplicate race**
   - Runs concurrent H1 statutory register inserts for the same `saleRef`/`saleLineRef`.
   - Verifies the database unique key blocks duplicates and statutory references remain string-safe UUID values.
   - Verifies required patient/doctor fields are retained on the surviving statutory row.

6. **F. Purchase commit stock race**
   - Runs two concurrent controlled commits for one draft purchase invoice.
   - Verifies one-winner status transition, one `purchase_inward` movement, and stock quantity reflecting a single successful commit.

7. **G. Barcode scan + sale confirm race**
   - Runs barcode lookups while a controlled sale confirmation mutates inventory.
   - Verifies barcode scanning remains lookup-only and final mutation occurs through the sale/stock path.

## Static / partial guards

The harness also adds static guards for production code paths that are not fully runtime-wired by this PR:

- Stock mutation entry points exist (`decreaseStockForSaleConfirmation`, `increaseStockForPurchaseCommit`).
- Reservation mutation entry points exist (`reserveStockForOrder`, `assertAvailableForReservation`).
- H1 statutory creation uses string refs and does not cast `saleRef` / `saleLineRef` through `Number(...)`.
- Refund overage/idempotency helpers exist (`calculateRefundAvailability`, `assertProviderRefundIdAvailable`).
- Invoice number generation uses `.for("update")`, and schema has the unique sequence key `uq_invoice_seq_store_fy_doc`.
- Barcode service has a lookup resolver and is guarded against direct stock quantity mutation patterns.

## Skip behavior when `TEST_DATABASE_URL` is missing

The DB-backed suite uses `describe.skip` when `TEST_DATABASE_URL` is absent and prints a clear warning:

```text
Skipping MySQL concurrency proof integration tests because TEST_DATABASE_URL is not set.
```

This prevents local or CI runs without a MySQL test service from failing due only to missing database infrastructure.

## Test DB safety

The MySQL lifecycle helper now refuses unsafe databases by:

- Requiring `TEST_DATABASE_URL` for DB-backed tests.
- Requiring a `mysql://`-style URL.
- Rejecting URLs whose database name does not include `test` unless the host is explicitly allowlisted via `TEST_DATABASE_ALLOWLIST_HOSTS`.
- Rejecting cases where `TEST_DATABASE_URL` equals `DATABASE_URL`.
- Verifying the connected database name/host after connection before tests run.

## How to run locally

1. Start the repo's MySQL test service, for example:

   ```bash
   docker compose -f docker-compose.test.yml up -d
   ```

2. Set a test-only database URL. The database name should include `test`:

   ```bash
   export TEST_DATABASE_URL='mysql://root:password@127.0.0.1:3307/247_customer_app_test'
   ```

3. Bootstrap migrations:

   ```bash
   pnpm run test:db:bootstrap
   ```

4. Run only the concurrency proof suite serially:

   ```bash
   pnpm run test:mysql:concurrency
   ```

5. Run the broader suite if needed:

   ```bash
   pnpm test -- --runInBand
   ```

## CI notes

No GitHub Actions job is added in this PR. The current CI surface is left untouched to avoid breaking existing non-DB CI. A future optional job can start MySQL 8.x, set `TEST_DATABASE_URL`, run `pnpm run test:db:bootstrap`, and then run `pnpm run test:mysql:concurrency`.

## Bugs and risks discovered

- **P1 — Runtime stock decrement production path still needs a direct DB row-lock/conditional-update proof.** The DB harness proves the correct atomic pattern, but this PR does not certify that every production sale confirmation path uses that exact atomic update under concurrency.
- **P1 — Runtime reservation service still needs full concurrent service-level proof.** The harness proves a safe row-lock reservation pattern. Static inspection confirms reservation helpers exist, but this PR does not certify that all production cart/checkout reservation calls serialize on the same DB row under simultaneous checkout load.
- **P1 — Refund over-refund prevention still needs full concurrent service-level proof.** The DB harness proves duplicate provider refund IDs are blocked and the proof ledger remains under the paid amount. Static inspection confirms amount-availability helpers exist, but concurrent service-level refund initiation still needs a transaction/lock proof around availability calculation plus insert.
- **P2 — Purchase commit proof is controlled at the DB transition level.** The harness proves one-winner status transition and stock inward behavior for the proof scenario. It does not certify every production purchase-draft/commit entry point without additional route/service-level wiring.
- **P2 — Barcode lookup is proven lookup-only for the tested SQL path and statically guarded.** Additional route-level tests can prove every scan endpoint remains mutation-free.

## Remaining production proof gaps

- Wire the DB-backed tests directly to sale confirmation, reservation, refund initiation, H1 verification, and purchase commit service/router entry points once stable test seams are available.
- Add a CI MySQL job after confirming runtime cost and MySQL service reliability in GitHub Actions.
- Extend proof cases to deadlock retry behavior, transaction isolation differences, and provider callback races.
- Add negative tests for duplicate invoice number conflicts with already-created sales/returns beyond sequence allocation.

## Readiness statement

This PR adds production-like concurrency proof only; it does not certify production readiness by itself.
