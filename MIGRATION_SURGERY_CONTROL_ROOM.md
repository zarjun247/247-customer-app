# MIGRATION_SURGERY_CONTROL_ROOM

Migration-surgery control room for the current main-equivalent checkout as of 2026-05-09.

> **Docs/control scope only:** this branch records coordination state. It does not rename migrations, edit schema, add SQL, or change runtime behavior.

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `chore/migration-surgery-control-room-and-schema-freeze` |
| Latest main SHA inspected | `aef2de345c06fce30a298e4a0e195a9ae4039462` |
| Latest local merge visible | `Merge pull request #99 from zarjun247/codex/certify-stock-mutation-gateways-and-reporting` |
| Remote-main refresh attempt | `git fetch origin main --prune`, `git checkout -B main origin/main`, and `git pull --rebase origin main` were attempted after configuring `origin` as `https://github.com/zarjun247/247-customer-app.git`; GitHub HTTPS auth was unavailable in this container (`could not read Username for 'https://github.com': No such device or address`). |
| Live GitHub PR inspection | Attempted unauthenticated GitHub REST API inspection for open PRs; repository returned `404 Not Found`, consistent with private repo or unauthenticated access. Classifications below are therefore based on local history, local docs, and expected PR context until a maintainer verifies live GitHub state. |
| Drizzle files inspected | `find drizzle -maxdepth 2 -type f` and duplicate-prefix scan over `drizzle/*.sql`. |

## Red warning

> 🔴 **Until migration surgery merges and latest-main validation passes, no PR adding `drizzle/schema.ts` or `drizzle/*.sql` changes should merge.**

## Current migration health

| State | Status | Evidence / note |
| --- | --- | --- |
| Unknown | No | Local migration filenames are inspectable in this checkout. Live PR diffs and remote protected-main state are not inspectable without GitHub auth. |
| Blocked | Yes | Duplicate numbered migration prefixes are present in local main-equivalent history: `0045` and `0046`. |
| Under surgery | Expected / external | The expected repair branch is `fix/migration-sequence-collision-surgery`; this docs branch does not verify that branch because no authenticated remote access is available. |
| Repaired | No | This branch intentionally does not repair numbering. Do not treat the duplicate-prefix state as green until the surgery branch merges and validation is rerun on latest main. |

## Local migration inventory summary

| Item | Result |
| --- | --- |
| Numbered SQL migrations inspected | `0000` through `0029`, then `0032`, `0034` through `0046` as filenames under `drizzle/`. |
| Historical gaps still visible | `0030`, `0031`, and `0033`. These are not repaired here. |
| Duplicate prefixes discovered | `0045`, `0046`. |
| Metadata journal status | Existing `MIGRATION_AUDIT_STATUS.md` previously reported Drizzle metadata only through `0021`; this branch does not modify metadata. |

## Suspected duplicate prefixes

| Prefix | Local files discovered | Control classification |
| --- | --- | --- |
| `0045` | `drizzle/0045_commercial_event_ledger.sql`; `drizzle/0045_provider_webhook_events.sql` | Blocking collision; surgery required. |
| `0046` | `drizzle/0046_rbac_staff_session_governance.sql`; `drizzle/0046_worker_jobs.sql` | Blocking collision; surgery required. |
| Other numbered prefixes | No other duplicate four-digit prefixes found by filename scan. | Continue monitoring; live PRs may add further collisions. |

## Expected migration-surgery branch

| Item | Required value |
| --- | --- |
| Expected branch | `fix/migration-sequence-collision-surgery` |
| Owner / reviewer expectation | Dedicated migration maintainer / merge captain review. |
| Merge gate | Latest-main validation after the repair branch lands. |

## What the surgery branch must fix

- Assign unique migration prefixes to every numbered migration file without silently dropping schema intent.
- Make the migration guard script pass.
- Make the migration smoke test pass against a fresh database target when credentials are available.
- Update migration governance docs with the next reserved migration number after repair.
- Confirm that no open schema PR reuses stale `0045` or `0046` numbering after repair.

## What this branch does not do

- No migration renames.
- No `drizzle/schema.ts` edits.
- No `drizzle/*.sql` edits.
- No Drizzle metadata edits.
- No runtime code changes.
- No server business-logic changes.
- No client runtime changes.
- No dependency or lockfile changes.
- No production-readiness claim.

## Merge freeze rule

Until the migration-surgery branch merges and latest-main validation is recorded:

1. Schema-changing PRs stay frozen.
2. PRs with stale migration numbers must be rebuilt from latest main after surgery, not merged as-is.
3. Runtime-only PRs may proceed only after explicit review confirms they do not touch `drizzle/schema.ts`, `drizzle/*.sql`, Drizzle metadata, or migration-number governance.
4. Docs/governance-only PRs may continue if they do not claim migration repair or production readiness.

## 2026-05-09 latest-main supersession note

This document was originally a pre-surgery control-room snapshot. Later inspected local history includes PR #100 and PR #107. On latest inspected SHA `f7d049825eb17922e9fa0c47326620e26a396186`, `node scripts/verify-migrations.mjs` reports 49 SQL files, 46 numbered migrations, latest `0048`, and 0 blocking issues / 0 warnings. The current expected migration tail is:

- `0045_provider_webhook_events.sql`
- `0046_commercial_event_ledger.sql`
- `0047_worker_jobs.sql`
- `0048_rbac_staff_session_governance.sql`

The next reserved migration number is `0049`. Any stale PR or document still claiming duplicate `0045`/`0046` migrations must be refreshed against latest main before it is used for merge decisions.
