# Invoice Snapshot Status

## Current invoice model inspected
- `server/services/invoiceService.ts` already built computed invoice lines with GST breakup, taxable values, discount amounts, totals, and statutory completeness checks, but it returned composed payloads at read time instead of persisting an immutable invoice copy.
- `server/services/invoiceNumbering.ts` was inspected only; invoice number reservation/formatting was not modified.
- `server/routers/salesRouter.ts` confirms counter sales by reserving the final bill number, writing sale/payment records, and now creates a snapshot immediately after the confirmed payment record is inserted.
- `server/db.ts` had an order delivery invoice path that generated a text invoice and updated `orders.invoiceUrl`/`orders.invoiceKey`; it now records snapshot status truthfully around storage success/failure.

## Snapshot schema added
- Added `invoice_snapshots` through reserved migration `drizzle/0037_invoice_snapshot.sql` and schema export `invoiceSnapshots`.
- Columns: `id`, nullable `sale_id`, nullable `order_id`, `bill_no`, `store_id`, nullable `customer_id`, `snapshot_json`, `snapshot_hash`, nullable `pdf_file_key`, nullable `pdf_file_url`, `status`, nullable `failure_reason`, nullable `generated_by`, `generated_at`, `created_at`, and `updated_at`.
- Status values are `generated`, `pdf_generated`, `failed`, and `cancelled`.
- The migration is backward-compatible and creates a new table only; it does not alter sales, order, payment, stock, or invoice numbering tables.

## Snapshot payload fields
The sale snapshot payload preserves generation-time values for:
- Header/reference: `billNo`, `invoiceDate`, `storeId`, sale reference, optional order reference, optional prescription reference.
- Store identity: `storeName`, `storeAddress`, `storeGSTIN`, `storeDrugLicense` where available.
- Pharmacist: `pharmacistName`, `pharmacistLicense` where available.
- Customer: `customerId`, `customerName`, `customerPhone`, `customerAddress` where available.
- Line items: product name, batch number, expiry, HSN, GST rate, MRP, selling price, discount, quantity, taxable value, CGST, SGST, IGST, GST total, and line total.
- Totals: subtotal, total discount, taxable total, GST total, and grand total.
- Payment reference: payment mode/ref/gateway/status/amount where available.

## Statutory completeness behavior
- Missing values are never faked.
- Critical store statutory fields (`storeGSTIN`, `storeDrugLicense`, `storeAddress`) are reported in `statutoryCompleteness.missingFields` when unavailable.
- Payload completeness is `complete` only when required header, store, and line statutory values exist; otherwise the payload carries `status: warning`.
- In production, missing critical store fields are also surfaced in `productionCriticalMissing`; current flow still generates the JSON snapshot to avoid breaking live counter/delivery flows.

## PDF behavior
- Counter-sale snapshots are created with `status: generated` unless real PDF key+URL values are provided.
- Order delivery invoice generation records `status: pdf_generated` only after storage returns a real key/url and `orders.invoiceUrl`/`orders.invoiceKey` is updated.
- If order invoice storage fails, a snapshot is recorded with `status: failed` and `failureReason`; the original error is rethrown so callers do not receive fake PDF success.

## Insurer-ready export behavior
- Added an insurer-ready package helper that returns the immutable snapshot, prescription reference, payment reference, order/sale reference, medicine summary, and `insurerSubmissionReady` derived from statutory completeness.
- Added a protected sales router query to retrieve a sale snapshot package while enforcing customer/staff access checks.
- No insurance claim submission automation was added.

## Immutability behavior
- Snapshot JSON is built at generation time and stored in `invoice_snapshots.snapshot_json`.
- `snapshotHash` uses deterministic stable serialization and SHA-256, so the same snapshot payload hashes identically regardless of object key insertion order.
- Later product/store/customer price or master-data changes do not alter existing snapshot JSON; regeneration should create a separate snapshot/replacement event rather than silently mutating existing JSON.

## Remaining risks
- **P0:** None known in the implemented invoice-snapshot scope.
- **P1:** The current store schema does not yet expose first-class GSTIN/drug-license columns, so these fields are captured when present on runtime rows and otherwise reported as missing statutory fields.
- **P1:** App-order invoices still use existing order references (`ORDER-<id>`) because statutory invoice numbering for app-order invoices is outside this branch and invoice numbering logic was intentionally not changed.
- **P2:** Historical sales/orders are not backfilled by this migration; a separate audited backfill plan is needed for legacy invoices.

## Migration/backfill notes
- Migration added: `drizzle/0037_invoice_snapshot.sql`.
- No automatic backfill is included.
- Suggested future backfill: insert one snapshot per confirmed historical sale/order from the original persisted sale/order/line/payment rows, mark missing statutory fields explicitly, and keep hashes deterministic.

## Validation results
- `pnpm exec tsc --noEmit --pretty false` passed during development.
- `pnpm test -- --runInBand server/invoice-snapshot.guard.test.ts` passed, and because this repository's Vitest invocation treats the extra args as pass-through, it executed the full current suite: 55 files / 214 tests passed.
- Final required validation commands were run before commit; see PR/final summary for exact results.

## Files changed
- `drizzle/schema.ts`
- `drizzle/0037_invoice_snapshot.sql`
- `server/services/invoiceSnapshotService.ts`
- `server/routers/salesRouter.ts`
- `server/db.ts`
- `server/invoice-snapshot.guard.test.ts`
- `INVOICE_SNAPSHOT_STATUS.md`
