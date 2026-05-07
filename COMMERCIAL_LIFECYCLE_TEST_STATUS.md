# Commercial Lifecycle Test Status

Branch: `feat/p20-21-commercial-lifecycle-tests`

## Test Harness Inspected

Inspected current-main test setup before making changes:

- `package.json`
  - `pnpm run check` runs `tsc --noEmit`.
  - `pnpm test` runs `vitest run`.
  - `pnpm run build` runs the Vite client build and server esbuild bundle.
- `vitest.config.ts`
  - Node environment.
  - Test include patterns are `server/**/*.test.ts` and `server/**/*.spec.ts`.
  - No global DB setup, migrations, transaction wrapper, or test container bootstrap is configured.
- `drizzle.config.ts`
  - Drizzle commands require `DATABASE_URL` and target MySQL.
- Existing commercial tests:
  - `server/commercial-flow.guard.test.ts` uses static router/service guards.
  - `server/commercial-flow.integration.test.ts` is integration-posture coverage based on source guard assertions, not a live DB harness.
- `server/testUtils/commercialFixtures.ts`
  - Existing scaffold only exposed deterministic IDs. It did not provide table-shaped fixtures or lifecycle state transitions.

## DB-Backed Feasibility

True DB-backed commercial lifecycle tests are not currently feasible in this checkout without external infrastructure because Vitest has no test DB bootstrap, no migration/seeding lifecycle, and no transaction cleanup convention. `server/db.ts` only creates a Drizzle MySQL connection when `DATABASE_URL` is present, while the test configuration does not provision one.

To keep the change parallel-safe and avoid production business-logic edits, this PR adds the strongest practical integration-style harness available in this repository today:

- deterministic table-shaped fixtures for commercial entities;
- in-memory state transitions that assert canonical stock, payment, return, delivery, supplier, security, and report invariants;
- static helper-seam guards for current-main production router/service integration points that would be used by future DB-backed tests.

## Fixtures Added

`server/testUtils/commercialFixtures.ts` now includes deterministic factories and an integration-style harness for:

- store and second store;
- user/customer and second customer;
- staff and pharmacist;
- product and H1 product;
- product variant/SKU-like variant;
- batch ledger records;
- purchase invoice and purchase return;
- sale/POS draft and sale lines;
- prescription;
- payment record;
- delivery task;
- supplier;
- audit log;
- stock reservation.

No secrets, provider credentials, or live external IDs are inserted.

## Lifecycle Coverage Added

`server/commercial-lifecycle.harness.test.ts` adds integration-style state assertions for:

- purchase commit increasing canonical stock and supplier outstanding;
- sale/POS confirmation decrementing stock and creating GST report impact;
- app reservation decrementing and release restoring availability;
- current-main-compatible Rx/H1 sale gate context;
- payment verification setting payment and sale paid state;
- delivery completion;
- sale return restoring stock and reversing GST/refund impact;
- purchase return reducing stock and supplier outstanding;
- supplier payment reducing outstanding.

## Concurrency / Idempotency Coverage Added

Coverage added for:

- last-unit reservation plus sale cannot oversell;
- duplicate purchase commit does not double-increment stock;
- invoice numbering helper seams remain available for future DB-backed race tests;
- duplicate payment verification is idempotent;
- duplicate refund request idempotency guard at harness level plus current-main refund guard seam;
- reservation expiry restores availability.

## Security Negative Coverage Added

Coverage added for:

- fake bearer/storage access denial at harness level plus current-main storage helper seam;
- customer cannot access another customer prescription;
- staff from store A cannot access store B scoped resources;
- oversized prescription upload is rejected;
- provider fake-success is blocked by payment verification state assertions and current-main payment verification seam.

## Report Consistency Coverage Added

Coverage added for:

- stock reconciliation totals matching canonical availability;
- daily GST report rows/totals/csvData;
- H1 completeness report flagging missing context;
- supplier outstanding rows/totals/csvData matching fixture state.

## Gaps / Limitations

- No DB migrations were added.
- No production domain code was changed.
- The new tests do not perform live MySQL transactions because this repo currently lacks a configured test database lifecycle.
- Static guards remain necessary for invoice numbering races, provider verification wiring, and router/service seams until a real DB-backed test container or `DATABASE_URL` convention is introduced.
- The harness intentionally does not replace production services; it provides deterministic integration-style coverage and fixture shapes that can be reused by future DB-backed tests.

## Validation Results

Validation commands requested:

- `pnpm install`
- `pnpm run check`
- `pnpm test -- --runInBand`
- `pnpm run build`

Executed on 2026-05-07:

- `pnpm install` passed; pnpm reported ignored dependency build scripts for `@tailwindcss/oxide` and `esbuild`.
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed: 55 test files and 233 tests.
- `pnpm run build` passed; Vite reported existing analytics-placeholder and chunk-size warnings.

## Files Changed

- `server/testUtils/commercialFixtures.ts`
- `server/commercial-lifecycle.harness.test.ts`
- `COMMERCIAL_LIFECYCLE_TEST_STATUS.md`

## Migrations

None.
