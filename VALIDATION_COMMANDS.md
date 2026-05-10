# VALIDATION_COMMANDS

Updated: 2026-05-10.

Required validation for this sprint:

```bash
pnpm run check
pnpm test
pnpm run build
node scripts/verify-migrations.mjs
node scripts/ci-governance-guards.mjs all
node scripts/repo-governance-audit.mjs
git diff --check
```

DB-backed proof command, only when `TEST_DATABASE_URL` is set:

```bash
pnpm run test:db:concurrency
```

If `TEST_DATABASE_URL` is absent, the DB harness is intentionally skipped and DB proof is not claimed.
