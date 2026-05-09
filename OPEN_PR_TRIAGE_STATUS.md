# OPEN_PR_TRIAGE_STATUS

Open PR triage and merge-control ledger as of 2026-05-09.

> **Environment / GitHub access note:** this container started from local HEAD `aef2de345c06fce30a298e4a0e195a9ae4039462`, which is the local latest-main equivalent after PR `#99`. `git fetch origin main --prune` / `git pull --rebase origin main` could not run because this checkout has no configured `origin` remote, GitHub CLI is not installed, and unauthenticated GitHub API access to the inferred private repository returned unavailable. Live GitHub fields below are therefore treated conservatively: **mergeable is `false` for merge control until the PR is rebased from latest main and verified in GitHub.** Do not use this ledger as proof that live GitHub labels or PR state were changed.

## Latest main context verified locally

| Item | Local evidence |
| --- | --- |
| Latest local main-equivalent SHA | `aef2de345c06fce30a298e4a0e195a9ae4039462` |
| PR `#99` | Merged: stock truth certification (`Merge pull request #99 from zarjun247/codex/certify-stock-mutation-gateways-and-reporting`) |
| PR `#98` | Merged: RBAC + staff session governance (`Merge pull request #98 from zarjun247/codex/complete-runtime-rbac-and-session-governance`) |
| PR `#97` | Merged: worker queue reliability (`Merge pull request #97 from zarjun247/codex/add-queue-and-worker-reliability-layer`) |
| PR `#93` | Merged: current-main audit v2 (`Merge pull request #93 from zarjun247/codex/conduct-current-main-audit-and-merge-pass`) |
| PR `#92` | Merged: governance security scans (`Merge pull request #92 from zarjun247/codex/rebuild-governance-security-scans-from-main`) |
| PR `#87` | Merged: commercial lifecycle ledger (`Merge pull request #87 from zarjun247/codex/create-canonical-commercial-lifecycle-foundation`) |
| PR `#85` | Merged: payment webhook lifecycle (`Merge pull request #85 from zarjun247/codex/complete-payment-webhook-lifecycle-safety`) |
| PR `#84` | Merged: deployment / backup / restore proof scripts (`Merge pull request #84 from zarjun247/codex/add-deployment-proof-and-release-gate-scripts`) |

## Current open-PR merge-control table

| PR number | Title | Branch | Base SHA | Mergeable | Classification | Superseded by | Recommended action | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#2` | Old stabilization / audit PR | unavailable in this environment | unverified; older than `aef2de345c06fce30a298e4a0e195a9ae4039462` if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Early stabilization/audit work predates later current-main audit, security, RBAC, route, and stock hardening merges. |
| `#3` | Old stabilization / audit PR | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Same stale generation as `#2`; must not merge over later safety work. |
| `#4` | Old stabilization / audit PR | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Same stale generation as `#2`; likely reverts later audit/security hardening if merged raw. |
| `#5` | Old stabilization / audit PR | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Same stale generation as `#2`; not a current domain owner. |
| `#6` | Old stabilization / audit PR | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Same stale generation as `#2`; later route/RBAC/security work wins. |
| `#7` | Old stabilization / audit PR | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Same stale generation as `#2`; close instead of resolving stale conflicts. |
| `#8` | Old stabilization / audit PR | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Same stale generation as `#2`; unsafe to merge after hardening merges. |
| `#9` | Old stabilization / audit PR | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Same stale generation as `#2`; latest main owns the baseline. |
| `#10` | Old stabilization / audit PR | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Same stale generation as `#2`; raw merge can regress stock/compliance/payment/security work. |
| `#11` | Old stabilization / audit PR | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#12`, `#13`, `#30`, `#31`, `#48`, `#93`, `#98`, `#99` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Same stale generation as `#2`; superseded by later audit and hardening line. |
| `#19` | Stale audit unification pass | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#13`, `#14`-`#20`, `#30`, `#93` | Close or label `do-not-merge`, `superseded`, `stale-base`. | Audit-helper / unification work has later merged replacements and current-main audit coverage. |
| `#44` | Stale CI / docs cleanup | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#45`, `#74`, `#92`, `#93` | Close or label `do-not-merge`, `superseded`, `stale-base`. | CI/docs governance work was overtaken by later CI setup, stale PR control, governance scans, and current-main audit. |
| `#46` | Duplicate barcode UX branch | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; duplicate; do-not-merge | `#29`, `#41`, `#61`, `#66`/`#75` | Close or label `do-not-merge`, `superseded`, `duplicate`, `barcode`. | Barcode/product-master runtime work was rebuilt/merged later; old barcode branch can reintroduce stale product gates. |
| `#47` | Duplicate barcode UX branch | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; duplicate; do-not-merge | `#29`, `#41`, `#61`, `#66`/`#75` | Close or label `do-not-merge`, `superseded`, `duplicate`, `barcode`. | Duplicate of old barcode UX line; do not resolve conflicts on this branch. |
| `#62` | Old payment fail-closed branch | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#63`, `#85` | Close or label `do-not-merge`, `superseded`, `payment`. | Payment fail-closed/webhook lifecycle work merged later; raw merge can regress current payment verification. |
| `#66` | Old product-master runtime gates branch | `codex/rebase-pr-#66-for-product-master-runtime-gates` lineage | unverified; older than latest main if original still open | `false` governance hold | stale/superseded; do-not-merge | `#75` | Close original or label `do-not-merge`, `superseded`, `product-master`. | Local history shows PR `#75` merged a rebased replacement for PR `#66`; original should not merge. |
| `#68` | Old accounting journal batch branch | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#69`, `#72`, `#73`, `#87` | Close or label `do-not-merge`, `superseded`, `accounting`. | Later balanced journal batch, credit-note, commercial lifecycle tests, and commercial ledger work supersede it. |
| `#76` | Old CI governance branch | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#92`, `#93` | Close or label `do-not-merge`, `superseded`, `governance`. | Governance security scans and current-main audit v2 merged after it; stale branch is not the current governance source. |
| `#80` | Old observability branch | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | duplicate or conflicted/rebuild; do-not-merge | `#91` if active; otherwise later observability/mainline owner | Close or label `do-not-merge`, `superseded-by-91` after confirming `#91` is active. | Observability remains valuable, but only one observability PR should own it; `#80` is the old line. |
| `#86` | Old commercial lifecycle branch | unavailable in this environment | unverified; older than latest main if still open | `false` governance hold | stale/superseded; do-not-merge | `#87` | Close or label `do-not-merge`, `superseded`, `commercial-lifecycle`. | Commercial lifecycle ledger merged through PR `#87`; original old branch should not merge. |
| `#88` | Reservation lifecycle truth | unavailable in this environment | unverified; likely older than latest main | `false` until rebuilt | active; conflicted/rebuild | Not superseded; overlaps stock/reservation line after `#99` | Preserve concept, close/rebuild or force-rebase from latest main before review. | Reservation lifecycle is valuable, but it must be rebuilt after stock truth certification and migration surgery; do not merge stale branch directly. |
| `#89` | MySQL concurrency harness | unavailable in this environment | unverified; likely older than latest main | `false` until rebuilt | active or duplicate | Choose one of `#89` / `#90` | Keep only if it is the cleaner source of truth; otherwise close as duplicate and rebuild from latest main. | Concurrency proof is valuable, but duplicate harness PRs must not race each other or touch migrations during surgery. |
| `#90` | MySQL concurrency harness duplicate | unavailable in this environment | unverified; likely older than latest main | `false` until rebuilt | duplicate | `#89` if selected as canonical, or vice versa | Close one of `#89` / `#90`; rebuild the chosen harness from latest main after migration numbering is clean. | Duplicate domain; one active PR per domain. |
| `#91` | Observability / health telemetry | unavailable in this environment | unverified; likely older than latest main | `false` until rebuilt | active; conflicted/rebuild | Not superseded if still open; supersedes `#80` | Preserve/salvage from latest main after confirming no runtime-risk overlap. | Observability is valuable, but it must not regress auth/session, provider, payment, or stock behavior merged later. |
| `#94` | Pharmacy legal operations | unavailable in this environment | unverified; likely older than latest main | `false` until rebuilt | migration-stale/rebuild; active concept | Not superseded | Pause until migration surgery merges; rebuild from latest main and use clean migration number if schema change is required. | Legal ops is valuable, but any duplicate old `0045`/`0046` migration prefix is blocked. |
| `#95` | Provider runtime enforcement | unavailable in this environment | unverified; likely older than latest main | `false` until rebuilt | migration-stale/rebuild; active concept | Not superseded | Pause until migration surgery merges; rebuild from latest main and revalidate provider fail-closed semantics. | Provider enforcement is valuable, but stale provider branches must not reintroduce fake success or stale payment/provider verification. |
| `#96` | Offline degradation / recovery | unavailable in this environment | unverified; likely older than latest main | `false` until rebuilt | migration-stale/rebuild; active concept | Not superseded | Pause until migration surgery merges; rebuild from latest main. | Offline recovery is valuable, but schema/migration work must wait for the migration numbering cleanup. |

## Stale migration-number control

Current local migration filenames include duplicate prefixes `0045` and `0046`:

- `drizzle/0045_commercial_event_ledger.sql`
- `drizzle/0045_provider_webhook_events.sql`
- `drizzle/0046_rbac_staff_session_governance.sql`
- `drizzle/0046_worker_jobs.sql`

Therefore any open PR that adds or edits old `0045_*` / `0046_*` migration files is classified `migration-stale/rebuild` and must wait for the migration surgery branch to merge. This particularly applies to `#94`, `#95`, `#96`, and any stale branch carrying historical numbered migrations.

## Recommended close list

Close or label do-not-merge after maintainer GitHub confirmation: `#2`, `#3`, `#4`, `#5`, `#6`, `#7`, `#8`, `#9`, `#10`, `#11`, `#19`, `#44`, `#46`, `#47`, `#62`, `#66`, `#68`, `#76`, `#80`, `#86`.

## Recommended rebuild / preserve list

Preserve the domain idea but rebuild from latest main: `#88`, one of `#89` / `#90`, `#91`, `#94`, `#95`, `#96`.

## Current risk ordering

- **P0:** migration surgery / duplicate `0045` and `0046` migration-prefix cleanup. Schema-changing PRs must pause.
- **P1:** stale PR closure / do-not-merge labeling so old branches cannot revert stock, payment, RBAC, compliance, product-master, or provider work.
- **P2:** rebuild valuable active concepts from latest main after migration surgery: reservation lifecycle, concurrency harness, observability, pharmacy legal ops, provider runtime enforcement, and offline recovery.
