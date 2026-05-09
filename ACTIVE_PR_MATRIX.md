ACTIVE PR MATRIX (local view)

NOTE: This matrix is derived from local git branches and commit messages. For authoritative GitHub PR status, query the GitHub API.

Merged:
- Merge PR #123 (6686a6fadac240508d6cdbfd654d237ac999e580) — latest visible local merge

Active:
- sprint/production-readiness-integration (current) — purpose: governance & cross-platform hardening

Blocked:
- feature/accounting-ledgers (duplicate accounting PRs) — reason: missing canonical ledger model; replacement: follow ACCOUNTING_COMPLETION_PLAN.md

Stale:
- sprint/old-experiments/* — stale branches older than 30 days; recommend deletion or rebase

Superseded:
- barcode-refactor-2025 -> superseded by newer barcode PRs; mark as superseded

Do-not-merge:
- demo/* branches containing demo-only placeholder logic

Notes:
- Duplicate accounting PRs exist; consolidate under accounting-completion branch.
- Migration-number conflicts are reported by scripts/verify-migrations.mjs and scripts/repo-governance-audit.mjs
