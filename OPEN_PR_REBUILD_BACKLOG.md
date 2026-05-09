# OPEN_PR_REBUILD_BACKLOG

Post-validation rebuild backlog as of 2026-05-09.

> Live GitHub open-PR inspection was unavailable in this environment: no `origin` remote is configured, `gh` is not installed, and an unauthenticated GitHub API request to `zarjun247/247-customer-app` returned `404 Not Found`. Treat this backlog as the required control state until a maintainer performs an authenticated PR scan.

## Current validation gate

Latest local main-equivalent SHA `aef2de345c06fce30a298e4a0e195a9ae4039462` is **not green**. Duplicate migration prefixes `0045` and `0046` remain; full tests, migration verification, and governance scan are red. Schema/runtime rebuild PRs remain locked until a dedicated P0 migration repair branch lands and latest-main validation passes.

## Required PR handling

| PR / group | Current status | Required action |
| --- | --- | --- |
| `#88` reservation lifecycle | Rebuild-only | Rebuild from latest main after P0 migration repair; do **not** merge directly. |
| `#89` / `#90` MySQL concurrency harness | Consolidate | Consolidate into one DB proof branch after core validation is green; run only with `TEST_DATABASE_URL` configured before claiming proof. |
| `#91` observability | Salvage/rebuild if still open | May be first post-repair rebuild if it remains observability/healthcheck scoped and avoids runtime business logic. |
| `#94` / `#95` / `#96` schema branches | Frozen | Must use the next migration number from `MIGRATION_AUDIT_STATUS.md` after duplicate-prefix repair; do not merge raw. |
| Stale PRs | Do-not-merge | Keep stale PRs closed/superseded or rebuild unique work from latest main. |

## Next safe ordering after P0 validation turns green

1. Observability/healthchecks rebuild.
2. Consolidated MySQL concurrency harness.
3. Reservation lifecycle truth rebuild.
4. Provider runtime enforcement rebuild.
5. Pharmacy legal ops rebuild.
6. Offline/degraded recovery rebuild.
