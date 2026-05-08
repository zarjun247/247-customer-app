# MySQL Test DB Lifecycle Status

## Current setup inspected

- Test runner: Vitest is configured for Node tests under `server/**/*.test.ts`, `server/**/*.spec.ts`, and barcode component tests.
- Existing scripts: `pnpm test`, `pnpm run check`, `pnpm run build`, and `pnpm run db:push` existed before this change.
- DB access: runtime DB access uses Drizzle ORM with the MySQL driver and `DATABASE_URL` in `server/db.ts`.
- Migration tooling: `drizzle.config.ts` points Drizzle Kit at `drizzle/schema.ts`, `./drizzle`, MySQL dialect, and `DATABASE_URL`.
- Migration folder: numbered SQL migrations currently live in `drizzle/` with Drizzle metadata in `drizzle/meta/`. No migrations are added by this PR.
- CI: existing CI had separate check, test, build, migration-smoke, security-env-guards, and placeholder-guards jobs.

## MySQL service/container added

- CI service: GitHub Actions starts `mysql:8.4` for the dedicated `mysql-db-lifecycle` job.
- Local service: `docker-compose.test.yml` starts `mysql:8.4` on host port `3307`.
- Test database name: `247_customer_app_test`.
- Test-only user: `247_test_user`.
- Test-only password: `247_test_password`.
- Root password in the local/CI test container is also test-only: `test_root_password`.
- The local container stores MySQL data on tmpfs so it is disposable and does not require a developer private DB.

## Environment variables

- `TEST_DATABASE_URL` is the only URL used by the MySQL-backed test lifecycle.
- Local default:
  - `mysql://247_test_user:247_test_password@127.0.0.1:3307/247_customer_app_test`
- CI default:
  - `mysql://247_test_user:247_test_password@127.0.0.1:3306/247_customer_app_test`
- The bootstrap helper exports `DATABASE_URL=TEST_DATABASE_URL` only for the child `drizzle-kit migrate` process because the existing Drizzle config requires `DATABASE_URL`.
- Safety checks refuse to run unless the database name includes `test`, and refuse when `TEST_DATABASE_URL` exactly matches `DATABASE_URL`.

## Migration bootstrap behavior

- `pnpm run test:db:bootstrap` runs `scripts/bootstrap-test-db.ts`.
- The script requires `TEST_DATABASE_URL`.
- It connects to MySQL and fails clearly if MySQL is unavailable.
- It reuses existing Drizzle Kit migration tooling by running `pnpm exec drizzle-kit migrate --config=drizzle.config.ts` with `DATABASE_URL` set only inside that child process.
- It verifies migration application by asserting `__drizzle_migrations` contains at least one row.
- It does not create new migrations and does not use production DB credentials.

## Seed and cleanup utilities

Added under `server/testUtils`:

- `dbTestLifecycle.ts`
  - validates `TEST_DATABASE_URL` safety rules.
  - opens a real MySQL connection.
  - applies and verifies migrations.
  - creates a Drizzle-backed test context with a unique run id.
  - cleans rows created by a test in reverse dependency order.
- `dbSeedFactories.ts`
  - creates deterministic test store data.
  - creates deterministic test customer/user data.
  - creates deterministic test staff/pharmacist data.
  - creates deterministic product, variant, store SKU, and batch data.

All seed data is synthetic test-only data. No real customer, medical, provider, or production data is inserted.

## Smoke test added

- `server/mysql-db-lifecycle.integration.test.ts` is a real DB-backed Vitest smoke test.
- It is skipped only when `TEST_DATABASE_URL` is missing and logs a clear skip message.
- When `TEST_DATABASE_URL` is present, it:
  - applies migrations.
  - verifies migration rows exist.
  - inserts and reads a store.
  - inserts and reads product/SKU/batch rows.
  - inserts and reads customer and pharmacist users.
  - runs cleanup and verifies inserted rows are gone.

## CI behavior

- Added dedicated `mysql-db-lifecycle` job in `.github/workflows/ci.yml`.
- The normal `test` job remains unchanged; local developers without MySQL can still run normal tests.
- The DB job:
  - starts a `mysql:8.4` service container.
  - sets `TEST_DATABASE_URL` to the CI test DB.
  - installs dependencies.
  - runs `pnpm run test:db:bootstrap`.
  - runs `pnpm run test:db:smoke` so the smoke test executes against real MySQL.

## Local developer instructions

```bash
pnpm install
docker compose -f docker-compose.test.yml up -d mysql-test
export TEST_DATABASE_URL='mysql://247_test_user:247_test_password@127.0.0.1:3307/247_customer_app_test'
pnpm run test:db:bootstrap
pnpm run test:db:smoke
docker compose -f docker-compose.test.yml down -v
```

Normal local tests do not require MySQL:

```bash
pnpm test -- --runInBand
```

Without `TEST_DATABASE_URL`, the MySQL lifecycle smoke test is skipped with an explicit message.

## Future concurrency test readiness

The lifecycle is intentionally small and additive, but is ready for future real-DB concurrency tests because it provides a migrated MySQL database, unique run ids, deterministic seed factories, and cleanup hooks. Suggested next tests:

- last-unit reservation race.
- invoice number race.
- payment webhook replay.
- duplicate purchase commit.
- duplicate sale confirmation.
- refund replay.
- H1 duplicate prevention.

## Limitations

- This PR does not implement the future race-condition tests listed above.
- This PR does not add migrations.
- The bootstrap script relies on the existing Drizzle Kit CLI and current migration history.
- The smoke test uses cleanup-by-created-ids rather than per-test transactions because MySQL DDL/migration bootstrap and future multi-connection concurrency tests are better served by explicit cleanup.
- Local DB-backed execution requires Docker or another disposable MySQL 8.4 instance that matches `TEST_DATABASE_URL`.

## Validation results

- `pnpm install`: run locally.
- `pnpm run check`: run locally; failed on pre-existing `server/connectors.ts` fetch header typing errors, not introduced by this test-infrastructure PR.
- `pnpm test -- --runInBand`: run locally; DB smoke test skipped locally when `TEST_DATABASE_URL` was not set.
- `pnpm run build`: run locally.
- `git diff --check`: run locally.
- `pnpm run test:db:smoke`: run locally; smoke test skipped because `TEST_DATABASE_URL` was not set.
- `docker --version && docker compose version`: failed locally because Docker is not installed in this execution environment. Real DB execution path is still wired through `docker-compose.test.yml` and the CI `mysql-db-lifecycle` job.

## Files changed

- `.github/workflows/ci.yml`
- `docker-compose.test.yml`
- `package.json`
- `scripts/bootstrap-test-db.ts`
- `server/mysql-db-lifecycle.integration.test.ts`
- `server/testUtils/dbSeedFactories.ts`
- `server/testUtils/dbTestLifecycle.ts`
- `MYSQL_TEST_DB_STATUS.md`
