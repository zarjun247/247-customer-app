# Branch Protection Enforcement Proof

Status date: 2026-05-09
Branch: `chore/branch-protection-codeowners-enforcement-proof`
Repository: `zarjun247/247-customer-app`

## Executive conclusion

Branch protection for `main` is **not proven in this environment**. This branch could inspect the local checkout, `.github/CODEOWNERS`, and CI workflow names, but it could not authenticate to GitHub and therefore could not prove or change repository settings.

Do **not** claim that `main` is production-protected until an authenticated GitHub API/CLI/UI check proves the required rule or ruleset is enabled.

## Main SHA inspected

| Item | Value |
| --- | --- |
| Local main-equivalent SHA inspected | `200fafcc20451cc43e8d6272588ec7e26e12d9c8` |
| Latest-main refresh attempted | Yes |
| Latest-main refresh result | Could not fetch `origin/main` because this checkout had no `origin` remote and unauthenticated GitHub HTTPS access required credentials. |
| Fresh branch created | `chore/branch-protection-codeowners-enforcement-proof` |
| Runtime code changed | No |
| Server services/routers changed | No |
| Client runtime files changed | No |
| Schema changed | No |
| Migrations added or changed | No |
| Package manifest / lockfile changed | No |

## Verification method and command evidence

| Check | Command / method | Evidence | Result |
| --- | --- | --- | --- |
| Local repository state | `git rev-parse HEAD` | Returned `200fafcc20451cc43e8d6272588ec7e26e12d9c8`. | Local SHA captured. |
| Remote refresh | `git fetch origin main --prune` | Failed: `fatal: 'origin' does not appear to be a git repository`. | Latest remote `main` not verified. |
| GitHub CLI | `gh --version` / `gh auth status` | Failed: `gh: command not found`. | GitHub CLI unavailable. |
| GitHub branch protection API | `curl -i https://api.github.com/repos/zarjun247/247-customer-app/branches/main/protection` | Returned `401 Unauthorized` with `Requires authentication`. | Branch protection not inspectable without credentials. |
| GitHub branch API | `curl -i https://api.github.com/repos/zarjun247/247-customer-app/branches/main` | Returned `404 Not Found` to unauthenticated request. | Branch SHA/protection not inspectable without credentials. |
| Branch-protection settings changed | None | No authenticated GitHub settings API/CLI was available. | No GitHub-side change made. |

## Current branch protection status table

Because authenticated GitHub tooling was unavailable, the following table is deliberately conservative.

| Required production setting for `main` | Verified? | Current status from this environment | Required action |
| --- | --- | --- | --- |
| Require a pull request before merging | No | Unverified | Enable or prove through authenticated GitHub branch protection/ruleset evidence. |
| Required approvals enabled | No | Unverified | Enable at least 1 approval; 2 is recommended for high-risk Pharmacy OS changes. |
| Required number of approvals | No | Unknown | Confirm exact number through API/UI. |
| Require review from Code Owners | No | Unverified | Must be enabled; `.github/CODEOWNERS` alone is not enough. |
| Dismiss stale approvals on new commits | No | Unverified | Must be enabled to reduce stale PR merge risk. |
| Require conversation resolution before merge | No | Unverified | Must be enabled if available for the repository plan. |
| Require status checks before merge | No | Unverified | Must be enabled. |
| Require branches to be up to date before merge | No | Unverified | Must be enabled unless a merge queue provides equivalent freshness enforcement. |
| Required checks list | Partially inferable from workflow file only | Workflow job names are known locally; GitHub required-check settings are not verified. | Select exact check contexts after one successful PR run exposes their names. |
| Restrict who can push to `main` | No | Unverified | Restrict direct push to a documented emergency/break-glass role, or block all direct pushes where possible. |
| Block force pushes to `main` | No | Unverified | Disable force pushes. |
| Block deletions of `main` | No | Unverified | Disable branch deletion. |
| Require linear history or squash-only policy | No | Unverified | Enable linear history or enforce merge queue/squash-only discipline. |
| Admin bypass allowed? | No | Unknown | Review bypass settings; do not allow routine bypass. |

## Required checks identified from local CI workflow

The local workflow `.github/workflows/ci.yml` defines these job names and should be used as the initial required-check candidate list **only after GitHub displays the exact status context names on a PR**:

| CI concern | Local workflow job name |
| --- | --- |
| Typecheck / check | `check` |
| Governance and security scans | `governance-security-scans` |
| Unit test suite | `test` |
| Production build | `build` |
| Migration smoke guard | `migration-smoke` |
| Security environment guards | `security-env-guards` |
| Placeholder production guards | `placeholder-guards` |
| Migration verification / release advisory | `release-gate-advisory` |
| MySQL DB lifecycle | `mysql-db-lifecycle` |

Do not configure guessed required-check names if GitHub displays different context names such as `CI / check` or `check (20.x)`. Required checks must match GitHub exactly or merges may be blocked incorrectly.

## CODEOWNERS review status

| Item | Status |
| --- | --- |
| `.github/CODEOWNERS` exists | Yes |
| Owner used | `@zarjun247` |
| High-risk Pharmacy OS paths covered | Yes, by static file inspection. See `CODEOWNERS_COVERAGE_AUDIT.md`. |
| Code Owners review enforced by GitHub | **Unverified** |
| Production conclusion | CODEOWNERS is present, but it is not a proven merge gate until GitHub branch protection/rulesets require Code Owner review. |

## Settings changed by this branch

No GitHub repository settings were changed. No authenticated API, GitHub CLI, or UI session was available in this environment.

## Manual GitHub setup steps

Use these exact steps from an account with repository admin access:

1. Open `zarjun247/247-customer-app` on GitHub.
2. Go to **Settings → Branches** or **Settings → Rules → Rulesets**.
3. Create or edit the rule that targets branch pattern `main`.
4. Enable **Require a pull request before merging**.
5. Set **Required approvals** to at least `1`; use `2` for stronger production discipline.
6. Enable **Dismiss stale pull request approvals when new commits are pushed**.
7. Enable **Require review from Code Owners**.
8. Enable **Require conversation resolution before merging**.
9. Enable **Require status checks to pass before merging**.
10. After this PR has a completed Actions run, select the exact required status checks GitHub shows for the jobs listed above.
11. Enable **Require branches to be up to date before merging**, or enable a merge queue with equivalent freshness enforcement.
12. Disable force pushes for `main`.
13. Disable branch deletion for `main`.
14. Restrict direct pushes to `main` to a documented emergency/break-glass role, or disallow direct pushes entirely where possible.
15. Enable **Require linear history** or configure squash-only/merge-queue policy.
16. Review bypass settings. Do not allow routine admin or bot bypass of required PR reviews/checks; document any emergency bypass path.
17. Save the rule.
18. Verify with one of:
    - `gh api repos/zarjun247/247-customer-app/branches/main/protection`
    - `gh api repos/zarjun247/247-customer-app/rules/branches/main`
    - GitHub UI screenshot plus copied settings values.
19. Record the verified settings in this proof document or a follow-up proof PR.

## Remaining risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Branch protection is not proven | P0 | Authenticate to GitHub and verify or enable the branch rule/ruleset. |
| Code Owner review enforcement is not proven | P0 | Enable and verify **Require review from Code Owners** for `main`. |
| Exact required check contexts are not proven | P1 | Use a live PR Actions run to capture exact context names before making checks required. |
| Direct push, force push, and delete protections are unknown | P0 | Verify through branch protection API/UI and enable missing protections. |
| Admin bypass policy is unknown | P1 | Review bypass settings and document any emergency exception. |
| Latest GitHub `main` SHA could not be fetched | P1 | Repeat from an authenticated checkout with `origin` configured. |

## Safe-to-merge assessment for this docs-only branch

Safe to review as a governance/documentation PR because it changes no runtime code, server services/routers, client runtime files, schema, migrations, package manifests, or lockfiles. It does **not** by itself make `main` production-protected. Production readiness remains blocked until GitHub-side enforcement is verified.

## Validation performed on this branch

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm install` | Passed with warnings | Lockfile was already up to date; pnpm reported ignored build scripts for `@tailwindcss/oxide` and `esbuild`, plus Node emitted a `url.parse()` deprecation warning. |
| `pnpm run check` | Passed | TypeScript completed without errors. |
| `pnpm test -- --runInBand` | Passed with environment-limited skips | 84 files passed, 2 files skipped; 490 tests passed, 12 skipped. MySQL integration/concurrency tests skipped because `TEST_DATABASE_URL` was not set. |
| `pnpm run build` | Passed with warnings | Vite reported missing analytics placeholder environment variables and a large chunk warning. |
| `node scripts/verify-migrations.mjs` | Passed | 49 files inspected, 46 numbered, latest `0048`, 0 blocking issues, 0 warnings. |
| `git diff --check` | Passed | No whitespace errors. |
| `node scripts/ci-governance-guards.mjs all` | Passed | Governance/security scan found no blocked patterns. |
