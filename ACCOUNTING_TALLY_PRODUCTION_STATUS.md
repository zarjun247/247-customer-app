# ACCOUNTING_TALLY_PRODUCTION_STATUS

## Tables inspected
- purchase_invoices, purchase_lines, purchase_returns, purchase_return_lines
- supplier_payments, supplier_payment_allocations
- accounting_journal_entries, tally_export_runs
- sales, sale_lines, sale_returns, sale_return_lines, counter_payments, invoice_sequences

## Migrations added
- `drizzle/0028_accounting_allocation_journal_tally.sql`
  - Alters `supplier_payments.paymentMode` DB enum to include: `credit`, `advance`, `debit_note`, `return_credit`, `adjustment`.
  - Creates durable `supplier_payment_allocations` table.
  - Creates durable `accounting_journal_entries` table.
  - Creates durable `tally_export_runs` table.

## paymentMode migration posture
- Migration is required and added because MySQL enum is DB-constrained.
- Schema enum change is now matched by SQL migration.

## Supplier ledger durability status
- Allocation is now durable via `supplier_payment_allocations`.
- `allocatePaymentToInvoice` writes allocation rows with idempotency guard.
- `allocateSupplierPayment` consumes remaining unallocated amount and applies invoice-wise.
- `markInvoicePaidIfSettled` now checks allocation totals against invoice net.

## Partial / advance / debit-note / return-credit behavior
- Partial allocation: supported through amount-based invoice allocations.
- Advance payment: persisted as supplier payment mode `advance` and can be allocated later.
- Debit note and purchase return credit: persisted as payment rows plus allocation markers.
- Duplicate allocation attempts are idempotent via unique key + service guard.

## Accounting journal behavior
- Added durable `accounting_journal_entries` table.
- Added `server/services/accountingLedger.ts` helpers for sales/purchase/payment/refund/supplier/GST journal posting.
- Trial balance and journal export are backed by durable journal rows.

## Tally export run/audit behavior
- Added durable `tally_export_runs` with checksum and status.
- Duplicate export blocked unless explicit `allowReexport` true.
- Export response includes checksum/runId and explicit deferred flags for XML/ODBC.

## GST/settlement helper posture
- Added helper stubs from canonical tables:
  - `getGstInputSummary`, `getGstOutputSummary`, `getGstNetPosition`
  - `getSettlementSummary`, `getPaymentModeBreakdown`
- Statutory-complete GST computation remains partial and is not claimed complete.

## Remaining gaps (honest)
- Router-level full wiring for all new helper functions across all accounting endpoints is pending.
- Purchase-return commit-to-ledger integration must be completed in purchase flow end-to-end.
- Tally export category coverage beyond provided rows input remains progressive.

## Validation results
- See PR validation section for install/check/test/build command outcomes.

## Next recommended prompt
`feat/product-master-normalization-migration`

## Deferred explicitly
- Tally XML/ODBC integration is deferred and not claimed complete.
