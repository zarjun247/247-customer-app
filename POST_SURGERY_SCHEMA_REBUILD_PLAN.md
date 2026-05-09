# POST_SURGERY_SCHEMA_REBUILD_PLAN

Plan for rebuilding schema-changing PRs after migration numbering surgery completes.

> This is a sequencing and control document only. It does not implement schema changes, add migrations, or assert production readiness.

## A. Validation first

Before any schema PR is rebuilt or merged:

1. Start from latest main after `fix/migration-sequence-collision-surgery` has merged.
2. Run latest-main validation proof:
   - `pnpm install`
   - `pnpm run check`
   - `pnpm test -- --runInBand`
   - `pnpm run build`
   - `git diff --check`
3. Verify the migration guard is green.
4. Verify there are no duplicate migration prefixes under `drizzle/*.sql`.
5. Record the next reserved migration number in `MIGRATION_AUDIT_STATUS.md`.
6. Confirm no open PR still proposes stale `0045` or `0046` migration numbers.

## B. Rebuild schema PRs one by one

Rebuild order after migration surgery:

1. Provider runtime enforcement.
2. Pharmacy legal operations.
3. Offline/degraded recovery.
4. Reservation lifecycle if schema changes are still required.
5. Any cold-chain, recall, or future schema PRs.

Only one schema-changing PR should be in merge review at a time unless the merge captain explicitly reserves non-overlapping migration numbers and confirms no schema-file overlap.

## C. Rules for each rebuilt schema PR

Each rebuilt schema PR must:

- Start from latest main after migration surgery.
- Read `MIGRATION_AUDIT_STATUS.md` before creating or editing migrations.
- Use the next available migration number; do not reuse stale `0045` or `0046` numbers.
- Update `drizzle/schema.ts` and its migration together in the same PR.
- Run migration verification.
- Run `pnpm run check`, `pnpm test -- --runInBand`, and `pnpm run build`.
- Include DB-backed proof if the feature affects persisted behavior, workflows, or constraints.
- Include rollback caveats for operational rollback planning.
- Refuse merge if the migration guard fails.
- Avoid combining unrelated schema domains in one PR.

## D. Migration-number reservation protocol

Every schema PR must state all of the following in its PR body or status doc:

| Required field | Required content |
| --- | --- |
| Migration number used | The exact four-digit prefix. |
| Why it is next | Citation to the current `MIGRATION_AUDIT_STATUS.md` next-reserved number and confirmation no newer schema PR has reserved it. |
| Migration file name | Full `drizzle/NNNN_name.sql` filename. |
| Tables / columns / indexes added | Explicit list of persistent schema objects changed. |
| Rollback caveat | Whether rollback is forward-only, data-preserving, or requires manual DB intervention. |
| Existing data impact | Whether existing rows are backfilled, constrained, reinterpreted, or untouched. |
| DB smoke status | Whether DB smoke ran, what command was used, and whether it passed, failed, or was blocked by environment. |

## Do-not-merge conditions

A schema PR must not merge if any of these are true:

- It uses stale `0045` or `0046` numbering after surgery.
- It lacks migration guard proof.
- It edits `drizzle/schema.ts` without a matching migration, or adds a migration without the matching schema intent.
- It combines provider, legal operations, offline recovery, reservation lifecycle, or future cold-chain/recall schema changes without explicit sequencing approval.
- It claims production readiness without latest-main validation and DB-backed proof.
