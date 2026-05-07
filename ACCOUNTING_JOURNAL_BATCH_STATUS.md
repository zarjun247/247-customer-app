# Accounting Journal Batch Status

## Current accounting model inspected

- `server/services/accountingLedger.ts` previously exposed one-row-at-a-time journal recording helpers (`recordSalesJournal`, `recordPurchaseJournal`, `recordPaymentJournal`, refund/supplier/GST variants) backed by `accounting_journal_entries`.
- `server/services/accountingBasics.ts` remains a lightweight placeholder-style helper module for basic accounting DTOs and was not changed.
- `server/services/supplierLedger.ts` was read for payable/payment allocation shape only and was not changed, to avoid overlapping supplier ageing/reconciliation work.
- Existing journal rows used `sourceType` plus numeric `sourceId`, account code/name, debit, credit, narration, metadata, and timestamps. There was no durable parent batch enforcing commercial-event balance before this change.

## Schema fields added/confirmed

Reserved migration added: `drizzle/0038_accounting_journal_batches.sql`.

New table/model: `accounting_journal_batches` / `accountingJournalBatches`.

Fields:

- `id`
- `sourceType`
- `sourceRef`
- `storeId` nullable
- `status`: `draft`, `posted`, `reversed`, `failed`
- `totalDebit`
- `totalCredit`
- `postedBy` nullable
- `postedAt` nullable
- `failureReason` nullable
- `createdAt`
- `updatedAt`

Backward-compatible entry linkage:

- `accounting_journal_entries.journalBatchId` is nullable so legacy/orphan rows are preserved and can be reported rather than deleted.

## Balanced batch behavior

`server/services/accountingLedger.ts` now adds:

- `assertBalancedJournalBatch`
- `createJournalBatch`
- `postBalancedJournalBatch`
- `reverseJournalBatch`

Posting invariants enforced before a batch can be marked `posted`:

- `sourceType` and `sourceRef` must be present.
- Lines must include at least one debit and at least one credit.
- Every line needs an account code/name and exactly one positive side.
- Negative debit/credit values are rejected.
- Zero-value lines are rejected.
- Total debit must equal total credit to two-decimal money precision.
- Failed/unbalanced validation attempts create a `failed` batch record with `failureReason` and do not create a `posted` batch.

## Commercial event helpers added

Conservative helper factories now create balanced journal batch input where current data supports exact amounts:

- Sale: debit Cash/Receivable, credit Sales Revenue, credit Output GST when `gstAmount` is supplied.
- Purchase: debit Purchases, debit Input GST when `totalGst` is supplied, credit Supplier Payable.
- Payment: debit Cash/Bank settlement, credit Customer Receivable.
- Refund: debit Sales Returns and Output GST reversal when GST is supplied, credit Cash/Bank.
- Sale return: same balanced shape as refund with `sourceType = sale_return`.
- Purchase return: debit Supplier Payable, credit Purchase Returns, credit Input GST reversal when GST reversal is supplied.

## Integration points completed

- Durable journal batch schema and nullable journal-entry linkage are added.
- Balanced posting service persists one batch plus its child entries only after validation.
- Existing single-entry helpers remain available for legacy callers, with optional `journalBatchId` support.
- Journal export and trial balance helpers now join through posted journal batches instead of summing all entries.
- Mismatch helper reports posted unbalanced batch count and legacy/orphan entry count.

## Integration points deferred with reason

- Live sale/purchase/payment/refund route hooks were not force-wired because current posting hooks are not consistently shaped around numeric source IDs and some sale/return IDs are string UUIDs while legacy `accounting_journal_entries.sourceId` is numeric.
- Refund ledger branch files were not touched. The refund helper targets current refund source data and can be wired to the refund ledger after that branch lands.
- Supplier ageing/reconciliation files were not touched. Purchase and supplier-payment helper wiring should happen after reconciliation ownership is merged.
- Statutory finality is not claimed. This change enforces batch balance for supported accounting events, but not every operational event is automatically posted yet.

## GST behavior

- Sale helper credits Output GST only when an exact `gstAmount` is supplied.
- Purchase helper debits Input GST only when an exact `totalGst` is supplied.
- Return/refund helpers reverse GST only when exact GST reversal amounts are supplied.
- No GST split is fabricated when exact GST input is unavailable.

## Trial balance behavior

- `getTrialBalanceLite` groups by account code/name.
- Only entries attached to `accounting_journal_batches.status = posted` are included.
- Legacy rows without `journalBatchId` are not deleted and are reported by `getJournalBatchMismatches` as `orphanEntryCount`.
- Posted batches whose stored totals diverge are reported as `unbalancedBatchCount`.

## Migration/backfill notes

- Migration is backward-compatible because `journalBatchId` is nullable.
- Existing entries remain queryable as legacy data but are intentionally excluded from posted-batch trial balance until backfilled.
- A future backfill should group legacy entries by source event, verify debit/credit equality, create `posted` or `failed` batch rows, and assign `journalBatchId` only where balance can be proven.

## Remaining risks

- **P0:** Full statutory accounting finality remains deferred until all live sale/purchase/payment/refund/return hooks post through balanced batches atomically.
- **P1:** Legacy rows can affect external reports if consumers bypass the posted-batch trial-balance helper.
- **P1:** UUID-based sale/return events need either a nullable/string source reference on entries or a safe numeric event mapping before live posting can be wired everywhere.
- **P2:** Account codes are intentionally conservative defaults and may need finance-team chart-of-accounts mapping before production ledger export.

## Validation results

- `pnpm install` passed; pnpm warned that build scripts for `@tailwindcss/oxide` and `esbuild` are ignored until approved.
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed with 55 files / 216 tests after adding journal-batch tests.
- `pnpm run build` passed; Vite emitted existing warnings about missing analytics env placeholders and large chunk size.

## Files changed

- `drizzle/schema.ts`
- `drizzle/0038_accounting_journal_batches.sql`
- `server/services/accountingLedger.ts`
- `server/accounting-journal-batches.test.ts`
- `ACCOUNTING_JOURNAL_BATCH_STATUS.md`
