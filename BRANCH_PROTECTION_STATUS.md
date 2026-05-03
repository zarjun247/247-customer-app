# BRANCH PROTECTION STATUS

## Required GitHub branch protection settings for `main`
1. Require a pull request before merging.
2. Require status checks to pass before merging.
3. Require branches to be up to date before merging (recommended where practical).
4. Require conversation resolution before merge.
5. Block force pushes.
6. Block branch deletions.
7. Restrict direct pushes to `main`.
8. Prefer linear history (or enforce squash merge policy).
9. Optionally require signed commits (team policy decision).

## Required status checks
- `CI / check`
- `CI / test`
- `CI / build`
- `CI / migration-smoke`
- `CI / security-env-guards`
- `CI / placeholder-guards`

## Codex workflow operating rule
- Every Codex task starts from latest `main`.
- Every Codex task works on a named branch.
- Every Codex task opens a PR to `main`.
- Every PR must pass GitHub CI prior to merge.
- Local-only patching is not considered complete.
