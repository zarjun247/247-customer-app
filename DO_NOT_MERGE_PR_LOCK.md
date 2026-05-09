# DO_NOT_MERGE_PR_LOCK

Do-not-merge lock for stale, duplicate, migration-sensitive, validation-stale, and conflicted PRs as of 2026-05-09.

## Lock metadata

| Item | Status |
| --- | --- |
| Latest main-equivalent SHA inspected | `200fafcc20451cc43e8d6272588ec7e26e12d9c8` |
| Control branch | `chore/stale-pr-closure-do-not-merge-lock` |
| GitHub close/label actions actually executed | No; this environment lacks authenticated GitHub tooling. |
| Runtime/schema/migration/package files changed by this branch | No. |

## Locked PRs

| PR | Must not merge raw because | Risk category | Replacement plan |
| ---: | --- | --- | --- |
| #2 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #3 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #4 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #5 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #6 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #7 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #8 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #9 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #10 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #11 | Very old pre-current-main audit/stabilization branch; superseded by later hardening and unsafe to merge raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #19 | Old audit branch; superseded by current-main governance and production-readiness documents. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #44 | Superseded by newer governance/current-main docs and branch protection proof. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #46 | Barcode duplicate superseded by merged barcode/product-master/runtime work. | duplicate domain | Close/label as superseded after authenticated confirmation. |
| #47 | Barcode duplicate superseded by merged barcode/product-master/runtime work. | duplicate domain | Close/label as superseded after authenticated confirmation. |
| #62 | Superseded by merged payment verification and webhook hardening. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #66 | Superseded by merged PR #75 product-master runtime gates rebuild. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #68 | Superseded by later commercial/accounting/journal work even if GitHub reports mergeable. | duplicate domain | Close/label as superseded after authenticated confirmation. |
| #76 | Superseded by merged governance scans and branch-protection proof if still open. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #80 | Superseded by later observability rebuild concepts; do not merge stale observability raw. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #86 | Superseded by merged commercial event ledger PR #87. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #88 | Superseded by newer reservation rebuild concept; stale migration/lifecycle assumptions may overwrite current stock truth. | stale migration; stale main | Rebuild from latest main or keep as historical reference only. |
| #89 | Superseded by consolidated MySQL concurrency proof PR #116; keep only unique reference cases. | duplicate domain | Use merged PR #116 consolidated MySQL harness; salvage only unique test cases. |
| #90 | Duplicate harness variant; consolidated harness is merged in PR #116, so do not merge both. | duplicate domain | Use merged PR #116 consolidated MySQL harness; salvage only unique test cases. |
| #91 | Superseded by new observability rebuild; direct merge may reintroduce stale assumptions. | conflicted branch; stale main | Rebuild from latest main or keep as historical reference only. |
| #94 | Migration-sensitive legal ops work; rebuild later with next reserved migration number. | stale migration; stale main | Rebuild from latest main or keep as historical reference only. |
| #95 | Stale provider runtime with migration-number risk; superseded by newer provider rebuild concept. | stale migration; stale main | Rebuild from latest main or keep as historical reference only. |
| #96 | Persistence-sensitive offline/degraded work; rebuild after migration surgery using next free number if needed. | stale migration; stale main | Rebuild from latest main or keep as historical reference only. |
| #101 | Likely stale control snapshot; authenticated diff must prove unique value before review. | stale main; conflicted branch; stale validation or migration risk | Rebuild from latest main or keep as historical reference only. |
| #103 | Validation may predate migration surgery; stale duplicate-migration claims cannot override current main truth. | stale validation | Rebuild from latest main or keep as historical reference only. |
| #104 | CODEOWNERS work appears merged through PR #111; if still open, close as superseded unless authenticated diff proves unique clean governance-only value. | stale main; superseded by merged work | Close/label as superseded after authenticated confirmation. |
| #106 | Likely duplicated by merged migration surgery/control-room docs; verify then close as superseded. | stale main; conflicted branch; stale validation or migration risk | Rebuild from latest main or keep as historical reference only. |
| #108 | Validation result may predate later migration/governance fixes; rerun from current main instead. | stale validation | Rebuild from latest main or keep as historical reference only. |
| #110 | Prior stale-PR closure branch conflicted; this branch rebuilds the concept and old branch must not merge raw. | conflicted branch; stale main | Rebuild from latest main or keep as historical reference only. |
| #113 | Valuable audit reference if open, but do not merge raw unless latest-main compatibility is proven. | reference-only; conflicted branch | Rebuild from latest main or keep as historical reference only. |
| #114 | Valuable but migration-sensitive; rebuild from latest main with correct next migration number. | stale migration; stale main | Sequence provider and reservation work; assign distinct next-free migration numbers if migrations are required. |
| #115 | Valuable but migration-sensitive; sequence after provider or reserve next free migration number. | stale migration; stale main | Sequence provider and reservation work; assign distinct next-free migration numbers if migrations are required. |
| #117 | Valuable observability concept but conflicted/stale; rebuild from latest main. | conflicted branch; stale main | Rebuild from latest main or keep as historical reference only. |

## Domain replacement rules

- Stale validation PRs cannot override current main truth; rerun validation from the latest protected `main` before using the result.
- Schema/migration PRs must read `MIGRATION_AUDIT_STATUS.md` and reserve the next available migration number before coding.
- Provider runtime and reservation lifecycle migrations must be sequential if both require schema changes; #114 and #115 must not both use `0049`.
- One active PR per domain is allowed; duplicate barcode/payment/accounting/MySQL/observability branches must close or be labelled `do-not-merge` plus `reference-only`.
- No old branch may resolve conflicts by deleting current stock, payment, compliance, security, provider, reservation, migration, or governance hardening.
