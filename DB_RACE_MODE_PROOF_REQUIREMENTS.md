# DB Race-Mode Production Proof Requirements

Race-mode production must not be enabled or described as launch-ready until all required DB-backed checks below pass against a safe `TEST_DATABASE_URL` database.

## Non-negotiable safety rules

- Never run destructive DB proof tests against production or staging data.
- `TEST_DATABASE_URL` must be distinct from `DATABASE_URL`.
- The database name must clearly identify a test database and include `test`.
- DB-backed proof must refuse to run when `NODE_ENV=production`.
- Missing `TEST_DATABASE_URL` means the proof is skipped and no DB-backed race-safety claim may be made.
- Tests must use synthetic fixtures only; no real customer data, provider credentials, SMS, WhatsApp, OCR, or live Razorpay calls.

## Required pre-production checks

1. **Migration verification**
   - `node scripts/verify-migrations.mjs` must pass.
   - No race-proof PR may add migrations unless explicitly scoped and reviewed.

2. **DB bootstrap/smoke**
   - `pnpm run test:db:bootstrap` must apply migrations successfully to `TEST_DATABASE_URL`.
   - `pnpm run test:db:smoke` must pass against `TEST_DATABASE_URL`.

3. **DB concurrency harness**
   - `pnpm run test:db:concurrency` must pass against `TEST_DATABASE_URL`.
   - Recommended repeated run count before race-mode production: at least 20 consecutive successful runs on an isolated MySQL 8.4 test database.

4. **Last-unit stock tests**
   - Concurrent app reservations for one remaining unit must allow exactly one success.
   - No negative stock and no over-reservation are allowed.
   - The proof should exercise the production reservation service once a safe service seam exists.

5. **POS/app collision tests**
   - Concurrent POS sale and app reservation/order on the same SKU/batch must not double-consume stock.

6. **Purchase commit double-submit tests**
   - The same purchase commit/idempotency key submitted twice must not double-increment stock.
   - The second submit must return an idempotent result or be safely ignored/rejected.

7. **Sale confirmation double-submit tests**
   - The same sale confirmation submitted twice must not double-decrement stock.
   - Invoice rows/snapshots/payment rows must not duplicate.

8. **Invoice number race tests**
   - Concurrent invoice reservations must return unique bill numbers and maintain one monotonic sequence row per store/FY/document type.

9. **Payment webhook replay tests**
   - Duplicate provider events must create at most one event record and perform exactly one payment/order state transition.

10. **Refund replay and over-refund tests**
    - Duplicate refund requests/events must not over-refund.
    - Payment status, refund rows, credit notes, and ledger entries must stay consistent.

11. **H1 duplicate tests**
    - Repeated confirmation of the same regulated sale line must not duplicate the H1 register row for the same sale line/reference.

12. **Reservation expiry during payment tests**
    - Expiration racing with payment retry/capture must not leave ghost reservations.
    - The system must not create a paid order without a valid reservation unless a documented recovery path atomically revalidates or reallocates stock.

## Merge/launch interpretation

- Passing non-DB unit tests is not DB race proof.
- Skipped DB tests are not green DB proof.
- Unique constraint checks prove only their scoped gate, not full business lifecycle idempotency.
- Production launch requires full service-path DB-backed proof, not only table-level predicate proof.

## Reservation lifecycle DB proof requirement

Reservation lifecycle state-machine tests are not a substitute for MySQL last-unit race proof. Run the DB smoke/concurrency scripts with `TEST_DATABASE_URL` before claiming atomic oversell safety.
