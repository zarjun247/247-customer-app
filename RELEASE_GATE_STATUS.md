# Release Gate Status

## What is checked

The release gate runs these blocking checks in the selected mode:

- Environment posture validation through `scripts/validate-production-env.mjs`.
- Static migration verification through `scripts/verify-migrations.mjs`.
- Runtime placeholder scan through `scripts/check-runtime-placeholders.mjs`.
- Static healthcheck route presence.
- Static provider contract file presence.

The gate also writes `tmp/artifacts/RELEASE_GATE_REPORT.md` for human review.

## What is advisory

- Full test execution is referenced as `pnpm test -- --runInBand` and must be preserved as separate CI/release evidence.
- Build execution is referenced as `pnpm run build` and must be preserved as separate CI/release evidence.
- Test-mode environment warnings are advisory because CI must not require production secrets.

## What is blocking

- Any production-critical environment posture failure in production mode.
- Duplicate migration numbers.
- Non-monotonic numbered migration order.
- Undocumented destructive migration statements such as `DROP TABLE`, `DROP COLUMN`, `TRUNCATE TABLE`, or broad `DELETE FROM`.
- Runtime placeholder patterns that imply production fake success or demo success.
- Missing healthcheck route references.

## Latest validation results

Local validation for this PR generated a test-mode release gate report with zero blocking failures. Production mode is expected to fail unless deployment-owned secrets and production-safe endpoints are injected.

## Multi-store beta readiness impact

This gate adds executable proof that deployment prerequisites, migration posture, environment posture, provider contract presence, backup dry-runs, and restore drill safety checks exist. It does not certify multi-store beta or production readiness by itself; it creates the release evidence that must be reviewed before those claims can be made.
