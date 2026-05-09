# OPEN_PR_REBASE_AND_CLOSE_STATUS

Open PR stale-branch control status for `chore/latest-main-validation-governance-cleanup` on 2026-05-09.

## Inspection limits

| Item | Status |
| --- | --- |
| Local latest SHA inspected | `f7d049825eb17922e9fa0c47326620e26a396186` |
| Latest merged PR visible locally | PR `#107` |
| `gh` availability | Not available in this container. |
| Git remote availability | No `origin` remote is configured; `git pull --rebase origin main` failed. |
| GitHub API availability | Unauthenticated `https://api.github.com/repos/zarjun247/247-customer-app/pulls?state=open&per_page=100` returned `404`, consistent with a private repository or missing authentication. |

Because live GitHub PR state is not visible here, the classifications below are conservative defaults based on local history, existing governance docs, and the requested control policy. Maintainers must refresh with authenticated GitHub access before closing or merging any PR.

## PR classification table

| PR | Classification | Action |
| ---: | --- | --- |
| #2 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #3 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #4 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #5 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #6 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #7 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #8 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #9 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #10 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #11 | Close / superseded | Legacy early PR; do not merge directly. Close if still open after authenticated refresh. |
| #19 | Close / superseded | Legacy PR; close if still open unless authenticated diff shows unique still-needed docs only. |
| #44 | Close / superseded | Legacy barcode/payment/accounting-era work likely superseded by later hardening; do not merge directly. |
| #46 | Close / superseded | Legacy duplicate/stale work likely superseded; do not merge directly. |
| #47 | Close / superseded | Legacy duplicate/stale work likely superseded; do not merge directly. |
| #62 | Close / superseded | Later hardening likely supersedes this branch; do not merge directly. |
| #66 | Close / superseded | Product/runtime gate area appears superseded by later merged work; do not merge directly. |
| #68 | Close / superseded | Legacy stale branch; do not merge directly. |
| #76 | Close / superseded | Legacy stale branch; do not merge directly. |
| #80 | Close / superseded | Legacy stale branch; do not merge directly. |
| #86 | Close / superseded | Legacy stale branch; do not merge directly. |
| #88 | Rebuild required | Reservation lifecycle truth may be useful but likely schema/migration touching. Rebuild from latest main using next reserved migration `0049` only if a real schema gap is approved. |
| #89 | Choose one with #90 | Mine for MySQL concurrency proof cases; consolidate into one latest-main DB race harness. |
| #90 | Choose one with #89 | Keep only unique MySQL concurrency proof cases; close duplicate after consolidated rebuild exists. |
| #91 | Likely useful | Observability/healthchecks are likely useful if migration-free. Rebuild from latest main and validate against current HTTP/security/provider bootstraps. |
| #94 | Rebuild required | Pharmacy legal operations likely touches schema/migrations; do not merge stale branch. Rebuild from latest main after authenticated diff review. |
| #95 | Rebuild required | Provider runtime enforcement likely touches schema/migrations or stale provider surfaces; do not merge stale branch. Rebuild from latest main. |
| #96 | Rebuild required | Offline degradation/recovery likely persistence-touching; do not merge stale branch. Rebuild from latest main. |
| #101 | Possibly useful / verify supersession | Preserve only if authenticated diff shows non-duplicated governance/control value after PRs #102/#105/#107. Otherwise close as superseded. |
| #103 | Stale validation | If it still reports duplicate `0045`/`0046` migrations after PR #100, close or mark stale; latest inspected main has no duplicate migration prefixes. |
| #104 | Likely useful | CODEOWNERS/governance can be useful if it does not conflict with branch protection/control docs. Rebase from latest main. |
| #106 | Verify / likely superseded by #107 | Check authenticated diff; close if it duplicates migration surgery/control-room docs already merged in PR #107. |
| #108 | Stale validation | If it still reports duplicate migrations after PR #100, close or mark stale; latest inspected main has no duplicate migration prefixes. |

## Merge-control warning

No stale PR should be treated as mergeable until it is rebased on authenticated latest `main`, passes required checks, and is reviewed for migration-number freshness. Schema/migration PRs must use next reserved migration number `0049` only after explicit approval and must not resurrect duplicate `0045`/`0046` assumptions.

## Maintainer next actions

1. Authenticate `gh` and run `gh pr list --state open --limit 100 --json number,title,headRefName,baseRefName,mergeable,updatedAt,isDraft,url`.
2. Close legacy/superseded PRs with a stale-main warning comment.
3. Mark PRs `#103` and `#108` stale if they still claim duplicate migrations from pre-PR-100 snapshots.
4. Rebuild schema-touching PRs `#88`, `#94`, `#95`, and `#96` from latest main instead of merging directly.
5. Consolidate PRs `#89` and `#90` into one DB-backed MySQL concurrency proof branch.
6. Consider rebuilding useful migration-free governance/ops work from `#91`, `#104`, and maybe `#101` after authenticated diff review.
