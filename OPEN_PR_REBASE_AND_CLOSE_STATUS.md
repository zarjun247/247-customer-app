# OPEN_PR_REBASE_AND_CLOSE_STATUS

Open PR stale-branch control status for `chore/stale-pr-closure-do-not-merge-lock` on 2026-05-09.

## Inspection metadata

| Item | Status |
| --- | --- |
| Latest main-equivalent SHA inspected | `200fafcc20451cc43e8d6272588ec7e26e12d9c8` |
| Local branch used for this control PR | `chore/stale-pr-closure-do-not-merge-lock` |
| Timestamp/date | `2026-05-09T00:00:00Z` |
| Required GitHub main pull/rebase | Attempted, but HTTPS fetch from `https://github.com/zarjun247/247-customer-app.git` failed because this container has no GitHub credentials for the private repository. |
| GitHub PR closure/labels executed | **No.** `gh` is not installed, unauthenticated REST API returned `404 Not Found`, and authenticated GitHub mutation was unavailable. |
| Runtime code changed | No. |
| Migrations changed | No. |
| Package/lockfile changed | No. |
| Migration tail verified locally | `0045_provider_webhook_events.sql`, `0046_commercial_event_ledger.sql`, `0047_worker_jobs.sql`, `0048_rbac_staff_session_governance.sql`; next migration should be `0049` unless a later authenticated main already used it. |

Because live PR metadata was unavailable, `title`, `branch`, `latest commit SHA`, `mergeable`, and `changed file categories` are conservative records from local history, merged PR evidence, and the requested stale-PR policy. Maintainers must run the manual GitHub commands below before claiming any PR was closed or labelled.

## Full open PR classification table

| PR | Title | Branch | Base | Latest commit SHA | Mergeable | Changed file categories | Classification | Exact reason |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| #2 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #3 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #4 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #5 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #6 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #7 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #8 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #9 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #10 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #11 | Legacy audit/stabilization PR | `unknown legacy branch` | `main` | `unknown` | unknown | unknown (requires authenticated GitHub diff) | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #19 | Legacy audit PR | `unknown legacy audit branch` | `main` | `unknown` | unknown | runtime/CI/docs unknown until auth diff | close/superseded | Old audit branch; superseded by current-main governance and production-readiness documents. |
| #44 | Old CI/docs cleanup | `unknown stale CI/docs branch` | `main` | `unknown` | unknown | docs, CI/scripts likely | close/superseded | Superseded by newer governance/current-main docs and branch protection proof. |
| #46 | Old barcode duplicate | `unknown barcode branch` | `main` | `unknown` | unknown | frontend/runtime likely | close/superseded | Barcode duplicate superseded by merged barcode/product-master/runtime work. |
| #47 | Old barcode duplicate | `unknown barcode branch` | `main` | `unknown` | unknown | frontend/runtime likely | close/superseded | Barcode duplicate superseded by merged barcode/product-master/runtime work. |
| #62 | Old payment fail-closed branch | `unknown payment branch` | `main` | `unknown` | unknown | runtime likely | close/superseded | Superseded by merged payment verification and webhook hardening. |
| #66 | Old product-master runtime gates | `unknown product-master branch` | `main` | `unknown` | unknown | runtime/schema possibly | close/superseded | Superseded by merged PR #75 product-master runtime gates rebuild. |
| #68 | Old accounting duplicate | `unknown accounting branch` | `main` | `unknown` | unknown | runtime/schema/migrations possible | close/superseded | Superseded by later commercial/accounting/journal work even if GitHub reports mergeable. |
| #76 | Old CI governance branch | `unknown governance branch` | `main` | `unknown` | unknown | docs, CI/scripts likely | close/superseded | Superseded by merged governance scans and branch-protection proof if still open. |
| #80 | Old observability branch | `unknown observability branch` | `main` | `unknown` | unknown | runtime/CI possibly | close/superseded | Superseded by later observability rebuild concepts; do not merge stale observability raw. |
| #86 | Old commercial lifecycle branch | `unknown commercial branch` | `main` | `unknown` | unknown | runtime/schema/migrations likely | close/superseded | Superseded by merged commercial event ledger PR #87. |
| #88 | Old reservation lifecycle | `unknown reservation branch` | `main` | `unknown` | unknown | runtime/schema/migrations likely | do-not-merge | Superseded by newer reservation rebuild concept; stale migration/lifecycle assumptions may overwrite current stock truth. |
| #89 | Old MySQL harness variant | `unknown mysql harness branch` | `main` | `unknown` | unknown | CI/scripts/tests likely | duplicate | Superseded by consolidated MySQL concurrency proof PR #116; keep only unique reference cases. |
| #90 | Old MySQL harness variant | `unknown mysql harness branch` | `main` | `unknown` | unknown | CI/scripts/tests likely | duplicate | Duplicate harness variant; consolidated harness is merged in PR #116, so do not merge both. |
| #91 | Old observability branch | `unknown observability branch` | `main` | `unknown` | unknown | runtime/CI possibly | do-not-merge | Superseded by new observability rebuild; direct merge may reintroduce stale assumptions. |
| #94 | Old pharmacy legal ops | `unknown legal ops branch` | `main` | `unknown` | unknown | schema/migrations/runtime likely | rebuild from latest main | Migration-sensitive legal ops work; rebuild later with next reserved migration number. |
| #95 | Old provider runtime | `unknown provider runtime branch` | `main` | `unknown` | unknown | schema/migrations/runtime likely | do-not-merge | Stale provider runtime with migration-number risk; superseded by newer provider rebuild concept. |
| #96 | Old offline/degraded mode | `unknown offline degraded branch` | `main` | `unknown` | unknown | schema/migrations/runtime likely | rebuild from latest main | Persistence-sensitive offline/degraded work; rebuild after migration surgery using next free number if needed. |
| #101 | Stale docs/validation/control PR | `unknown control branch` | `main` | `unknown` | unknown | docs/CI likely | do-not-merge | Likely stale control snapshot; authenticated diff must prove unique value before review. |
| #103 | Stale validation PR | `unknown validation branch` | `main` | `unknown` | unknown | docs/CI likely | do-not-merge | Validation may predate migration surgery; stale duplicate-migration claims cannot override current main truth. |
| #104 | CODEOWNERS/governance PR | `unknown codeowners branch` | `main` | `unknown` | unknown | docs/CI likely | close/superseded | CODEOWNERS work appears merged through PR #111; if still open, close as superseded unless authenticated diff proves unique clean governance-only value. |
| #106 | Stale docs/control PR | `unknown control branch` | `main` | `unknown` | unknown | docs/CI likely | do-not-merge | Likely duplicated by merged migration surgery/control-room docs; verify then close as superseded. |
| #108 | Stale validation PR | `unknown validation branch` | `main` | `unknown` | unknown | docs/CI likely | do-not-merge | Validation result may predate later migration/governance fixes; rerun from current main instead. |
| #110 | Old stale-PR closure branch | `unknown stale-pr closure branch` | `main` | `unknown` | unknown | docs likely | do-not-merge | Prior stale-PR closure branch conflicted; this branch rebuilds the concept and old branch must not merge raw. |
| #113 | Runtime stub/fake-success audit | `unknown fake-success audit branch` | `main` | `unknown` | unknown | runtime/docs/tests likely | keep active | Valuable audit reference if open, but do not merge raw unless latest-main compatibility is proven. |
| #114 | Provider runtime attempts | `unknown provider branch` | `main` | `unknown` | unknown | runtime/schema/migrations likely | rebuild from latest main | Valuable but migration-sensitive; rebuild from latest main with correct next migration number. |
| #115 | Reservation lifecycle | `unknown reservation branch` | `main` | `unknown` | unknown | runtime/schema/migrations likely | rebuild from latest main | Valuable but migration-sensitive; sequence after provider or reserve next free migration number. |
| #117 | Observability | `unknown observability branch` | `main` | `unknown` | unknown | runtime/CI/scripts likely | rebuild from latest main | Valuable observability concept but conflicted/stale; rebuild from latest main. |

## Stale/superseded PR close table

| PR | Action | Reason |
| ---: | --- | --- |
| #2 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #3 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #4 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #5 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #6 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #7 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #8 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #9 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #10 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #11 | close/superseded | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. |
| #19 | close/superseded | Old audit branch; superseded by current-main governance and production-readiness documents. |
| #44 | close/superseded | Superseded by newer governance/current-main docs and branch protection proof. |
| #46 | close/superseded | Barcode duplicate superseded by merged barcode/product-master/runtime work. |
| #47 | close/superseded | Barcode duplicate superseded by merged barcode/product-master/runtime work. |
| #62 | close/superseded | Superseded by merged payment verification and webhook hardening. |
| #66 | close/superseded | Superseded by merged PR #75 product-master runtime gates rebuild. |
| #68 | close/superseded | Superseded by later commercial/accounting/journal work even if GitHub reports mergeable. |
| #76 | close/superseded | Superseded by merged governance scans and branch-protection proof if still open. |
| #80 | close/superseded | Superseded by later observability rebuild concepts; do not merge stale observability raw. |
| #86 | close/superseded | Superseded by merged commercial event ledger PR #87. |
| #104 | close/superseded | CODEOWNERS work appears merged through PR #111; if still open, close as superseded unless authenticated diff proves unique clean governance-only value. |

## Active rebuild/reference table

| PR | Classification | Replacement plan |
| ---: | --- | --- |
| #94 | rebuild from latest main | Keep as reference for legal-ops requirements only; rebuild after migration-number reservation. |
| #96 | rebuild from latest main | Keep as reference for offline/degraded behavior only; rebuild after current-main diff review. |
| #113 | keep active/reference-only | Keep as valuable runtime stub/fake-success audit reference; do not merge raw unless latest-main compatible. |
| #114 | rebuild from latest main | Rebuild provider runtime from latest main and assign the next free migration number if schema changes remain required. |
| #115 | rebuild from latest main | Rebuild reservation lifecycle after #114 or reserve the next distinct migration number; never share the same migration number. |
| #117 | rebuild from latest main | Rebuild observability from latest main and validate against current HTTP/security/provider bootstraps. |

## Migration-stale PR table

| PR | Action | Reason |
| ---: | --- | --- |
| #88 | do-not-merge | Superseded by newer reservation rebuild concept; stale migration/lifecycle assumptions may overwrite current stock truth. |
| #94 | rebuild from latest main | Migration-sensitive legal ops work; rebuild later with next reserved migration number. |
| #95 | do-not-merge | Stale provider runtime with migration-number risk; superseded by newer provider rebuild concept. |
| #96 | rebuild from latest main | Persistence-sensitive offline/degraded work; rebuild after migration surgery using next free number if needed. |
| #114 | rebuild from latest main | Valuable but migration-sensitive; rebuild from latest main with correct next migration number. |
| #115 | rebuild from latest main | Valuable but migration-sensitive; sequence after provider or reserve next free migration number. |

## Duplicate PR table

| PR | Action | Reason |
| ---: | --- | --- |
| #46 | close/superseded | Barcode duplicate superseded by merged barcode/product-master/runtime work. |
| #47 | close/superseded | Barcode duplicate superseded by merged barcode/product-master/runtime work. |
| #68 | close/superseded | Superseded by later commercial/accounting/journal work even if GitHub reports mergeable. |
| #89 | duplicate | Superseded by consolidated MySQL concurrency proof PR #116; keep only unique reference cases. |
| #90 | duplicate | Duplicate harness variant; consolidated harness is merged in PR #116, so do not merge both. |

## PRs unsafe to merge raw

Every PR listed in the classification table is unsafe to merge raw until authenticated GitHub review proves it was rebuilt from latest main and passes current checks. The highest-risk raw merges are #88, #94, #95, #96, #110, #113, #114, #115, and #117 because they may touch runtime, schema, migrations, provider behavior, reservation behavior, or observability bootstraps.

## Manual close/label instructions

1. Authenticate GitHub locally: `gh auth login`.
2. Refresh live state: `gh pr list --state open --limit 200 --json number,title,headRefName,baseRefName,headRefOid,mergeable,changedFiles,labels,url`.
3. Create labels if missing:
   - `gh label create do-not-merge --color B60205 --description "Must not merge raw" || true`
   - `gh label create superseded --color 5319E7 --description "Superseded by later merged work" || true`
   - `gh label create stale --color C5DEF5 --description "Stale branch or validation" || true`
   - `gh label create rebuild-from-latest-main --color FBCA04 --description "Rebuild from latest main before review" || true`
   - `gh label create migration-stale --color D93F0B --description "Contains stale migration assumptions" || true`
   - `gh label create reference-only --color 0E8A16 --description "Historical reference only" || true`
4. For clearly superseded PRs (#2-#11, #19, #44, #46, #47, #62, #66, #68, #76, #80, #86, and #104 if CODEOWNERS is already merged), post the stale/superseded comment template and close.
5. For #88, #91, #94, #95, #96, #101, #103, #106, #108, #110, #113, #114, #115, and #117, apply `do-not-merge` plus the more specific labels (`migration-stale`, `rebuild-from-latest-main`, or `reference-only`) instead of closing unless maintainers decide the branch is fully superseded.

## Manual close/comment templates

### Stale/superseded PRs

> Closing as superseded by later merged work on latest main. Do not merge this branch because it is stale and may revert stock/compliance/payment/security/migration hardening.

### Duplicate active concept PRs

> Keeping only as historical reference. Rebuild from latest main instead of merging directly because this branch is stale/conflicted and may contain obsolete migration numbers or older runtime assumptions.

### Schema-stale PRs

> Do not merge directly. Rebuild after migration surgery using the next reserved migration number from MIGRATION_AUDIT_STATUS.md.

### Stale validation PRs

> Validation result is stale and predates later migration/governance fixes. Do not merge raw. Re-run validation from current main instead.

## Next required action

Run the manual GitHub refresh/label/closure sequence with authenticated maintainer credentials, then update this document with the real PR titles, branches, head SHAs, mergeability, labels applied, close actions executed, and the resulting GitHub URLs.
