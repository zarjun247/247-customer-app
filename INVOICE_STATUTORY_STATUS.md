# INVOICE_STATUTORY_STATUS

## Corrections in this PR
- Removed invoice service stubs: `getInvoiceBySale` and `getCustomerInvoiceSummary` now return explicit runtime status objects and limitations (no fake "complete" invoice document claims).
- Added durable sequence migration/table: `drizzle/0027_invoice_sequences.sql` + `invoiceSequences` schema.
- Added DB uniqueness constraints for `sales.bill_no` and `sale_returns.return_no` in migration.
- Changed sales draft behavior to generate `DRF-*` draft numbers only; final statutory invoice numbers are now reserved at `confirmSale`.
- Added idempotent duplicate return guard: pending return for same sale is reused, not re-numbered.

## salesRouter deletion (+ safety)
The prior `-32` lines were only the two local helper functions (`generateBillNo`, `generateReturnNo`) and their inline SQL query logic. No stock/payment/compliance logic was removed. Number generation moved to `server/services/invoiceNumbering.ts`.

## Sequence behavior
- Canonical sequence state is now durable in `invoice_sequences` keyed by `(storeId, financialYear, documentType)`.
- Final numbers are formatted as `INV/CRN/RTN-S{store}-{FY}-{NNNN}`.
- Uniqueness is guarded in-service across sales + sale returns and backed by DB unique constraints on bill/return fields.

## Invoice issuance timing
- Draft sale: non-statutory `DRF-*` bill number.
- Confirm sale: reserves final statutory invoice number once (if still draft/proforma number).
- Duplicate confirm: existing confirmed path returns idempotent response with existing bill number.

## Invoice read behavior
- `getInvoiceBySale`: returns found/unavailable status; when found, builds invoice payload from sale + lines and marks model limitations explicitly (`incomplete_data_model` when statutory store fields missing).
- `getCustomerInvoiceSummary`: returns partial summary with explicit scope/limitations; does not claim insurer/statutory completeness.

## Credit/return note status
- Return note numbering is durable and idempotent for duplicate pending return attempts.
- Credit-note lifecycle remains foundation-only; statutory finalization and full reversal workflow still pending.

## Remaining gaps
- `stores` table still lacks canonical GSTIN/drug-license fields; completeness intentionally fails when absent.
- Customer ownership linkage for summaries should move from `createdBy` fallback to strict customer mapping.
- Full statutory invoice persistence/PDF harmonization remains pending.

## Next recommended prompt
`feat/accounting-supplier-tally-production`

## Mega 03 invoice race-safety update (2026-05-07)

### Fixed items
- `reserveInvoiceNumber` now reserves inside a transaction with row locking when available, with a MySQL named-lock fallback for non-transaction adapters.
- Invoice sequence FY and prefixes now use the Asia/Kolkata business date helper consistently for sale invoices, credit notes, and return notes.
- Draft bill numbers now include a UUID suffix so multiple drafts created in the same second do not collide with the `sales.bill_no` unique constraint.
- Drizzle schema now mirrors existing migration uniqueness for `sales.bill_no`, `sale_returns.return_no`, and `(storeId, financialYear, documentType)` invoice sequences.

### Remaining risks
- Real concurrent reservation tests should be added against a MySQL test database; current coverage is source/guard plus deterministic helper coverage.
- Credit-note lifecycle remains foundation-only; numbering helper is safe, but full credit-note statutory workflow is still pending.

### Deferred with reason
- No PDF/statutory rendering redesign was attempted; this pass only addressed numbering race safety and FY correctness.

### DB constraint / migration notes
- No new migration was added. `drizzle/0027_invoice_sequences.sql` already contains sequence uniqueness plus unique constraints for `sales.bill_no` and `sale_returns.return_no`.
- Backfill assumption: environments applying the existing migration must have no duplicate draft/final bill numbers or duplicate return numbers before adding constraints.

### New score estimate
- Invoice numbering race/FY safety: 8.2 / 10.
