# BRANCH_PROTECTION_ENFORCEMENT_STATUS

Status date: 2026-05-08
Branch covered: `main`

This repository now contains CI jobs and static guardrails that can be selected as required status checks, but GitHub branch protection itself is a repository setting. This PR does **not** claim that branch protection is enabled until the repository owner enables and verifies those settings in GitHub.

## Implemented in repo

The CI workflow defines status checks that can be required by GitHub branch protection:

- `check` runs `pnpm install --frozen-lockfile` and `pnpm run check`.
- `test` runs `pnpm install --frozen-lockfile` and `pnpm test -- --runInBand`.
- `build` runs `pnpm install --frozen-lockfile` and `pnpm run build`.
- `migration-smoke` runs the existing migration smoke guard test.
- `security-env-guards` runs security/environment guard tests.
- `placeholder-guards` runs production placeholder/scaffold guard tests.
- `governance-security-scans` runs lockfile integrity, migration/static unsafe-merge guards, conflict-marker scans, fake/provider success scans, admin route bypass scans, H1 unsafe numeric fallback scans, direct stock mutation scans, PII/secrets scans, and an advisory dependency audit.

## Required GitHub settings

Repository owner/admin must enable these exact protections for `main`:

1. Block direct pushes to `main` by requiring pull requests before merging.
2. Require pull request before merge.
3. Require status checks to pass before merge.
4. Require these checks/statuses before merge:
   - `check`
   - `test`
   - `build`
   - `migration-smoke`
   - `security-env-guards`
   - `placeholder-guards`
   - `governance-security-scans`
5. Require branches to be up to date before merging if the repository plan supports it.
6. Require at least one approval before merging into production branches such as `main`.
7. Dismiss stale approvals after new commits where available.
8. Restrict force pushes.
9. Restrict branch deletions.
10. Prefer squash merge or linear history. If using linear history, also enable the repository setting that requires linear history.
11. Do not allow administrators to bypass these rules unless there is an explicit break-glass policy and audit trail.

## Manual owner checklist

Use GitHub UI unless an approved org-level policy tool manages branch rules:

- [ ] Open repository Settings → Branches → Branch protection rules or Rulesets.
- [ ] Create or edit the rule/ruleset matching `main`.
- [ ] Enable “Require a pull request before merging”.
- [ ] Set required approvals to at least `1`.
- [ ] Enable “Require status checks to pass before merging”.
- [ ] Select every implemented CI status check listed above.
- [ ] Enable “Require branches to be up to date before merging” if supported.
- [ ] Disable direct pushes to `main` except approved automation if absolutely necessary.
- [ ] Disable force pushes.
- [ ] Disable deletions.
- [ ] Enable squash merge or linear-history enforcement according to repository policy.
- [ ] Save the rule and test it with a non-admin account or ruleset evaluation.
- [ ] Confirm a PR cannot merge when any required check is red or pending.

## Not yet proven

- GitHub branch protection enforcement is **not proven by this PR** because it requires GitHub repository settings outside the codebase.
- The advisory `pnpm audit --audit-level high` currently reports known advisories and is non-blocking in CI to avoid breaking every PR until dependency owners triage/package updates are approved.
- True DB-backed MySQL migration execution smoke is deferred to a MySQL lifecycle branch with non-production database credentials. The repo-level guard checks ordering/duplicate numbers without requiring production secrets.
- The broad global `50mb` JSON/body limit remains a warning because runtime route-level body-limit changes are outside this CI/governance-only PR.
