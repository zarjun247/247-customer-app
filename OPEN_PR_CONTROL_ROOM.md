# Open PR control room

Generated: **2026-05-09 10:24:43 UTC**  
Latest inspected local main SHA: `200fafcc20451cc43e8d6272588ec7e26e12d9c8`  
Current repo score estimate: **7.8 / 10**

> Repo is strong pre-production architecture, not 10/10 launch-ready.

## Live GitHub inspection status

This container could not authenticate to the private GitHub repository, so GitHub live metadata could not be read or mutated from this run. The following attempts were made:

- `gh auth status` failed because `gh` is not installed.
- `git fetch origin main --prune` failed with `fatal: could not read Username for 'https://github.com': No such device or address`.
- `https://api.github.com/repos/zarjun247/247-customer-app/pulls?state=open&per_page=100` returned `404 Not Found` without authentication.
- `https://github.com/zarjun247/247-customer-app/pulls` and individual PR pages such as `/pull/117` returned `404 Not Found` without authentication.

No PRs were merged, commented, or closed from this branch. Treat the rows below as the authoritative control-room policy from the latest local main and existing governance ledgers, with all GitHub-only fields marked unavailable until an authenticated maintainer refreshes them.

## Validation / governance scan notes

- `pnpm install` completed with the existing pnpm warning that build scripts for `@tailwindcss/oxide` and `esbuild` are ignored until approved.
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed: 84 test files passed, 2 skipped; 490 tests passed, 12 skipped. MySQL DB-backed proof skipped because `TEST_DATABASE_URL` is not set.
- `pnpm run build` passed with existing Vite warnings for unset `%VITE_ANALYTICS_ENDPOINT%`, unset `%VITE_ANALYTICS_WEBSITE_ID%`, non-module analytics script bundling, and large chunks.
- `node scripts/verify-migrations.mjs` passed: 49 SQL files, 46 numbered migrations, latest `0048`, 0 blocking issues, 0 warnings.
- `node scripts/ci-governance-guards.mjs all` passed: no blocked patterns found.

## Open PR inspection table

`Base SHA`, `head SHA`, `mergeable`, and `CI` are GitHub-only fields in this environment and must be refreshed by an authenticated maintainer before closure or merge action. `Superseded by merged main` is based on local merged history through PR #116 and prior control docs.

| PR | Title / domain | State | Mergeable | Base SHA | Head SHA | Changed-file category | Migrations added/edited | Runtime code changed? | Docs-only? | CI status | Superseded by merged main? | Unique useful content? | Risk | Recommended action |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| #88 | Reservation lifecycle truth | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Reservation / stock / possible schema | Likely yes; verify | Likely yes | No | Unavailable | No; not fully superseded | Yes | P0 | Rebuild from latest main after provider/runtime migration sequencing. |
| #89 | MySQL concurrency harness | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Tests/scripts / DB proof | Unknown; should be no | Test/runtime harness only | No | Unavailable | Partially superseded by merged PR #116 local harness | Possible unique race cases | P1 | Extract useful cases into one DB-backed proof; close duplicate after consolidation. |
| #90 | MySQL concurrency harness alternate/duplicate | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Tests/scripts / DB proof | Unknown; should be no | Test/runtime harness only | No | Unavailable | Partially superseded by merged PR #116 local harness | Possible unique race cases | P2 | Treat as duplicate of #89; extract only unique cases later. |
| #91 | Observability / healthchecks | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Health/readiness/logging | Likely no | Likely yes | No | Unavailable | No | Yes | P1 | Rebuild from latest main after provider runtime sequencing if migration-free. |
| #94 | Pharmacy legal operations | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Compliance runtime / possible schema | Likely yes | Likely yes | No | Unavailable | No | Yes | P1 | Rebuild from latest main after provider/runtime and reservation sequencing. |
| #95 | Provider runtime enforcement | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Provider runtime / worker reliability / possible schema | Likely yes | Likely yes | No | Unavailable | No | Yes | P0 | Rebuild from latest main next; do not merge raw. |
| #96 | Offline degradation / recovery | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Offline runtime / possible persistence | Likely yes | Likely yes | No | Unavailable | No | Yes | P1 | Rebuild later after provider runtime and core invariants. |
| #101 | Governance/control value; exact title unavailable | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Governance/docs likely | Unknown | Unknown | Unknown | Unavailable | Possibly superseded by #102/#105/#107 | Possible | P2 | Keep for authenticated manual review; close if duplicate. |
| #103 | Migration validation snapshot; exact title unavailable | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Migration validation/docs likely | No expected | No expected | Likely yes | Unavailable | Yes, if it reports pre-PR-100 duplicate migration state | Low | P2 | Close as superseded/stale validation after authenticated confirmation. |
| #104 | CODEOWNERS / branch protection governance | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Governance / ownership | No expected | No expected | Likely docs/config | Unavailable | Likely superseded by merged #111 and #102 | Possible owner-rule nuance | P2 | Rebase/update and review only if unique; otherwise close as superseded. |
| #106 | Migration surgery/control-room precursor; exact title unavailable | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Migration control docs likely | No expected | No expected | Likely yes | Unavailable | Likely superseded by merged #107 | Low | P2 | Close as superseded if it duplicates #107. |
| #108 | Migration validation snapshot; exact title unavailable | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Migration validation/docs likely | No expected | No expected | Likely yes | Unavailable | Yes, if it reports pre-PR-100 duplicate migration state | Low | P2 | Close as superseded/stale validation after authenticated confirmation. |
| #110 | Exact title unavailable; post-#109 open PR | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Unknown | Unknown | Unknown | Unknown | Unavailable | Unknown | Unknown | P2 | Keep open for authenticated manual review; do not merge until classified. |
| #113 | Exact title unavailable; post-#112 open PR | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Unknown | Unknown | Unknown | Unknown | Unavailable | Unknown | Unknown | P2 | Keep open for authenticated manual review; do not merge until classified. |
| #114 | Exact title unavailable; likely important per prompt | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Unknown | Unknown | Unknown | Unknown | Unavailable | Unknown | Likely yes | P1 | Keep open for manual review; do not close from this branch. |
| #115 | Exact title unavailable; likely important per prompt | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Unknown | Unknown | Unknown | Unknown | Unavailable | Unknown | Likely yes | P1 | Keep open for manual review; do not close from this branch. |
| #117 | Exact title unavailable; likely important per prompt | Open per prompt; GitHub unavailable | Unknown | Unavailable | Unavailable | Unknown | Unknown | Unknown | Unknown | Unavailable | Unknown | Likely yes | P1 | Keep open for manual review; do not close from this branch. |

## Classification table

### A. Safe to close as superseded after authenticated confirmation

| PRs | Reason | Comment template |
| --- | --- | --- |
| #103, #108 | Stale migration-validation snapshots are superseded if they still claim duplicate `0045`/`0046` state; latest local migration verifier is clean through `0048`. | Template 1 — Superseded |
| #106 | Likely duplicated by merged PR #107 migration surgery control-room work. | Template 1 — Superseded |
| #104 | Likely duplicated by merged PR #111 CODEOWNERS gates and #102 branch-protection proof if it contains no unique owner/governance change. | Template 1 — Superseded |

### B. Must rebuild from latest main

| PRs | Reason | Required rebuild control |
| --- | --- | --- |
| #95 | Provider runtime enforcement is valuable and high-risk; stale provider/worker/schema work must not merge raw. | Rebuild first as `feat/rebuild-provider-runtime-enforcement-latest-main`. |
| #91 | Observability/healthchecks need current bootstrap/security/provider integration. | Rebuild after provider runtime sequencing unless authenticated diff proves migration-free and isolated. |
| #88 | Reservation lifecycle truth collides with stock/reservation/payment invariants. | Rebuild only after provider/runtime migration reservation is known. |
| #94 | Legal operations likely touches compliance schema and RBAC/security workflows. | Rebuild after provider/runtime and reservation sequencing. |
| #96 | Offline recovery is useful but dangerous without current payment/stock/regulated-release boundaries. | Rebuild after provider runtime and invariant work. |

### C. Potential merge candidates after rebase/CI

| PRs | Conditions |
| --- | --- |
| #104 | Only if authenticated review proves it is current, clean, governance-only, conflict-free, and not superseded by #111/#102. |
| #101 | Only if authenticated review proves unique non-duplicated governance/control content after #102/#105/#107. |
| #110, #113 | Only after authenticated changed-files review proves no runtime/migration risk and CI is green. |

### D. Unique extraction candidates

| PRs | Extract later |
| --- | --- |
| #89, #90 | Mine unique MySQL race cases into one DB-backed concurrency proof; do not keep duplicate harnesses. |
| #88 | Extract canonical availability and idempotent reservation lifecycle ideas into a fresh latest-main branch. |
| #91 | Extract readiness/healthcheck/redaction concepts into a fresh latest-main branch. |
| #94, #95, #96 | Extract only current-useful domain concepts; discard stale migrations and duplicate abstractions. |

### E. Manual review required

| PRs | Why |
| --- | --- |
| #110, #113, #114, #115, #117 | GitHub-only metadata and titles are unavailable in this container. Prompt explicitly warns not to close #114, #115, or #117 unless clearly superseded. Keep open until authenticated review. |
| #101, #104 | Possibly governance-only but must be authenticated to avoid duplicate or stale owner/control changes. |

## Migration-risk table

| PRs | Migration risk | Control |
| --- | --- | --- |
| #88, #94, #95, #96 | High / likely persistence or schema changes. | Do not merge raw. Rebuild from latest main and reserve next migration number only after `node scripts/verify-migrations.mjs` passes on main. |
| #89, #90 | Medium / should be test-only, but DB proof can expose schema gaps. | Consolidate without migrations unless a separate approved feature PR reserves a migration. |
| #101, #103, #104, #106, #108, #110, #113, #114, #115, #117 | Unknown to low until authenticated file list is inspected. | If any touches `drizzle/schema.ts` or `drizzle/*.sql`, stop and move to migration queue. |

## Runtime-risk table

| PRs | Runtime risk | Control |
| --- | --- | --- |
| #95 | P0 provider/worker/payment-adjacent enforcement risk. | Next rebuild, latest main only, no placeholder provider success. |
| #88 | P0 stock/reservation/checkout race risk. | Rebuild after provider/runtime sequencing and DB race proof plan. |
| #91 | P1 bootstrap/health/logging risk. | Rebuild without duplicating middleware or leaking secrets/PHI. |
| #94 | P1 compliance/RBAC/security runtime risk. | Rebuild after provider/runtime; validate legal proof paths. |
| #96 | P1 offline payment/stock/regulated-release risk. | Rebuild last among feature domains; prohibit unsafe offline operations. |
| #110, #113, #114, #115, #117 | Unknown. | Keep open for authenticated changed-files review. |

## Duplicate-domain table

| Domain | PRs | Current control |
| --- | --- | --- |
| MySQL concurrency proof | #89, #90, merged #116 | Use #116 as current baseline; extract unique cases from #89/#90 into one future harness only. |
| Migration validation / surgery | #103, #106, #108, merged #100, #107 | Latest main verifier is clean through `0048`; close stale validation/surgery duplicates after confirmation. |
| Branch protection / CODEOWNERS governance | #104, merged #102, #111 | Keep #104 only if it contains unique valid owner/governance content. |
| Provider/runtime durability | #95, merged provider contract/worker work #78/#97 | Rebuild #95 against current provider contract matrix and worker queue. |
| Reservation / stock availability | #88, merged stock/reservation hardening #99/#116 | Rebuild #88 after provider/runtime sequencing; latest main wins on conflict. |

## Exact close/rebuild instructions

1. Refresh live GitHub state with authenticated tooling: `gh pr list --state open --json number,title,state,mergeable,baseRefOid,headRefOid,statusCheckRollup,files`.
2. For every stale docs/governance PR already represented in main, comment with `OPEN_PR_CLOSURE_COMMENTS.md` Template 1 or Template 4 and close only after confirming no unique content.
3. For #103/#108, close only if the PR still reports the obsolete duplicate-migration condition fixed by PR #100/#107; otherwise reclassify.
4. For #104, close only if it is superseded by current CODEOWNERS/branch-protection work; otherwise rebase/update and review.
5. Do not close #114, #115, or #117 until authenticated review proves they are superseded.
6. Do not merge #88, #91, #94, #95, or #96 raw. Rebuild useful intent from latest `main`.
7. Start implementation with `feat/rebuild-provider-runtime-enforcement-latest-main`.
