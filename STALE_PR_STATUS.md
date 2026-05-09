# STALE_PR_STATUS

Canonical stale/open PR control ledger as of 2026-05-09.

> **Environment note:** direct GitHub close/label operations were not performed. This checkout has no configured git remote, GitHub CLI is not installed, and the unauthenticated GitHub API could not read the inferred private repository. The manual close/label instructions below are therefore the authoritative action plan until a maintainer runs them in GitHub.

## Latest main hardening context

Local HEAD is `aef2de345c06fce30a298e4a0e195a9ae4039462`, which contains local merge evidence for PRs `#99`, `#98`, `#97`, `#93`, `#92`, `#87`, `#85`, and `#84`.

## Stale PRs to close

| PR | Classification | Superseded by | Manual action |
| --- | --- | --- | --- |
| `#2` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#3` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#4` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#5` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#6` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#7` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#8` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#9` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#10` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#11` | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or apply `do-not-merge`, `superseded`, `stale-base`. |
| `#19` | stale audit unification; do-not-merge | `#13`, `#14`-`#20`, `#30`, `#93` | Close or apply `do-not-merge`, `superseded`, `audit`. |
| `#44` | stale CI/docs cleanup; do-not-merge | `#45`, `#74`, `#92`, `#93` | Close or apply `do-not-merge`, `superseded`, `governance`. |
| `#62` | stale payment fail-closed; do-not-merge | `#63`, `#85` | Close or apply `do-not-merge`, `superseded`, `payment`. |
| `#66` | stale original product-master gates branch; do-not-merge | `#75` | Close original or apply `do-not-merge`, `superseded`, `product-master`. |
| `#68` | stale accounting journal batch branch; do-not-merge | `#69`, `#72`, `#73`, `#87` | Close or apply `do-not-merge`, `superseded`, `accounting`. |
| `#76` | stale CI governance branch; do-not-merge | `#92`, `#93` | Close or apply `do-not-merge`, `superseded`, `governance`. |
| `#86` | stale commercial lifecycle branch; do-not-merge | `#87` | Close or apply `do-not-merge`, `superseded`, `commercial-lifecycle`. |

## Duplicate PRs to close

| PR | Duplicate domain | Keep / source of truth | Manual action |
| --- | --- | --- | --- |
| `#46` | Barcode UX / product-master gates | Later barcode/product-master line: `#29`, `#41`, `#61`, `#75` | Close or apply `do-not-merge`, `superseded`, `duplicate`, `barcode`. |
| `#47` | Barcode UX / product-master gates | Later barcode/product-master line: `#29`, `#41`, `#61`, `#75` | Close or apply `do-not-merge`, `superseded`, `duplicate`, `barcode`. |
| `#80` | Observability | `#91` if still active; otherwise a fresh latest-main observability branch | Close or apply `do-not-merge`, `duplicate`, `observability`. |
| one of `#89` / `#90` | MySQL concurrency harness | Select one canonical harness after GitHub inspection | Close the other as duplicate; rebuild chosen branch from latest main. |

## Do-not-merge PRs

Do not merge raw: `#2`, `#3`, `#4`, `#5`, `#6`, `#7`, `#8`, `#9`, `#10`, `#11`, `#19`, `#44`, `#46`, `#47`, `#62`, `#66`, `#68`, `#76`, `#80`, `#86`, and any branch with stale duplicate `0045` / `0046` migration prefixes.

## Active / rebuild PRs

| PR | Status | Required next action |
| --- | --- | --- |
| `#88` | Active concept; conflicted/rebuild | Rebuild reservation lifecycle truth from latest main after stock truth certification and migration surgery. |
| `#89` | Active or duplicate concurrency harness | Choose one of `#89` / `#90` as canonical, then rebuild from latest main. |
| `#90` | Duplicate concurrency harness candidate | Close if `#89` is canonical; otherwise keep and rebuild while closing `#89`. |
| `#91` | Active observability concept | Preserve/salvage from latest main; ensure it does not touch auth/session/payment/provider/stock behavior without owner review. |
| `#94` | Active concept; migration-stale/rebuild | Pause until migration surgery merges; rebuild pharmacy legal ops from latest main. |
| `#95` | Active concept; migration-stale/rebuild | Pause until migration surgery merges; rebuild provider runtime enforcement from latest main. |
| `#96` | Active concept; migration-stale/rebuild | Pause until migration surgery merges; rebuild offline degradation/recovery from latest main. |

## Manual closure comments

Use this exact comment format when closing superseded PRs:

> Closing as superseded by `<merged PR>`. Do not merge this branch because it is based on stale main and may revert later stock/compliance/payment/security/migration work.

Suggested substitutions:

| PR | `<merged PR>` value |
| --- | --- |
| `#2`-`#11` | `#93/#98/#99` |
| `#19` | `#93` |
| `#44` | `#92/#93` |
| `#46` | `#61/#75` |
| `#47` | `#61/#75` |
| `#62` | `#85` |
| `#66` | `#75` |
| `#68` | `#87` |
| `#76` | `#92` |
| `#80` | `#91` if `#91` is preserved; otherwise `latest-main observability rebuild` |
| `#86` | `#87` |

## Manual label instructions

If closing is not immediately possible, apply labels instead:

1. `do-not-merge`
2. `superseded` or `duplicate`
3. domain label (`barcode`, `payment`, `governance`, `accounting`, `observability`, `commercial-lifecycle`, `product-master`)
4. `stale-base`
5. `migration-stale` for any PR carrying old duplicate `0045` / `0046` migration prefixes

## Merge-control rule

Latest main wins unless an active rebuild PR owns the exact current domain. Stale branches must be closed or rebuilt; do not resolve code conflicts in stale branches as a path to merge.
