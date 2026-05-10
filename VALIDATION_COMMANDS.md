# VALIDATION_COMMANDS

Updated: 2026-05-10.

## Required validation for this sprint

Run these commands before merge:

```bash
pnpm run check
pnpm test
pnpm run build
node scripts/verify-migrations.mjs
node scripts/ci-governance-guards.mjs all
node scripts/repo-governance-audit.mjs
git diff --check
```

## DB-backed concurrency proof

The DB proof command exists and is intentionally separate from the regular unit/static suite:

```bash
pnpm run test:db:concurrency
```

It requires `TEST_DATABASE_URL`. The database name must include `test`, must use a MySQL URL, must not equal `DATABASE_URL`, and must not run with `NODE_ENV=production`.

```bash
export TEST_DATABASE_URL='mysql://USER:PASSWORD@HOST:PORT/DB_NAME_WITH_test'
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
```

## Local Docker MySQL path

Use the checked-in MySQL 8.4 compose service when Docker is available:

```bash
docker compose -f docker-compose.test.yml up -d mysql-test
export TEST_DATABASE_URL='mysql://247_test_user:247_test_password@127.0.0.1:3307/247_customer_app_test'
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
docker compose -f docker-compose.test.yml down -v
```

## GitHub Actions DB proof path

`.github/workflows/concurrency-proof.yml` provisions MySQL 8.4, sets:

```bash
TEST_DATABASE_URL=mysql://247_test_user:247_test_password@127.0.0.1:3306/247_customer_app_test
```

and runs:

```bash
pnpm run test:db:bootstrap
pnpm run test:db:concurrency
```

This workflow is the exact CI MySQL 8.4 parity proof path. To run it manually, open GitHub Actions, select **DB Concurrency Proof**, choose **Run workflow**, and confirm the `mysql-concurrency-proof` job passes both DB bootstrap and concurrency proof steps.

## Proof claim rule

If `TEST_DATABASE_URL` is absent, `server/mysql-concurrency.integration.test.ts` intentionally skips and prints that DB-backed race proof is not claimed. Do not remove that warning or claim DB proof unless `pnpm run test:db:bootstrap` and `pnpm run test:db:concurrency` actually execute against MySQL and exit successfully.
