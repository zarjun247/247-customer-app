# POST_SURGERY_SCHEMA_REBUILD_PLAN

Ordered plan for rebuilding schema-changing PRs after migration surgery.

> This document defines sequencing only. It does not add migrations, edit SQL, edit `drizzle/schema.ts`, or certify production readiness.

## A. Validation first

After `fix/migration-sequence-collision-surgery` merges into latest main, do not rebuild schema PRs until maintainers have recorded all of the following:

1. Latest-main validation proof has run.
2. Migration guard is green.
3. No duplicate migration prefixes remain.
4. Migration smoke test has passed or the exact environment limitation is documented.
5. `MIGRATION_AUDIT_STATUS.md` records the next reserved migration number.
6. Any stale PR claiming `0045` or `0046` has been marked rebuild-only.

## B. Rebuild schema PRs one by one

Rebuild order after the validation gate:

1. Provider runtime enforcement.
2. Pharmacy legal operations.
3. Offline/degraded recovery.
4. Reservation lifecycle, if schema changes are still required.
5. Any cold-chain, recall, or future schema PRs.

Do not run these schema rebuilds in parallel unless maintainers explicitly reserve migration numbers and sequencing in writing.

## C. Rules for each rebuilt schema PR

Each rebuilt schema PR must:

- Start from latest main after migration surgery has merged.
- Read `MIGRATION_AUDIT_STATUS.md` before generating or writing migrations.
- Use the next available migration number, not stale `0045` or `0046` assumptions.
- Update `drizzle/schema.ts` and the corresponding migration together.
- Run migration verification.
- Run `pnpm install` if dependencies are not already installed and current.
- Run `pnpm run check`.
- Run `pnpm test -- --runInBand`.
- Run `pnpm run build`.
- Run `git diff --check`.
- Include DB-backed proof if the schema affects DB behavior, lifecycle, or existing data.
- Include a changed-files review proving no unrelated runtime behavior was smuggled in.
- Not merge if the migration guard fails.

## D. Migration-number reservation protocol

Every schema PR must state all of the following in its PR description:

| Required field | Required content |
| --- | --- |
| Migration number used | Exact numeric prefix reserved for this PR. |
| Why it is next | Link or quote the post-surgery `MIGRATION_AUDIT_STATUS.md` next reserved number. |
| Migration file name | Full `drizzle/<number>_<name>.sql` path. |
| Schema companion | Exact `drizzle/schema.ts` table/column/index declarations changed. |
| Tables added | List every new table, or `None`. |
| Columns added/changed | List every new/changed column, or `None`. |
| Indexes/constraints added | List every new index/constraint, or `None`. |
| Existing data impact | State whether existing rows are read, written, backfilled, constrained, or unaffected. |
| Rollback caveat | State whether rollback is unsupported and requires forward-fix, or provide maintainer-approved rollback procedure. |
| DB smoke status | State whether DB smoke ran, passed, skipped, or failed; never fake a pass. |

## Non-negotiable rebuild guardrails

- Do not reuse stale `0045` or `0046` migration numbers.
- Do not merge schema PRs while duplicate prefixes exist on main.
- Do not merge schema PRs without migration audit proof.
- Do not mix multiple independent schema domains into one PR unless maintainers explicitly approve the batch.
- Do not claim production readiness from schema rebuild alone.
