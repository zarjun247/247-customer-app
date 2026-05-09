# BRANCH_PROTECTION_ENFORCEMENT_STATUS

Status date: 2026-05-08


## CODEOWNERS review requirement status

This branch adds `.github/CODEOWNERS` with `@zarjun247` as the inferred owner for critical migration/schema, CI/governance, stock, payment, compliance, provider, security, accounting, and frontend route-security files. The owner is inferred from visible repository history; replace it before enforcement if it is not the correct GitHub user/team.

Branch protection enforcement is still not proven from this container. Repository administrators must explicitly enable **Require review from Code Owners** in the `main` branch protection rule or ruleset before CODEOWNERS becomes a hard merge gate. Until that GitHub setting is enabled and verified, CODEOWNERS may request review but must not be described as blocking unsafe merges.

Required manual GitHub step:

```text
main branch protection/ruleset -> Require pull request reviews -> Require review from Code Owners
```

## Required branch protection settings for `main`

Enable GitHub branch protection or rulesets for `main` with these controls:

- Require pull request reviews before merging.
- Require conversation resolution before merging.
- Require branches to be up to date before merging.
- Require linear history or an explicit merge-queue policy selected by maintainers.
- Block force pushes and branch deletion.
- Require status checks to pass before merging.
- Restrict bypass permissions to repository administrators or the release captain only.

## Required status checks before merge

The required checks for `main` should include:

- `check`
- `test`
- `build`
- `migration-smoke`
- `security-env-guards`
- `placeholder-guards`
- `mysql-db-lifecycle`
- `governance-security-scans`

## Stale/conflicted PR rule

Stale or conflicted pull requests cannot merge. Old branches must be rebased onto latest `main`, and if the branch drift is too large, the useful changes must be rebuilt from latest `main` instead of merged directly.

## Migration coordination rule

Migration PRs must be coordinated. Only one schema/migration branch should merge at a time unless maintainers explicitly approve sequencing and any needed migration renumbering. Documentation/control PRs must not add migrations.

## Stock/payment/compliance validation rule

PRs touching stock, payment, compliance, audit, prescriptions, regulated reporting, provider state, or security-sensitive routes require full validation before merge:

```bash
pnpm install
pnpm run check
pnpm test -- --runInBand
pnpm run build
node scripts/ci-governance-guards.mjs all
git diff --check
```

Those PRs must also document migrations, provider behavior, fail-closed behavior, and rollback/forward-fix considerations where applicable.
