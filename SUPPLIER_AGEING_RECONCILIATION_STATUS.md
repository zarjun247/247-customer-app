# Supplier Ageing & Reconciliation Status

## Current supplier ledger model inspected
- `purchase_invoices` are the payable source of truth for committed supplier invoices. The schema has `supplierId`, `storeId`, `invoiceNo`, `invoiceDate`, `netAmount`, and lifecycle status, but no dedicated invoice `dueDate`; service logic supports `dueDate` if it appears in a selected row later and otherwise uses `invoiceDate`.
- `supplier_payments` records supplier payments, auto-created credit payables, advances, debit notes, return credits, and adjustments.
- `supplier_payment_allocations` already existed and is now used as the invoice-level allocation ledger for partial payments, advances applied, debit notes, purchase return credits, and adjustments.
- `purchase_returns` / `purchase_return_lines` model supplier purchase returns. Committed returns reduce outstanding in reconciliation; stock movement logic was not rewritten.

## Ageing bucket behavior
- Ageing buckets are calculated per open committed/partially-returned invoice.
- Basis date is `dueDate` when present on the invoice row; otherwise `invoiceDate`.
- Buckets are `0-30`, `31-60`, `61-90`, and `90+` days.
- Supplier ageing output contains `supplierId`, `supplierName`, `totalOutstanding`, `bucket0To30`, `bucket31To60`, `bucket61To90`, `bucket90Plus`, and `invoiceCount`.
- Store filtering is supported in DB-backed report loading where the purchase invoice model has `storeId`.

## Partial payment/allocation behavior
- One supplier payment can allocate across one or more invoices through `supplier_payment_allocations`.
- Allocations record `supplierPaymentId`, `purchaseInvoiceId`, `amount`, `allocatedAt`, and `allocatedBy`; existing `createdBy` is retained for compatibility.
- Invoice outstanding is calculated as invoice payable minus invoice payment/advance allocations minus debit notes/return credits/adjustments.
- Payment allocation validates supplier and store matching before auto-applying a payment to a list of invoice IDs.

## Purchase return/debit note behavior
- Debit-note allocations reduce invoice outstanding.
- Committed purchase returns reduce invoice outstanding even if historical return-credit allocation rows are missing.
- Return-credit allocation rows are still created when the purchase return commit path records a supplier ledger credit.
- Draft purchase returns are ignored by reconciliation.

## Advances behavior
- Supplier advances are represented by `supplier_payments.paymentMode = 'advance'`.
- Applied advances reduce invoice outstanding through `advance_applied` allocation rows.
- Unapplied advances are reported as supplier/store credit exposure in reconciliation rows and totals, but are not treated as fake invoice settlement until allocated.

## Report shape
- Reconciliation rows return: `invoiceAmount`, `paidAmount`, `allocatedAmount`, `outstandingAmount`, `debitNotes`, `purchaseReturns`, `adjustments`, `advances`, ageing days/bucket, and an internal-only `reconciliationStatus` of `internal_open` or `internal_settled`.
- The report also returns supplier ageing rows, aggregate totals, and `csvData`.
- No external supplier statement matching, synced flag, or fake reconciled status is produced.

## Migration/backfill notes
- Added reserved migration `drizzle/0039_supplier_ageing_reconciliation.sql`.
- Migration adds nullable `allocatedBy` to `supplier_payment_allocations` and backfills it from existing `createdBy` where available.
- No invoice due-date backfill is included because the current purchase invoice schema does not expose a due-date column.

## Remaining risks
- P0: None identified in this supplier-ledger-focused patch.
- P1: Existing production data may have committed purchase returns without historical supplier return-credit rows; report logic handles them, but ledger history will only be complete after operational backfill if finance wants explicit credit rows for every historical return.
- P1: Supplier statement imports/external matching remain out of scope; reconciliation is internal-only.
- P2: Invoice due dates need a future schema/product decision before ageing can honor negotiated supplier credit terms from stored data.

## Validation results
- Passed: `pnpm install` (pnpm reported ignored dependency build scripts for @tailwindcss/oxide and esbuild).
- Passed: `pnpm run check`.
- Passed: `pnpm test -- --runInBand` (55 files / 211 tests).
- Passed: `pnpm run build` (Vite warned that analytics env placeholders are unset and the main JS chunk exceeds 500 kB).

## Files changed
- `server/services/supplierLedger.ts`
- `server/routers/purchaseRouter.ts`
- `drizzle/schema.ts`
- `drizzle/0039_supplier_ageing_reconciliation.sql`
- `server/supplier-ledger-reconciliation.test.ts`
- `SUPPLIER_AGEING_RECONCILIATION_STATUS.md`
