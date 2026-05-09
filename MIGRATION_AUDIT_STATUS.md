# MIGRATION_AUDIT_STATUS

Static Drizzle migration audit for Wave 0 / Prompt 1 as of 2026-05-08.

> This file reports migration risk only. No migrations were added, removed, renumbered, or edited in this docs/control PR.

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `chore/wave0-current-main-audit-v2` |
| Base SHA inspected | `2b28e7410d40f5a02d258dfcb80b51b51666ca02` |
| Validation results | `pnpm install` passed with warnings; `pnpm run check` passed; `pnpm test -- --runInBand` passed with MySQL integration skipped; `pnpm run build` passed with Vite warnings; `git diff --check` passed. |
| Migration files changed by this PR | None. |

## Static migration inventory

| Item | Result |
| --- | --- |
| Latest numbered migration file | `0044_index_performance_audit.sql` |
| Numbered migration SQL files | 42 files: `0000` through `0029`, then `0032`, `0034` through `0044` |
| Duplicate migration numbers | None found by filename scan. |
| Gaps | `0030`, `0031`, and `0033` are missing. |
| Gaps assessment | Suspicious unless maintainers confirm intentional historical skips. Do not renumber casually; document or repair only in a dedicated migration governance prompt. |
| Migrations added after `0030` | `0032_h1_statutory_schema.sql`, `0034_prescription_vault_consent.sql`, `0035_refund_ledger.sql`, `0036_credit_note_lifecycle.sql`, `0037_invoice_snapshot.sql`, `0038_accounting_journal_batches.sql`, `0039_supplier_ageing_reconciliation.sql`, `0040_tally_export_proof.sql`, `0041_ocr_invoice_exceptions.sql`, `0042_whatsapp_notification_safety.sql`, `0043_privacy_staff_session.sql`, `0044_index_performance_audit.sql` |
| Metadata journal status | `drizzle/meta/_journal.json` contains entries only through `0021_oval_ultimatum`; metadata snapshots also appear only through `0021_snapshot.json`. |
| Metadata risk | High static risk: SQL migrations after `0021` are not reflected in Drizzle metadata journal in this checkout. Confirm whether this is deliberate manual SQL history or an incomplete Drizzle metadata commit before generating more migrations. |

## Destructive-operation scan

A static grep-style scan of `drizzle/*.sql` for common destructive patterns (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM`, `ALTER TABLE ... DROP`, `RENAME TABLE`) found no matches.

Caveat: static string scanning cannot prove a migration is non-destructive in every semantic sense. Any future migration changing column types, nullability, indexes, constraints, or data interpretation still requires human review and backup/restore proof.

## Schema consistency by static inspection

`drizzle/schema.ts` contains table definitions that appear directionally consistent with post-0030 migration intent by domain: H1 register, prescription access/consent, refund ledger, credit notes, invoice snapshots, accounting journal batches/entries, Tally export runs, OCR exception/review structures, WhatsApp notification entities, privacy consents, staff acknowledgements, staff device sessions, and index-oriented structures are present.

Static inspection caveats:

- This pass did not execute migrations against a fresh database because no `TEST_DATABASE_URL` was provided for the full MySQL lifecycle smoke.
- The Drizzle metadata journal lag means future `drizzle-kit generate` may attempt unexpected diffs or collide with hand-written migrations.
- `drizzle/schema.ts` consistency was assessed by table/domain presence, not by a full column-by-column migration replay.

## Open PR migration collision risk

| PR / group | Collision risk | Required handling |
| --- | --- | --- |
| #66 | Low if superseded by #75, high if original branch is still open with schema changes | Close original if still open; do not merge raw. |
| #68 | Medium/high if it contains accounting migrations | Later accounting migrations exist through `0040`; rebuild unique work from latest main. |
| #76 | Unknown | Live changed-files review required; if it touches migrations/schema, rebase and reserve a new migration number. |
| #80 | Unknown | Live changed-files review required; if it touches migrations/schema, rebase and reserve a new migration number. |
| Older barcode/payment/accounting/security duplicates | Medium/high | Do not merge raw because current migration history already advanced to `0044`. |

## What was inspected

- `drizzle/*.sql` numbered migration filenames.
- `drizzle/meta/_journal.json` and visible snapshot files.
- `drizzle/schema.ts` table declarations by static inspection.
- Common destructive SQL tokens by static scan.
- CI workflow migration smoke job definition.

## What was not verifiable

- Fresh MySQL migration replay without `TEST_DATABASE_URL`.
- Production database schema state.
- Whether missing migration numbers are intentional skips or accidentally dropped files.
- Live open PR migration diffs.

## Next recommended prompts

1. Dedicated migration metadata reconciliation prompt: decide whether to regenerate metadata, document manual SQL history, or create a controlled forward-only repair.
2. Clean MySQL migration replay prompt using `pnpm run test:db:bootstrap` and `pnpm run test:db:smoke`.
3. Pre-merge migration collision prompt for any active PR that touches `drizzle/schema.ts` or `drizzle/*.sql`.

## Validation append — 2026-05-09 latest-main proof

| Item | Result |
| --- | --- |
| Validated local main-equivalent SHA | `aef2de345c06fce30a298e4a0e195a9ae4039462` |
| Migration verifier command | `node scripts/verify-migrations.mjs` |
| Migration verifier result | **Failed** with 2 blocking duplicate-prefix issues. |
| Duplicate prefixes present | `0045` and `0046` |
| Duplicate files | `0045_commercial_event_ledger.sql`, `0045_provider_webhook_events.sql`, `0046_rbac_staff_session_governance.sql`, `0046_worker_jobs.sql` |
| Surgery status | **Not complete/effective on validated HEAD.** This branch did not rename migrations or add migrations. |
| Follow-up | `fix/complete-migration-surgery-0045-0046-on-main` should complete the controlled migration collision repair, then rerun full validation. |
