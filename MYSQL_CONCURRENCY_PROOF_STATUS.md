# MySQL Concurrency Proof Status

## Scope

This PR adds a production-like, real-MySQL concurrency proof harness for the highest-risk Pharmacy OS flows. It is intentionally test/proof-only: no production migrations and no commercial lifecycle business logic were changed to make these tests pass.

> This PR adds production-like concurrency proof only; it does not certify production readiness by itself.

## Tests added

Primary test file: `server/mysql-concurrency-proof.integration.test.ts`.

### True DB-backed concurrency tests

These tests run against a migrated MySQL database only when `TEST_DATABASE_URL` is set:

1. **A. Sale stock decrement race**
   - Runs two concurrent sale-confirmation-style transactions against one batch with one unit available.
   - Expects exactly one success, one controlled `CONTROLLED_STOCK_UNAVAILABLE` failure, no negative stock, final stock of `0`, and exactly one `stock_movements` audit row.

2. **B. Reservation race**
   - Runs three concurrent reservations against two available units.
   - Expects only two active reservations, one controlled `CONTROLLED_RESERVATION_UNAVAILABLE` failure, no negative availability, and a releasable expired reservation that reconciles `qtyReserved` and available stock.

3. **C. Invoice number race**
   - Runs concurrent invoice sequence generation for the same store/financial-year/document type.
   - Uses the existing `invoice_sequences` uniqueness key plus row locking in the test harness.
   - Expects unique, gap-free numbers for successful attempts and a final `last_number` matching successful generation count.

4. **D. Refund idempotency race**
   - Runs concurrent refund initiation for the same paid payment.
   - Expects pending/success refunds to count against the refundable amount, over-refund to return a controlled error, duplicate provider refund IDs to be blocked by the DB uniqueness key, and final consumed amount to remain `<=` refundable amount.

5. **E. H1 register duplicate race**
   - Runs concurrent H1 statutory row creation for the same `saleRef`/`saleLineRef` pair.
   - Expects exactly one row and one duplicate-key failure, with statutory refs preserved as strings and patient/doctor fields present.

6. **F. Purchase commit stock race**
   - Runs duplicate commit-style transactions against the same draft purchase invoice.
   - Expects exactly one stock inward mutation, one controlled `CONTROLLED_PURCHASE_ALREADY_COMMITTED` failure, one purchase inward stock movement, and stock matching one successful commit only.

7. **G. Barcode scan + sale confirm race**
   - Runs concurrent barcode lookups while a sale-confirmation-style stock transaction executes.
   - Expects scans to remain lookup-only, inventory mutation to happen only through the sale stock path, and exactly one sale fulfil movement.

### Static / partial guards

The same test file also includes static guards that run without MySQL:

- Confirms DB uniqueness choke points exist for invoice sequences, provider refunds, H1 sale-line refs, and sale bill numbers.
- Confirms H1 statutory references are string columns and the H1 creation router does not coerce UUID/string refs with `Number(...)`.
- Confirms barcode scan sources do not contain direct stock mutation SQL against `batches`, `batch_ledger`, `store_skus`, or `stock_movements`.

## Skipped behavior when `TEST_DATABASE_URL` is missing

- DB-backed tests use `describe.skip` when `TEST_DATABASE_URL` is not set.
- The test file logs: `Skipping MySQL concurrency proof integration tests because TEST_DATABASE_URL is not set.`
- Static proof guards still run without MySQL so normal local and CI test suites continue to get useful coverage.

## Safety controls

The existing MySQL lifecycle helper is reused:

- `TEST_DATABASE_URL` is required for DB-backed tests.
- The helper refuses non-MySQL URLs.
- The helper refuses database names that do not include `test`.
- The helper refuses to run when `TEST_DATABASE_URL` exactly matches `DATABASE_URL`.
- Tests create synthetic rows with unique run IDs and clean them up after each case.
- Runtime DB tests are written as sequential Vitest cases while each case manages its own internal concurrent MySQL connections.

## How to run locally

Normal test suite without MySQL:

```bash
pnpm install
pnpm test -- --runInBand
```

Real MySQL-backed concurrency proof:

```bash
pnpm install
docker compose -f docker-compose.test.yml up -d mysql-test
export TEST_DATABASE_URL='mysql://247_test_user:247_test_password@127.0.0.1:3307/247_customer_app_test'
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
docker compose -f docker-compose.test.yml down -v
```

## CI notes

- Existing CI remains unchanged for normal `check`, `test`, and `build` behavior.
- A dedicated `mysql-concurrency-proof` job starts MySQL 8.4, applies migrations with `pnpm run test:db:bootstrap`, and runs `pnpm run test:db:concurrency`.
- The existing `mysql-db-lifecycle` smoke job remains separate.

## Validation results in this environment

- `pnpm install`: passed.
- `pnpm run check`: passed after installing declared dependencies.
- `pnpm test -- --runInBand`: passed; MySQL DB-backed lifecycle/concurrency tests skipped because `TEST_DATABASE_URL` was not set.
- `pnpm run test:db:concurrency`: passed; 3 static guards passed and 8 DB-backed tests skipped because `TEST_DATABASE_URL` was not set.
- Real DB-backed execution was not run in this environment because `TEST_DATABASE_URL` was not available.

## Bugs discovered

- **P1 — Production service-level wiring remains unproven by this PR.** The DB-backed tests prove concurrency behavior using transactional SQL patterns over the real schema. They do not yet call every production router/service method for sale confirmation, reservation, invoice generation, refund initiation, H1 creation, purchase commit, or barcode scan.
- **P2 — Invoice sequence prefix is not part of the existing DB uniqueness key.** `invoice_sequences` is unique on store, financial year, and document type. If production requires multiple sale invoice prefixes for the same store/FY/document type, the sequence model needs an explicit documented strategy.

No P0 data-corruption bug was discovered by the test harness work itself.

## Remaining production proof gaps

- Wire each DB-backed race test through the exact production service/router entrypoint once those entrypoints expose stable test seams.
- Add deadlock retry policy proof for production transactions where applicable.
- Add provider-webhook replay coverage for refunds after the provider integration surface is available in a test-safe form.
- Add sale/order end-to-end proof that pharmacist/Rx/H1 gates remain enforced under concurrent sale confirmation.
- Add purchase commit idempotency proof through the production purchase router/service rather than the transaction pattern used by this proof harness.
- Add invoice sequence proof for every statutory document type and any store-specific prefix strategy used in production.
