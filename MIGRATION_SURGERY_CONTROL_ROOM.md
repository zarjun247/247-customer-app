# MIGRATION_SURGERY_CONTROL_ROOM

Migration-surgery coordination control room as of 2026-05-09.

> This is a docs/control ledger only. It does not rename migrations, edit SQL, edit `drizzle/schema.ts`, modify runtime behavior, or claim production readiness.

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `chore/migration-surgery-control-room-and-schema-freeze` |
| Latest main SHA inspected | `aef2de345c06fce30a298e4a0e195a9ae4039462` |
| Latest local merge visible | `Merge pull request #99 from zarjun247/codex/certify-stock-mutation-gateways-and-reporting` |
| Remote refresh status | Attempted `git fetch origin main` / `git pull --rebase origin main`; unavailable because this checkout has no `origin` remote configured. The local main-equivalent `work` branch is therefore the latest inspectable main in this environment. |
| Live GitHub PR status | Unverified. Unauthenticated GitHub API request to `zarjun247/247-customer-app` returned `404 Not Found`, and `gh` is not installed in this container. |
| Migration files inspected | All `drizzle/*.sql` files and `drizzle/schema.ts` filename presence were inspected by static filename scan only. |

## Red warning

> 🔴 **Until migration surgery merges and latest-main validation passes, no PR adding `drizzle/schema.ts` or `drizzle/*.sql` changes should merge.**

## Current migration health

| Health state | Status | Evidence / note |
| --- | --- | --- |
| unknown | No | The current filename-level issue is known from local static inspection. |
| blocked | Yes | Duplicate numbered migration prefixes are present in current main-equivalent checkout. |
| under surgery | Expected / external | The expected repair branch is `fix/migration-sequence-collision-surgery`; this control branch did not verify that branch locally. |
| repaired | No | This branch intentionally does not repair, rename, edit, or add migrations. |

## Static migration inventory

| Item | Result |
| --- | --- |
| Numbered SQL migration files | 46 numbered files. |
| Non-numbered SQL migration files | `part10_whatsapp.sql`, `part11_routing_rider.sql`, `part12_system_events.sql`. |
| Highest numbered prefix visible | `0046`. |
| Duplicate numbered prefixes visible | `0045`, `0046`. |
| Missing numbered prefixes still visible | `0030`, `0031`, `0033`. |
| Duplicate `0045` files | `drizzle/0045_commercial_event_ledger.sql`, `drizzle/0045_provider_webhook_events.sql`. |
| Duplicate `0046` files | `drizzle/0046_rbac_staff_session_governance.sql`, `drizzle/0046_worker_jobs.sql`. |
| Other duplicate prefixes discovered | None by filename-prefix scan. |

## Current migration-surgery owner

Expected branch:

- `fix/migration-sequence-collision-surgery`

That branch must fix or prove all of the following before schema PRs are unfrozen:

1. Every numbered migration prefix is unique.
2. The migration guard script passes.
3. A migration smoke test passes on latest main.
4. Migration audit documentation is updated with the next reserved migration number.
5. Any required repair is forward-only, reviewable, and backed by proof rather than implicit renumbering assumptions.

## Freeze boundary

Blocked until surgery completes:

- Any PR touching `drizzle/schema.ts`.
- Any PR adding or editing `drizzle/*.sql`.
- Any PR relying on stale `0045` or `0046` migration numbering.
- Any PR that requires Drizzle metadata/migration generation before the collision is resolved.

Allowed to continue with explicit review:

- Docs/governance-only PRs that do not alter runtime behavior, schema, migrations, package manifests, or lockfiles.
- Runtime-only PRs only after changed-files review proves no schema/migration touch and no stale migration assumption.
- Test-only PRs only after changed-files review proves no schema/migration touch and no stale migration assumption.

## What this branch does not do

- No migration renames.
- No `drizzle/schema.ts` edits.
- No SQL changes.
- No runtime code changes.
- No server business logic changes.
- No client runtime changes.
- No package or lockfile changes.
- No migration collision resolution.
- No production-readiness claim.

## Immediate maintainer checklist

1. Land or inspect `fix/migration-sequence-collision-surgery` first.
2. Re-run latest-main validation after surgery merges.
3. Confirm no duplicate migration prefixes remain.
4. Record the next reserved migration number in `MIGRATION_AUDIT_STATUS.md`.
5. Rebuild schema-changing PRs from post-surgery latest main, one at a time.
