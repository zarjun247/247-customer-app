# BRANCH_PROTECTION_ENFORCEMENT_STATUS


## 2026-05-09 CODEOWNERS review-gate update

| Item | Status |
| --- | --- |
| Branch adding ownership gates | `chore/critical-file-ownership-codeowners-review-gates` |
| Latest local main-equivalent SHA inspected | `f7d049825eb17922e9fa0c47326620e26a396186` |
| CODEOWNERS file status | `.github/CODEOWNERS` is added by this branch for Pharmacy OS high-risk paths. |
| Owner used | `@zarjun247` as temporary repository owner inferred from `zarjun247/247-customer-app`; maintainers must confirm this account has write/admin access before relying on enforcement. |
| Code Owner review enforcement | **Pending manual proof.** This branch does not claim that GitHub branch protection or repository rulesets already require Code Owner review. |
| Required manual UI setting | Settings → Branches → Branch protection rules → main → Require review from Code Owners |
| PR #104 status | Not publicly inspectable from this container (`404` via unauthenticated API/search). Do not merge #104 blindly; rebuild/supersede it from latest main unless authenticated review proves it is current, clean, governance-only, and owner-valid. |

Required branch-protection action after this PR lands:

1. Open GitHub repository settings.
2. Go to **Settings → Branches → Branch protection rules → main**.
3. Enable **Require review from Code Owners**.
4. Confirm required status checks still include the CI jobs documented below.
5. Capture UI or API evidence before claiming enforcement is active.

Until that proof exists, CODEOWNERS is a review-routing policy file, not a verified merge blocker.

Status date: 2026-05-09

This is a branch-protection enforcement proof pack for `main`. It documents the required GitHub settings, the currently visible CI/governance checks, migration-specific merge doctrine, and the manual evidence still required before maintainers may claim that branch protection is actually enabled.

## A. Current observed state

| Item | Observed state |
| --- | --- |
| Branch used for this proof pack | `chore/critical-file-ownership-codeowners-review-gates` |
| Latest local main-equivalent SHA inspected | `f7d049825eb17922e9fa0c47326620e26a396186` |
| Latest visible merge at inspected SHA | `Merge pull request #107 from zarjun247/codex/create-migration-surgery-control-room` |
| Recent merges visible in local history | PR #107 migration surgery control room, PR #105 open PR rebuild backlog, PR #102 branch protection proof documentation, PR #100 migration sequence collision surgery, PR #99 stock truth certification, PR #98 RBAC/staff session governance, PR #97 worker queue reliability, PR #93 current-main audit v2, PR #92 governance security scans, PR #87 commercial lifecycle ledger, PR #85 payment webhook lifecycle, PR #84 deployment/backup/restore proof scripts. |
| Remote refresh / latest-main limitation | This checkout initially had no configured remote. `origin` was configured as `https://github.com/zarjun247/247-customer-app.git`, but `git fetch origin main` could not authenticate in this container. The local HEAD already contains the requested recent merge set through PR #107. |
| CI workflows inspected | `.github/workflows/ci.yml` |
| CI job names inspected | `check`, `governance-security-scans`, `test`, `build`, `migration-smoke`, `security-env-guards`, `placeholder-guards`, `release-gate-advisory`, `mysql-db-lifecycle` |
| Governance scripts inspected | `scripts/ci-governance-guards.mjs`, `scripts/verify-migrations.mjs`, `scripts/check-runtime-placeholders.mjs`, `scripts/release-gate.mjs` |
| Package scripts inspected for CI/release gates | `check`, `test`, `build`, `migrations:verify`, `release:gate`, `test:db:bootstrap`, `test:db:smoke` |
| Current local migration-prefix scan | Current local tail is `0045_provider_webhook_events.sql`, `0046_commercial_event_ledger.sql`, `0047_worker_jobs.sql`, `0048_rbac_staff_session_governance.sql`; next reserved migration is `0049`. This ownership PR does not modify migrations. |
| CODEOWNERS status | `.github/CODEOWNERS` is added by `chore/critical-file-ownership-codeowners-review-gates` for high-risk Pharmacy OS paths. Code Owner review remains pending manual GitHub enforcement proof. |
| GitHub branch protection API/tooling status | `gh` is not installed. Unauthenticated GitHub API/search checks could not read PR #104 or branch-protection settings. |
| Enforcement conclusion | **Manual verification required.** This PR does not claim branch protection is enabled; it provides the exact settings and evidence checklist to prove or remediate enforcement. |

## B. Required protection rules for `main`

Configure GitHub branch protection or repository rulesets so `main` has all of these controls:

1. **Require a pull request before merging.** Direct commits to `main` must be blocked for non-break-glass users.
2. **Require approvals before merging.** Minimum required approvals: `1` unless maintainers raise the threshold for regulated/high-risk domains.
3. **Dismiss stale pull request approvals when new commits are pushed.** Any rebase, conflict fix, migration renumbering, or generated-file update must invalidate old approvals.
4. **Require review from Code Owners.** `.github/CODEOWNERS` now defines high-risk Pharmacy OS owners, but this setting is not verified as enabled. Maintainers must enable and prove it through Settings → Branches → Branch protection rules → main → Require review from Code Owners before claiming enforcement.
5. **Require status checks to pass before merging.** The required status checks must include the jobs listed in section C.
6. **Require branches to be up to date before merging** if maintainers are using branch protection rather than a merge queue. If GitHub merge queue is adopted, configure equivalent freshness enforcement through the queue.
7. **Block force pushes** to `main`.
8. **Block branch deletions** for `main`.
9. **Restrict direct pushes to `main`.** Only an explicit emergency/break-glass role should be able to bypass; regular maintainers and automation should merge through PRs.
10. **Require conversation resolution before merge** where the repository plan supports it.
11. **Prefer squash merge or linear history.** Use squash merge as the default unless maintainers intentionally use a merge queue with linear history.
12. **Disable or tightly control auto-merge for conflicted/stale branches.** Auto-merge must not be used to land branches that are stale, conflicted, or migration-colliding unless a reviewer has explicitly revalidated the final diff against latest `main`.
13. **Signed commits are optional.** Require signed commits only if maintainers decide this repository policy should include signature enforcement; do not block this proof pack on that optional policy.

## C. Required CI checks before merge

The exact required check contexts should match the current GitHub Actions job names in `.github/workflows/ci.yml`:

| Required check context | Workflow source | What it protects |
| --- | --- | --- |
| `check` | `pnpm run check` | TypeScript/type safety. |
| `governance-security-scans` | `node scripts/ci-governance-guards.mjs all` | Conflict markers, unsupported production claims, fake provider success, direct stock mutation, unsafe audit references, unguarded admin/pharmacy routes, secret leakage, placeholder production risk, migration filename/order risks, and destructive migration markers. |
| `test` | `pnpm test -- --runInBand` | Unit/guard/integration test suite in single-worker mode. |
| `build` | `pnpm run build` | Vite client build and bundled server build. |
| `migration-smoke` | `pnpm test -- server/migration-smoke.guard.test.ts --runInBand` | Migration smoke guard coverage. |
| `security-env-guards` | `pnpm test -- server/security-env.guard.test.ts server/worker-security.guard.test.ts server/storage-access.guard.test.ts server/auth-otp.guard.test.ts server/security-procedure.guard.test.ts --runInBand` | Security posture, worker security, storage access, OTP/auth, and security procedure guards. |
| `placeholder-guards` | `pnpm test -- server/placeholder-production.guard.test.ts --runInBand` | Production placeholder/scaffold guard coverage. |
| `release-gate-advisory` | `pnpm run migrations:verify` and `pnpm run release:gate -- --mode test` | Static migration verification, duplicate migration number detection, placeholder scan, release-gate advisory report. |
| `mysql-db-lifecycle` | `pnpm run test:db:bootstrap` and `pnpm run test:db:smoke` against MySQL 8.4 service | Test database migration/bootstrap and MySQL lifecycle smoke proof. |

Additional doctrine for checks:

- If GitHub displays check contexts with workflow prefixes such as `CI / check`, require the exact displayed context names.
- The `release-gate-advisory` job is advisory in name but should still be required before merge because it runs `migrations:verify` and the release gate in test mode.
- The repository currently has no separate dependency-audit workflow in `.github/workflows`; if one is added later, make it required for `main`.
- The repository currently has no separate optional DB concurrency job in `.github/workflows`; if a `TEST_DATABASE_URL`-backed concurrency/race job is added later, make it required for inventory/payment/schema PRs and preferably for all merges to `main`.

## D. Migration-specific branch protection doctrine

Branch protection must prevent migration-number collisions and stale schema merges:

- No schema/migration PR may merge unless migration-prefix uniqueness scan passes.
- No PR with duplicate migration numbers may merge.
- Open PRs with old duplicate `0045`/`0046` prefixes must be rebuilt from latest `main` after migration surgery; they must not be merged by accepting their old branch wholesale.
- Migration-heavy PRs must reserve the next migration number from `MIGRATION_AUDIT_STATUS.md` immediately before final review/merge.
- One migration-heavy PR may run at a time unless maintainers explicitly coordinate sequence, ownership, and migration-number reservation.
- Any PR touching `drizzle/schema.ts`, `drizzle/*.sql`, or Drizzle metadata must include fresh `pnpm run migrations:verify`, `node scripts/ci-governance-guards.mjs all`, and DB lifecycle evidence when available.
- Docs-only PRs must state `Migrations added: None` and must not modify schema or migration SQL.

## E. Manual GitHub settings checklist

If maintainers cannot enforce these settings through automation, use the GitHub UI:

1. Open the repository on GitHub.
2. Navigate to **Settings → Branches → Branch protection rules → Add branch protection rule**.
3. Set **Branch name pattern** to `main`.
4. Enable **Require a pull request before merging**.
5. Set **Required approvals** to at least `1`.
6. Enable **Dismiss stale pull request approvals when new commits are pushed**.
7. Enable **Require review from Code Owners** only after `.github/CODEOWNERS` is added and reviewed.
8. Enable **Require status checks to pass before merging**.
9. Select every required check context from section C exactly as GitHub displays it.
10. Enable **Require branches to be up to date before merging** unless using a merge queue with equivalent freshness enforcement.
11. Enable **Require conversation resolution before merging** if available in the repository plan.
12. Enable **Require linear history** or configure a merge queue/squash-only policy that preserves linear history.
13. Disable force pushes for `main`.
14. Disable branch deletion for `main`.
15. Restrict who can push to matching branches so direct pushes to `main` are limited to an explicit emergency/break-glass role.
16. Review bypass allowances; do not allow routine administrators or bots to bypass required PRs/checks unless this is a documented incident response path.
17. Save the rule, then open a fresh test PR and verify that all required checks and review gates block merging until satisfied.

## F. Evidence checklist

| Setting | Required value | Observed value | Evidence link/screenshot/manual confirmation | Status |
| --- | --- | --- | --- | --- |
| `main` branch protection/ruleset exists | Enabled for `main` | Not readable from this environment | Add GitHub settings screenshot or API output | pending manual verification |
| Pull request required | Enabled | Not readable from this environment | Add screenshot/API output | pending manual verification |
| Required approvals | At least `1` | Not readable from this environment | Add screenshot/API output | pending manual verification |
| Dismiss stale approvals | Enabled | Not readable from this environment | Add screenshot/API output | pending manual verification |
| Code Owner review | Enable after CODEOWNERS exists | `.github/CODEOWNERS` absent locally | Add CODEOWNERS review and screenshot when implemented | not available in environment |
| Required status checks | All section C contexts | Workflow jobs observed locally; GitHub required-check setting not readable | Add branch protection screenshot/API output listing contexts | pending manual verification |
| Branch must be up to date / merge queue freshness | Enabled or merge queue equivalent | Not readable from this environment | Add screenshot/API output | pending manual verification |
| Force pushes | Blocked | Not readable from this environment | Add screenshot/API output | pending manual verification |
| Branch deletion | Blocked | Not readable from this environment | Add screenshot/API output | pending manual verification |
| Direct pushes to `main` | Restricted to break-glass only | Not readable from this environment | Add screenshot/API output | pending manual verification |
| Conversation resolution | Required where available | Not readable from this environment | Add screenshot/API output | pending manual verification |
| Linear history / squash-only policy | Enabled or repository policy documented | Not readable from this environment | Add repository settings screenshot | pending manual verification |
| Auto-merge for stale/conflicted branches | Disabled or explicitly reviewer-controlled | Not readable from this environment | Add repository settings / merge policy proof | pending manual verification |
| Signed commits | Optional policy decision | Not readable from this environment | Add policy decision if adopted | not available in environment |

## Recommended future CODEOWNERS policy

Because `.github/CODEOWNERS` is not present in this checkout, this PR does not add one. If maintainers later add Code Owner enforcement, the policy should cover at least:

- `drizzle/*`
- `server/services/stockInvariant*`
- `server/services/payment*`
- `server/services/compliance*`
- `server/routers/payment*`
- `server/routers/sales*`
- `server/routers/purchase*`
- `.github/workflows/*`
- `scripts/*governance*`
- Security/provider/storage files, including provider connectors, storage access controls, auth/session/security procedures, and release-gate scripts.

## Supply-chain and secret hygiene launch gates (2026-05-09)

- Branch protection should eventually require a dependency/security audit job that fails or blocks review on unresolved high/critical supply-chain findings.
- Branch protection should eventually require a secret scan job with redacted output and no committed secret values in docs, tests, logs, fixtures, or env examples.
- Package-manager drift must be treated as a production-readiness blocker until `packageManager`, CI pnpm setup, and lockfile policy are aligned or explicitly accepted.
- Dependency upgrades, pnpm changes, and lockfile rewrites must be reviewed in dedicated PRs or clearly declared in the PR body; no hidden package movement may merge through unrelated work.
- Current audit references: `SUPPLY_CHAIN_SECURITY_AUDIT.md`, `SECRET_HYGIENE_AUDIT.md`, and `PRODUCTION_DEPENDENCY_POLICY.md`.
