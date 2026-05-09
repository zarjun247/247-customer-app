# SCHEMA_PR_FREEZE_LEDGER

Schema/migration-sensitive PR freeze ledger as of 2026-05-09.

> This ledger is informational only. It does not close PRs, merge PRs, edit migrations, or certify production readiness.

## Inspection limits

| Item | Result |
| --- | --- |
| Latest main SHA inspected | `aef2de345c06fce30a298e4a0e195a9ae4039462` |
| Local merge history inspected | Yes, through merge PR `#99`. |
| Current migration filenames inspected | Yes, duplicate `0045` and `0046` prefixes are visible. |
| Live GitHub PR metadata inspected | Not fully. `gh` is unavailable and unauthenticated GitHub API access to `zarjun247/247-customer-app` returned `404 Not Found`. |
| Classification standard | Freeze anything with schema/migration risk until migration surgery and latest-main validation are green. Close/do-not-merge stale duplicates only after maintainer confirms live GitHub state. |

## Freeze table

| PR number | Title | Domain | Modifies schema/migration? | Migration prefix used if visible | Current classification | Recommended action | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| #2 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; changed files unavailable; stale branch risk is higher than salvage value. |
| #3 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; changed files unavailable; must not merge raw. |
| #4 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; current main has moved across schema/security/payment domains. |
| #5 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; live changed-files review required before any salvage. |
| #6 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; stale branch may revert newer behavior. |
| #7 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; do not merge raw. |
| #8 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; changed files unavailable. |
| #9 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; migration/schema risk unknown. |
| #10 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; stale branch policy applies. |
| #11 | Unverified early PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Very old PR relative to main through #99; do not merge raw. |
| #19 | Unverified older PR | Unknown / early branch | Unknown | Not visible | close as stale | Confirm live state; close/do-not-merge if still open. | Not visible as a current-main merge; stale branch policy applies. |
| #44 | Superseded older PR | Unknown / older duplicate | Unknown | Not visible | close as stale | Close as superseded after live confirmation; salvage unique work only by rebuilding. | Existing stale PR docs classify #44 as superseded/do-not-merge. |
| #46 | Superseded barcode duplicate | Barcode | Unknown | Not visible | close as stale | Close as superseded after live confirmation. | Later barcode scan truth and production UX work are visible in main history; raw merge could revert newer behavior. |
| #47 | Superseded barcode duplicate | Barcode | Unknown | Not visible | close as stale | Close as superseded after live confirmation. | Later barcode work exists; stale duplicate should not merge raw. |
| #62 | Superseded payment fail-closed duplicate | Payment/provider | Unknown | Not visible | close as stale | Close as superseded after live confirmation. | Later payment provider fail-closed and webhook hardening work are visible in main history. |
| #66 | Product-master runtime gates | Product master | Possible historical schema risk, but superseded locally | Not visible | close as stale | If original is still open, close as superseded by #75; do not merge raw. | Local history includes `Merge pull request #75 ... rebase-pr-#66-for-product-master-runtime-gates`. |
| #68 | Accounting duplicate | Accounting / reconciliation | Unknown / possible | Not visible | close as stale | Confirm live state; close as superseded unless unique work is rebuilt from latest main. | Later accounting, Tally, reconciliation, and commercial lifecycle work is visible in main history. |
| #76 | Unverified stale PR | Unknown | Unknown | Not visible | freeze | Review changed files live; rebuild from latest main if still needed. | Not visible in local merge history; could overlap runtime/schema after many later merges. |
| #80 | Unverified stale PR | Unknown / security-index window | Unknown | Not visible | freeze | Review changed files live; rebuild from latest main if still needed. | Not visible in local merge history; may overlap later database index/API abuse/privacy work. |
| #86 | Unverified post-#85 PR | Unknown | Unknown | Not visible | freeze | Review changed files live; do not merge until latest-main validation and schema freeze review. | Not visible in local merge history; changed files unavailable. |
| #88 | Reservation lifecycle truth | Reservation lifecycle | Unknown / likely if reservation schema changed | Not visible | rebuild after surgery | Freeze now; rebuild from post-surgery latest main if schema/migration is still required. | Reservation schema assumptions are unsafe while migration numbering is blocked; runtime reservation mutation is restricted. |
| #89 | MySQL concurrency harness | DB test lifecycle / concurrency | Unknown | Not visible | freeze | Freeze until changed-files review; choose only one of #89/#90 later if duplicate. | Likely test harness, but any migration reference or stale SQL assumption must wait for surgery. |
| #90 | MySQL concurrency harness | DB test lifecycle / concurrency | Unknown | Not visible | freeze | Freeze until changed-files review; choose only one of #89/#90 later if duplicate. | Likely duplicate/concurrent test harness; changed files and migration assumptions unverified. |
| #91 | Observability / healthchecks | Observability | Likely no | Not visible | no schema risk | Salvage after latest-main validation if changed-files review confirms no schema/migration touch. | Expected to be observability-only; still needs current-main validation because live PR metadata was unavailable. |
| #94 | Pharmacy legal operations | Pharmacy legal / compliance | Likely yes | Likely stale `0045` | rebuild after surgery | Freeze; rebuild from post-surgery latest main with next reserved migration number. | User-provided context expects stale `0045`; current main already has duplicate `0045` migration prefixes. |
| #95 | Provider runtime enforcement | Provider runtime | Likely yes | Likely stale `0045` | rebuild after surgery | Freeze; rebuild first after surgery if still required. | User-provided context expects stale `0045`; provider/schema changes must not merge during migration collision. |
| #96 | Offline degradation / recovery | Offline/recovery | Likely yes | Likely stale `0045` | rebuild after surgery | Freeze; rebuild from post-surgery latest main with next reserved migration number. | User-provided context expects stale `0045`; schema/migration collision risk is high. |

## Current freeze decision

- Freeze all schema/migration PRs until `fix/migration-sequence-collision-surgery` merges and latest-main validation passes.
- Treat PRs with stale `0045` or `0046` migrations as rebuild-only, not mergeable.
- Treat old duplicate PRs as close/do-not-merge after live maintainer confirmation.
- Do not close PRs from this branch; this environment lacks authenticated GitHub tooling.
