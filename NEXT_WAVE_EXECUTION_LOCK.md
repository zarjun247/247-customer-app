# NEXT_WAVE_EXECUTION_LOCK

## Latest lock decision — 2026-05-09

| Item | Status |
| --- | --- |
| Validation branch | `chore/post-migration-latest-main-validation-proof` |
| Latest local main-equivalent SHA | `aef2de345c06fce30a298e4a0e195a9ae4039462` |
| Wave R1 state | **Locked for schema/runtime; docs-only allowed** |
| Migration validation | **Failed** — duplicate prefixes `0045` and `0046` remain. |
| Typecheck | Passed. |
| Full tests | **Failed** — migration duplicate-prefix guard tests fail. |
| Build | Passed with warnings. |
| Governance scan | **Failed** — migration-risk plus stock/provider scanner findings. |
| DB proof | **Skipped / P1 proof gap** — `TEST_DATABASE_URL` is missing and no DB concurrency script exists. |

## Lock rules now in effect

- Schema PRs remain **locked** because migration validation fails.
- Runtime reservation/payment/provider/legal/offline PRs remain **locked** because the full test suite is red.
- Docs-only PRs remain allowed if they do not modify runtime logic, migrations, schema, package behavior, or business logic.
- DB-proof work can begin only after migration verification and core validation are green; it must not claim DB-backed proof unless `TEST_DATABASE_URL` is configured and the DB tests actually run.

## Required unlock path

1. Run a dedicated P0 migration repair branch for duplicate `0045`/`0046` prefixes.
2. Update `MIGRATION_AUDIT_STATUS.md` with the confirmed next reserved migration number after repair.
3. Rerun latest-main validation in the required order.
4. If typecheck/tests/build/migration verification/governance/diff sanity pass, partially unlock Wave R1 in this order:
   1. observability/healthchecks rebuild
   2. consolidated MySQL concurrency harness
   3. reservation lifecycle truth rebuild
   4. provider runtime enforcement rebuild
   5. pharmacy legal ops rebuild
   6. offline/degraded recovery rebuild

## Blocker classification

| Severity | Classification | Evidence |
| --- | --- | --- |
| P0 | Migration | Duplicate `0045` and `0046` migration prefixes remain. |
| P0 | Test | Full test suite fails in duplicate migration-prefix guards. |
| P1 | DB proof skipped | `TEST_DATABASE_URL` missing; DB smoke skipped; no concurrency script present. |
| P1 | Governance warning/failure | Governance scan reports 8 findings. |
| P2 | Build warnings | Build passes with analytics placeholder/bundle-size warnings. |
