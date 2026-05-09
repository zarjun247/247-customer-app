# Tally Export Proof Status

## Current Tally/export model inspected
- `server/services/tallyExport.ts` previously generated ad-hoc CSV from arbitrary rows, computed a checksum with plain `JSON.stringify`, inserted `tally_export_runs`, and returned duplicate status by checksum only.
- `server/services/accountingBasics.ts` remains a lightweight helper layer that returns journal-shaped entries; this pass did not rewrite accounting event posting.
- `server/services/accountingLedger.ts` is the durable ledger source inspected for export input. It writes `accounting_journal_entries` with debit/credit columns and exposes `getJournalExportRows` for current persisted ledger rows.
- `server/routers/reportsRouter.ts` was inspected; it currently exposes report summaries but no Tally push/import route. No ERP connector or provider push path is used by this change.

## Export format chosen
- The export remains local/file-based and now uses a deterministic Tally-compatible CSV shape derived from ledger rows.
- CSV columns are:
  - `voucherDate`
  - `voucherType`
  - `ledgerName`
  - `debitAmount`
  - `creditAmount`
  - `gstLedgerMapping`
  - `narration`
  - `sourceReference`
  - `storeId`
  - `companyIdentifier`
- The export is generated from current accounting ledger rows. If future balanced journal batch support lands, the export should be pointed at that canonical balanced batch source instead of claiming balance from incomplete source rows.

## Export run tracking behavior
- `drizzle/0040_tally_export_proof.sql` hardens `tally_export_runs` by adding explicit period fields and audit fields:
  - `periodStart`
  - `periodEnd`
  - `exportedAt`
  - `failureReason`
  - `fileKey`
  - `fileUrl`
  - `updatedAt`
  - `duplicateKey` (derived proof key for database uniqueness even when nullable period/store fields are global)
- The Drizzle model now includes the required run fields, with legacy `dateFrom`/`dateTo` retained for compatibility.
- Generated exports are persisted with `status = generated`, `generatedBy`, `generatedAt`, row count, checksum, and nullable storage/export fields.
- Failed generation attempts are persisted with `status = failed` and `failureReason`.

## Duplicate prevention behavior
- Duplicate detection is scoped to the same `storeId`, `exportType`, `periodStart`, `periodEnd`, and deterministic `checksum`.
- The migration replaces checksum-only uniqueness with `uq_tally_export_proof_window` over a derived scoped duplicate key because MySQL composite unique indexes permit multiple `NULL` values.
- Application code returns `duplicate_blocked` for a matching run and does not insert a second run.
- Forced re-export remains disabled because this branch did not find an existing actor/reason/audit pattern that safely supports it without introducing a separate approval/audit workflow.

## Checksum behavior
- Checksums use stable sorted-key serialization plus SHA-256.
- The checksum payload includes export type, store, period, and normalized CSV rows.
- Tests prove equivalent data with different object key order produces the same checksum and changed data produces a different checksum.

## GST ledger mapping behavior
- Basic deterministic defaults are included:
  - `Output GST`
  - `Input GST`
  - `Sales`
  - `Purchases`
  - `Cash/Bank`
  - `Supplier Ledger`
  - `Customer Ledger`
  - fallback `Unmapped Tally Ledger`
- Mapping is derived from current ledger `sourceType`, `accountCode`, `accountName`, and optional metadata hints.
- Exact customer-specific Tally ledger names are still a configuration requirement; this pass avoids inventing externally-confirmed ledger mappings.

## Import/sync limitations
- This change does not call any ERP/Tally connector.
- Generated exports return `export_generated_not_synced` and explicitly set `imported: false` and `synced: false`.
- Duplicate exports return `export_generated_duplicate_not_synced` and explicitly set `imported: false` and `synced: false`.
- Failed exports return `export_generation_failed_not_synced` and explicitly set `imported: false` and `synced: false`.
- No code claims Tally import success without an external confirmation path.

## Remaining risks
- **P0:** None identified in this Tally/export-focused pass.
- **P1:** Current exports depend on individual ledger rows; once balanced journal batches become canonical, export source selection should move to those batches to prove voucher balance.
- **P1:** Forced re-export requires a dedicated actor/reason/audit policy before it can be safely enabled.
- **P2:** Exact Tally ledger names remain configurable business data; deterministic defaults are safe but may need customer-specific mapping before production import.
- **P2:** `fileKey`/`fileUrl` are nullable until a storage-backed download artifact flow is wired for generated CSVs.

## Migration/backfill notes
- `drizzle/0040_tally_export_proof.sql` backfills `periodStart`/`periodEnd` from legacy `dateFrom`/`dateTo` where available.
- The migration updates the status enum to `pending/generated/exported/failed/cancelled` and removes the previous `reexported` status because re-export is not treated as a proof state without external audit.
- The migration drops the old checksum-only unique index and adds the scoped duplicate-prevention unique key on `duplicateKey`.

## Validation results
- `pnpm exec tsc --noEmit --pretty false` passed during development.
- `pnpm test -- server/tally-export-proof.guard.test.ts --runInBand` passed and, due current Vitest argument handling, executed the full server test suite: 55 files / 212 tests passed.
- Required final validation commands are recorded in the PR/final response.

## Files changed
- `server/services/tallyExport.ts`
- `drizzle/schema.ts`
- `drizzle/0040_tally_export_proof.sql`
- `server/tally-export-proof.guard.test.ts`
- `server/accounting-tally-production.guard.test.ts`
- `TALLY_EXPORT_PROOF_STATUS.md`
