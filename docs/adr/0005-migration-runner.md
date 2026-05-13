# ADR-0005: Custom migration runner over drizzle-kit migrate

## Status

Accepted — implemented in SM-K (Phase 0), 2026-05.

---

## Context

Drizzle-kit's built-in `drizzle-kit migrate` command tracks applied migrations in `__drizzle_migrations` and uses a journal file (`_journal.json`). After multiple development sessions, the journal tracked only 47 of 68 SQL files, making `drizzle-kit migrate` silently skip the un-journalled migrations.

Additionally, some migration SQL files (`0061_vault_encryption_columns.sql`) contain `ALTER TABLE ... ADD COLUMN col AFTER other_col` referencing a column that does not exist in the table at migration time. MySQL rejects the `AFTER` clause with `ER_BAD_FIELD_ERROR`. The standard Drizzle runner does not handle this.

CI needed a single idempotent step that could re-run all 68 migrations from scratch or incrementally without operator intervention.

---

## Decision

Replace `drizzle-kit migrate` with a custom Node.js runner at `scripts/apply-migrations.mjs`. It:

1. Tracks applied migrations in a custom table `_app_migrations` (keyed on filename + SHA-256 of file content).
2. Runs migrations ordered by the `NNNN_` filename prefix.
3. Skips files matching `part\d+_*.sql` (covered by numbered migrations 0019–0021).
4. Silently skips idempotency errors: `ER_TABLE_EXISTS_ERROR`, `ER_DUP_FIELDNAME`, `ER_DUP_KEYNAME`, `ER_CANT_DROP_FIELD_OR_KEY`.
5. Strips invalid `AFTER` clauses on `ER_BAD_FIELD_ERROR` and retries.

`drizzle-kit` is retained only for TS type generation (`pnpm drizzle:types`).

---

## Consequences

### Positive

- CI has a single `pnpm run test:db:bootstrap` step that applies all 68 migrations idempotently.
- Production deploy via `pnpm run db:push` no longer fails on out-of-order journal state.
- The runner is auditable in git — no dependency on drizzle-kit's internal state machine.

### Negative

- `0061_vault_encryption_columns.sql` and other migration files with invalid `AFTER` clauses remain in the repo with the workaround baked into the runner. SM-L Phase 4 should audit and produce corrected SQL files.
- Two dead one-shot scripts (`migrate-part10.mjs`, `migrate-part11.mjs`, `migrate-part12.mjs`, `migrate-v10.mjs`) remain in `scripts/` — should be deleted in SM-L Phase 4.
- The custom runner is a maintenance burden when upgrading drizzle-orm.
