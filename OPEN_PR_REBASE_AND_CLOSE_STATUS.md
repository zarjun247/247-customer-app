# OPEN_PR_REBASE_AND_CLOSE_STATUS

## Inspection summary

| Field | Value |
| --- | --- |
| Branch | `chore/stale-pr-closure-do-not-merge-lock` |
| Latest main SHA inspected | `f7d049825eb17922e9fa0c47326620e26a396186` |
| Inspection timestamp | `2026-05-09T00:00:00Z` |
| GitHub tooling status | `gh` is not installed; `git fetch origin main` and unauthenticated GitHub REST calls failed because this checkout cannot authenticate to `zarjun247/247-customer-app`. |
| PR closure/label status | No GitHub PRs were actually closed or labelled from this branch. This document provides exact manual close/label instructions. |
| Runtime code changed | No |
| Migrations changed | No |
| Schema changed | No |

## Latest-main migration truth

Latest inspected main already contains the migration-surgery tail:

| Number | Current file on inspected main |
| ---: | --- |
| `0045` | `drizzle/0045_provider_webhook_events.sql` |
| `0046` | `drizzle/0046_commercial_event_ledger.sql` |
| `0047` | `drizzle/0047_worker_jobs.sql` |
| `0048` | `drizzle/0048_rbac_staff_session_governance.sql` |

`MIGRATION_AUDIT_STATUS.md` reserves `0049` as the next migration number. Any open PR using stale `0045`, `0046`, `0047`, or `0048` migration files is unsafe to merge raw and must be rebuilt from latest main.

## Open PR inspection limitations

The requested live GitHub inspection could not be completed from this container:

- `git fetch origin main` failed with `fatal: could not read Username for 'https://github.com': No such device or address`.
- `gh --version` failed because `gh` is not installed.
- `curl -fsSL https://api.github.com/repos/zarjun247/247-customer-app/pulls?state=open&per_page=100` returned HTTP `404`, which is consistent with a private repository or missing authentication.

Therefore the table below is a control-room classification for the listed PRs based on latest local main history, existing governance docs, merged PR evidence in local history, and the mission's expected stale-PR rules. Before manually closing or labelling, refresh each PR in GitHub and confirm it is still open.

## Requested PR classification table

| PR | Title / domain | Branch | Base | Latest commit SHA | Mergeable | Changed file categories | Classification | Exact reason |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| #2 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #3 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #4 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #5 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #6 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #7 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #8 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #9 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #10 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #11 | Old audit/stabilization | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Very old branch predating later stock, security, RBAC, payment, migration, and governance hardening. Do not merge raw. |
| #19 | Old audit branch | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | Unknown; likely docs/runtime | close/superseded; do-not-merge | Superseded by current-main audit, branch-protection proof, migration audit, and governance docs on latest main. |
| #44 | Old CI/docs cleanup | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | docs; CI/scripts likely | close/superseded; do-not-merge | Superseded by newer governance/current-main docs and CI proof branches. |
| #46 | Old barcode branch | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; frontend likely | close/superseded; duplicate; do-not-merge | Superseded by later barcode/product-master/runtime work and the rebased barcode UX path. |
| #47 | Old barcode duplicate | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; frontend likely | close/superseded; duplicate; do-not-merge | Duplicate of old barcode work; superseded by later barcode/product-master/runtime work. |
| #62 | Old payment fail-closed branch | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime likely | close/superseded; do-not-merge | Superseded by merged payment fail-closed and payment webhook lifecycle hardening. |
| #66 | Product-master runtime gates | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; schema possible | close/superseded; do-not-merge | Superseded by merged PR #75, which rebased the product-master runtime gate work on newer main. |
| #68 | Old accounting duplicate | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; schema/migrations possible | close/superseded; duplicate; do-not-merge | Superseded by merged accounting, journal, reconciliation, commercial lifecycle, and ledger work. |
| #76 | Old CI governance branch | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | docs; CI/scripts | close/superseded; do-not-merge | Superseded by merged PR #92 governance security scans and later governance docs. |
| #80 | Old observability branch | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; CI/scripts possible | close/superseded if #91 remains active; otherwise needs human review | Treat as superseded by newer #91 observability work if #91 is open. Do not merge both. |
| #86 | Old commercial lifecycle branch | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; schema; migrations likely | close/superseded; migration-stale; do-not-merge | Superseded by merged PR #87 commercial lifecycle ledger and migration-surgery numbering. |
| #88 | Reservation lifecycle truth | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; schema/migrations possible; tests | rebuild from latest main; do-not-merge raw | Valuable stock/reservation work, but likely stale relative to stock truth, RBAC, worker, and migration-surgery changes. Rebuild if still needed. |
| #89 | MySQL concurrency harness | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | CI/scripts; tests | keep active/reference; duplicate candidate | Valuable race-proof concept. Compare with #90 and consolidate into exactly one harness. |
| #90 | MySQL concurrency harness duplicate | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | CI/scripts; tests | duplicate/reference-only; do-not-merge raw | Duplicate active concept with #89. Mine unique tests, then close or label duplicate after one consolidated rebuild exists. |
| #91 | Observability / healthchecks | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; CI/scripts; docs possible | keep active; rebuild from latest main | Valuable operations work. Keep as the preferred observability reference over #80, but rebuild from latest main and do not merge stale runtime code raw. |
| #94 | Pharmacy legal operations | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; schema; migrations likely | rebuild from latest main; migration-stale if schema touched | Valuable compliance domain, but any schema/migration work must be rebuilt using `0049` or later. |
| #95 | Provider runtime enforcement | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; schema/migrations possible; worker/provider tests | rebuild from latest main; migration-stale if schema touched | Valuable provider enforcement domain, but must reuse latest worker/payment/provider hardening and `0049`+ if persistence changes are needed. |
| #96 | Offline/degraded recovery | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | runtime; schema/migrations possible; tests | rebuild from latest main; migration-stale if schema touched | Valuable resilience domain, but must rebuild after payment/provider/worker hardening and migration surgery. |
| #101 | Docs/control branch | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | docs likely | needs human review; likely close/superseded if docs already merged | Classify after GitHub refresh. If it only repeats merged branch-protection/open-PR/migration-control docs, close as superseded. |
| #103 | Validation/migration report | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | docs; CI/scripts likely | do-not-merge; close/superseded if it claims old duplicate migrations | Likely stale validation snapshot after migration surgery. It cannot override current `MIGRATION_AUDIT_STATUS.md`. |
| #104 | CODEOWNERS / critical ownership | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | docs; `.github`; CODEOWNERS likely | keep active if docs/governance-only and non-conflicting | Governance-only critical-file ownership can stay open if it does not conflict and does not modify runtime/schema/migrations. |
| #106 | Docs/control branch | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | docs likely | needs human review; likely close/superseded if docs already merged | Classify after GitHub refresh. Close if superseded by merged migration surgery/open-PR control docs. |
| #108 | Validation/migration report | Unavailable without GitHub auth | `main` assumed | Unavailable | Unavailable | docs; CI/scripts likely | do-not-merge; close/superseded if it claims old duplicate migrations | Likely stale validation/migration report after migration surgery. It cannot override current migration audit. |

## Stale/superseded PR close table

| PRs | Manual action | Required comment |
| --- | --- | --- |
| #2, #3, #4, #5, #6, #7, #8, #9, #10, #11 | Close if still open; apply `do-not-merge` and `superseded` labels before/while closing. | Closing as superseded by later merged work on latest main. Do not merge this branch because it is stale and may revert stock/compliance/payment/security/migration hardening. |
| #19, #44, #46, #47, #62, #66, #68, #76, #86 | Close if still open; apply `do-not-merge` and `superseded`; add `migration-stale` for #68/#86 if migrations are present. | Closing as superseded by later merged work on latest main. Do not merge this branch because it is stale and may revert stock/compliance/payment/security/migration hardening. |
| #80 | Close if #91 is confirmed as the newer active observability branch; otherwise label `needs-human-review` and `do-not-merge`. | Closing as superseded by later merged work on latest main. Do not merge this branch because it is stale and may revert stock/compliance/payment/security/migration hardening. |
| #103, #108 | Close if they still report duplicate migrations from a pre-surgery snapshot; otherwise label `do-not-merge` and refresh. | Closing as superseded by later merged work on latest main. Do not merge this branch because it is stale and may revert stock/compliance/payment/security/migration hardening. |

## Active/rebuild PR table

| PR | Domain | Keep open? | Required label(s) | Required next action |
| ---: | --- | --- | --- | --- |
| #88 | Reservation lifecycle truth | Yes, as reference only | `rebuild-from-main`, `do-not-merge`; add `migration-stale` if schema/migrations touched | Rebuild on latest main after validation is green; use `0049`+ for any migration. |
| #91 | Observability / healthchecks | Yes, preferred observability reference if still open | `rebuild-from-main`, `active-reference` | Rebuild from latest main and avoid stale middleware/runtime assumptions. |
| #94 | Pharmacy legal operations | Yes, as reference only | `rebuild-from-main`, `do-not-merge`, `migration-stale` if schema/migrations touched | Rebuild on latest main with current RBAC/security and `0049`+ migrations only if needed. |
| #95 | Provider runtime enforcement | Yes, as reference only | `rebuild-from-main`, `do-not-merge`, `migration-stale` if schema/migrations touched | Rebuild on latest main with current worker/payment/provider hardening and `0049`+ migrations only if needed. |
| #96 | Offline/degraded recovery | Yes, as reference only | `rebuild-from-main`, `do-not-merge`, `migration-stale` if schema/migrations touched | Rebuild on latest main with current payment/provider/worker safety and `0049`+ migrations only if needed. |
| #104 | CODEOWNERS / critical-file ownership | Yes if governance-only and non-conflicting | `active-reference` or `rebuild-from-main` if stale | Keep only if docs/governance-only; close/rebuild if it touches runtime/schema/migrations. |

## Duplicate PR table

| Duplicate set | Preferred control | Duplicate/reference-only control | Comment for duplicate active concept PRs |
| --- | --- | --- | --- |
| #46 / #47 barcode | Close both if still open because later barcode/product-master work superseded them. | If GitHub evidence shows one contains unique notes, keep only as historical reference with `do-not-merge`. | Keeping only as historical reference. Rebuild from latest main instead of merging directly because this branch is stale/conflicted and may contain obsolete migration numbers or older runtime assumptions. |
| #89 / #90 MySQL concurrency harness | Pick one consolidated rebuild later after comparing files in GitHub. Until then, keep #89 as the tentative preferred reference and #90 as duplicate/reference-only. | Do not merge both; label #90 `duplicate`, `active-reference`, and `do-not-merge` unless GitHub evidence makes #90 the better source. | Keeping only as historical reference. Rebuild from latest main instead of merging directly because this branch is stale/conflicted and may contain obsolete migration numbers or older runtime assumptions. |
| #68 and later accounting/commercial work | Close #68 if still open. | Merged accounting/commercial/journal work is the source of truth. | Keeping only as historical reference. Rebuild from latest main instead of merging directly because this branch is stale/conflicted and may contain obsolete migration numbers or older runtime assumptions. |

## Schema/migration-stale PR table

| PR | Status | Required schema-stale comment |
| ---: | --- | --- |
| #86 | Superseded by merged commercial lifecycle ledger and migration surgery. | Do not merge directly. Rebuild after migration surgery using next reserved migration number from MIGRATION_AUDIT_STATUS.md. |
| #88 | Rebuild candidate if schema/migrations are present. | Do not merge directly. Rebuild after migration surgery using next reserved migration number from MIGRATION_AUDIT_STATUS.md. |
| #94 | Rebuild candidate if schema/migrations are present. | Do not merge directly. Rebuild after migration surgery using next reserved migration number from MIGRATION_AUDIT_STATUS.md. |
| #95 | Rebuild candidate if schema/migrations are present. | Do not merge directly. Rebuild after migration surgery using next reserved migration number from MIGRATION_AUDIT_STATUS.md. |
| #96 | Rebuild candidate if schema/migrations are present. | Do not merge directly. Rebuild after migration surgery using next reserved migration number from MIGRATION_AUDIT_STATUS.md. |
| #103 | Stale validation/migration snapshot if it claims old duplicate prefixes. | Do not merge directly. Rebuild after migration surgery using next reserved migration number from MIGRATION_AUDIT_STATUS.md. |
| #108 | Stale validation/migration snapshot if it claims old duplicate prefixes. | Do not merge directly. Rebuild after migration surgery using next reserved migration number from MIGRATION_AUDIT_STATUS.md. |

## PRs safe to keep open

Only these are safe to keep open, and only with the listed constraints:

- #88, #91, #94, #95, #96: keep as active references, not direct merge branches; all must rebuild from latest main before merge.
- #89/#90: keep only until one consolidated MySQL concurrency harness is chosen; do not merge both.
- #104: keep only if it is CODEOWNERS/critical-file governance-only and does not conflict.
- #101/#106: keep only if live GitHub review proves they are not superseded by newer merged docs/control PRs.

## PRs unsafe to merge raw

All listed stale/superseded PRs are unsafe to merge raw. Specifically: #2-#11, #19, #44, #46, #47, #62, #66, #68, #76, #80, #86, #88, #89, #90, #91, #94, #95, #96, #101, #103, #106, and #108 must not merge without either closure or latest-main rebuild proof. #104 must not merge raw if it touches anything beyond governance ownership files.

## Exact manual GitHub close/label steps

Run these from an authenticated maintainer workstation with `gh` installed:

```bash
# Confirm current open PRs first.
gh pr list --repo zarjun247/247-customer-app --state open --limit 200 \
  --json number,title,headRefName,baseRefName,headRefOid,mergeable,changedFiles,files

# Close stale/superseded PRs that are still open.
for pr in 2 3 4 5 6 7 8 9 10 11 19 44 46 47 62 66 68 76 86; do
  gh pr edit "$pr" --repo zarjun247/247-customer-app --add-label do-not-merge --add-label superseded || true
  gh pr comment "$pr" --repo zarjun247/247-customer-app --body "Closing as superseded by later merged work on latest main. Do not merge this branch because it is stale and may revert stock/compliance/payment/security/migration hardening."
  gh pr close "$pr" --repo zarjun247/247-customer-app
done

# Conditional closes after live confirmation.
# Close #80 only if #91 is the active/newer observability branch.
gh pr edit 80 --repo zarjun247/247-customer-app --add-label do-not-merge --add-label superseded || true
gh pr comment 80 --repo zarjun247/247-customer-app --body "Closing as superseded by later merged work on latest main. Do not merge this branch because it is stale and may revert stock/compliance/payment/security/migration hardening."
gh pr close 80 --repo zarjun247/247-customer-app

# Close #103/#108 only if their reports still claim old duplicate migrations after migration surgery.
for pr in 103 108; do
  gh pr edit "$pr" --repo zarjun247/247-customer-app --add-label do-not-merge --add-label superseded --add-label migration-stale || true
  gh pr comment "$pr" --repo zarjun247/247-customer-app --body "Closing as superseded by later merged work on latest main. Do not merge this branch because it is stale and may revert stock/compliance/payment/security/migration hardening."
  gh pr close "$pr" --repo zarjun247/247-customer-app
done

# Label active rebuild/reference candidates without closing them.
for pr in 88 91 94 95 96; do
  gh pr edit "$pr" --repo zarjun247/247-customer-app --add-label rebuild-from-main --add-label do-not-merge || true
  gh pr comment "$pr" --repo zarjun247/247-customer-app --body "Do not merge directly. Rebuild after migration surgery using next reserved migration number from MIGRATION_AUDIT_STATUS.md."
done

gh pr edit 89 --repo zarjun247/247-customer-app --add-label active-reference --add-label rebuild-from-main || true
gh pr edit 90 --repo zarjun247/247-customer-app --add-label duplicate --add-label active-reference --add-label do-not-merge || true
gh pr comment 90 --repo zarjun247/247-customer-app --body "Keeping only as historical reference. Rebuild from latest main instead of merging directly because this branch is stale/conflicted and may contain obsolete migration numbers or older runtime assumptions."

gh pr edit 104 --repo zarjun247/247-customer-app --add-label active-reference || true
```

## Next required action

1. Run the authenticated GitHub refresh command above.
2. Close stale/superseded PRs only after confirming they are still open.
3. Label active rebuild candidates `do-not-merge` / `rebuild-from-main` so they cannot be accidentally merged raw.
4. Consolidate #89/#90 into one MySQL concurrency harness.
5. Rebuild #88/#91/#94/#95/#96 from latest main one domain at a time after latest-main validation is green.
