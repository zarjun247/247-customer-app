# MERGE_GOVERNANCE_STATUS

Canonical merge governance controls as of 2026-05-08.

## 1. Non-negotiable merge rules

- Never merge stale duplicate branches.
- Never merge conflict resolution that reverts latest main.
- Latest main wins unless the active branch owns the exact domain being intentionally changed.
- Never use a stale branch to make production-readiness claims.
- Never claim production is 10/10 without final merge-captain audit evidence and proof dashboard validation.
- Documentation-only branches must not add migrations or runtime behavior.

## 2. Required PR checklist

Every PR must list the following before it is considered merge-ready:

- Files changed.
- Migrations added, or an explicit `None`.
- Tests added, or an explicit `None` with rationale.
- Validation results for:
  - `pnpm install`
  - `pnpm run check`
  - `pnpm test -- --runInBand`
  - `pnpm run build`
  - `git diff --check`
- Remaining risks.
- Safe-to-merge assessment.

## 3. Conflict-resolution policy

- Rebase old branches onto latest main before review.
- When conflicts appear, preserve latest-main behavior by default.
- Only keep branch-side changes where the branch explicitly owns the domain under review.
- Do not resolve conflicts by deleting newer tests, newer safety checks, newer schema fields, newer provider fail-closed behavior, or newer lifecycle proof.
- If a branch has drifted too far, close it and recreate only the unique wanted changes from latest main.

## 4. Migration governance

- Migration-heavy branches must not run simultaneously against `drizzle/schema.ts` unless explicitly coordinated.
- Only one schema/migration branch should merge at a time unless maintainers pre-approve sequencing and migration renumbering.
- Migration files must match the final `drizzle/schema.ts` state.
- Destructive migrations require explicit backup/restore review and rollback or forward-fix instructions.
- Documentation/control PRs must add no migrations.

## 5. Domain ownership during parallel work

| Domain | Merge control |
| --- | --- |
| Product-master runtime gates | Keep `#66` active if still open; rebase/resolve separately. |
| Barcode UX / barcode scan | Close stale duplicates such as `#46` and `#47`; recreate needed work from latest main. |
| Payment fail-closed / webhook lifecycle | Do not merge stale duplicate `#62`; verify later merged payment behavior before any new changes. |
| Accounting / reconciliation / commercial lifecycle | Do not merge stale duplicate `#68`; new accounting work must build on latest main. |
| Schema / migrations | Coordinate one branch at a time; no surprise migration additions. |
| Docs / control | May merge independently only when it does not alter runtime, package manifests, lockfiles, or migrations. |

## 6. Final merge-captain audit

A final merge-captain audit must run after all accepted PRs merge. It must:

- Start from latest protected main.
- Confirm no stale PR branch was merged directly.
- Re-run full required validation.
- Review final files changed by all accepted PRs.
- Review final schema and migration ordering.
- Confirm proof for CI/security scan, test DB lifecycle, HTTP security middleware, provider contract matrix, observability healthchecks, privacy/staff session, DB index audit, API abuse protection, backup/restore/deployment, and production smoke/UAT.
- Publish the final launch-mode decision with remaining risks and explicit safe-to-merge assessment.
