# Reports Audit Reconciliation Status

## Branch / Scope

- Branch: `feat/p20-19-reports-audit-reconciliation`
- Migration added: **None**
- Scope kept to read-only report/read-model shapes, audit-reference hygiene guards, and sensitive redaction guards.
- Explicitly not touched: active parallel branch files for idempotency, invoice numbering, payment provider internals, admin cockpit UI, H1 schema/statutory gate schema changes, prescription vault migrations, refund ledger migrations, supplier ageing migrations, OCR exception workflow, Tally export, WhatsApp notification safety, product master runtime gates, stock/reservation mutation services, barcode UX, and accounting journal batch files.

## Reports Inspected

- `server/routers/reportsRouter.ts`
  - Existing patterns found: daily sale returns `{ summary, byCategory, rows, totals, csvData }`; GST summary returns `{ hsnRows, rows, totals, csvData }`; H1 register attaches `{ rows, totals, csvData }`; stock valuation returns `{ rows, totals }`.
  - Existing reports are not rewritten wholesale.
- `server/routers/inventoryRouter.ts`
  - Current stock uses canonical availability from `batch_ledger` less ledger reserved, quarantined, expired, and active `stock_reservations`.
- `server/services/complianceGate.ts`
  - H1 current-main fields are used as-is; no H1 schema or statutory gate changes were made.
- `server/services/audit.ts` and `server/_core/redact.ts`
  - Audit logging remains centralized; redaction helper is strengthened for high-risk payload fields.

## Reports Added / Strengthened

1. `stockReconciliation`
   - Read-only report comparing `stock_movements`, `batch_ledger`, `store_skus`, active `stock_reservations`, quarantined/expired quantities, and canonical availability.
   - Returns `{ rows, totals, csvData, mismatchCount }`.
   - Mismatch flags include canonical availability, store SKU stock, store SKU soft lock, and movement projection mismatches.

2. `h1Completeness`
   - Current-main-compatible H1 completeness report.
   - Flags missing `billNo`, `patientName`, `patientPhone`, `drugName`, `batchNo`, `qty`, `pharmacistId`, `prescriptionRef`, `saleRef`, `saleLineRef`, and `doctorName`.
   - Tolerates current schema aliases: `saleId`/`orderId` for sale reference, `prescriptionLineId` for line reference, and `prescribingDoctor` for doctor name.

3. `paymentInvoiceConsistency`
   - Current-main-compatible payment/refund/invoice consistency report over `orders`, `payment_records`, and H1 bill references.
   - Uses `payment_records.refundId`, `payment_records.refundedAt`, and `payment_records.status = 'refunded'` as the current refund source.
   - Returns `{ rows, totals, csvData, mismatchCount }`.

4. `supplierOutstanding`
   - Current supplier outstanding report using committed/partially returned `purchase_invoices`, `supplier_payments`, and committed `purchase_returns`.
   - Returns current outstanding totals and overpayment/over-credit mismatch flags.

5. `dailySaleGst`
   - Daily sale GST summary over current `orders`, `order_items`, and `products` GST rate data.
   - Returns date, store, taxable value, GST amount, gross sales, discounts placeholder, refunds/returns where current order status supports it, and invoice count.
   - Returns `{ rows, totals, csvData }`.

## Canonical Sources Used

- Stock canonical source: `batch_ledger` aggregate and active `stock_reservations`, matching PR #51 current-stock availability formula.
- H1 current-main source: `h1_register` available fields only.
- Payment/refund current-main source: `orders` plus `payment_records`; refund ledger table is not assumed.
- Supplier outstanding current-main source: `purchase_invoices`, `supplier_payments`, and committed `purchase_returns`.
- GST current-main source: `orders`, `order_items`, and product `gstRate`.

## Known Parallel-Branch Dependencies

- H1 schema branch: may add more statutory final fields; this branch only reports completeness for fields currently available on main and does not claim statutory-final reporting.
- Refund ledger branch: advanced refund reconciliation must switch to the refund ledger once merged; this branch documents and reports current `payment_records` refund source only.
- Supplier ageing/reconciliation branch: ageing buckets and advanced payable schedule logic remain dependent on that branch; this branch only computes current outstanding amounts.
- Invoice/idempotency branch: this branch does not modify invoice numbering, invoice snapshots, or idempotency/race-safety code.

## Audit Guard Behavior

- Added guard coverage that detects high-risk static patterns: `entityId: 0`, `Number(uuid)`, `Number(line.id)`, `Number(saleId)`, and NaN-prone audit entity references for UUID/line-id casts.
- Current H1/statutory report paths are scanned without broad-refactoring active files owned by parallel branches.
- Report reconciliation procedures are tested as read-only blocks with no `.insert(`, `.update(`, or `.delete(` calls.

## Sensitive Redaction Behavior

- `redactSensitive` now covers OTP/code values, bearer/auth tokens, payment signatures/secrets, cookies, and inline prescription/raw image data URLs.
- `redactReportPayload` wraps existing object redaction for reports/audit payloads before log exposure.
- Tests verify prescription image raw data, OTP codes, payment signatures/secrets, and auth cookies/tokens are not exposed.

## Remaining Risks

- P0: None identified in this branch.
- P1: Stock movement projection is a report-level diagnostic and may require deeper reconciliation semantics after stock mutation branches settle.
- P1: Refund reconciliation remains current-main-compatible and should be upgraded after the parallel refund ledger branch lands.
- P1: Supplier outstanding lacks ageing buckets until the supplier ageing branch lands.
- P2: Daily GST discounts are reported as `0` because current main lacks a dedicated order-level discount field in the report source.
- P2: Invoice count falls back to current invoice URL/key or H1 bill references until invoice snapshot branches settle.

## Validation Results

- `pnpm install`: Passed; lockfile already up to date. pnpm warned that dependency build scripts for `@tailwindcss/oxide` and `esbuild` are ignored until approved.
- `pnpm run check`: Passed.
- `pnpm test -- --runInBand`: Passed; 55 files / 216 tests.
- `pnpm run build`: Passed. Vite warned that analytics env placeholders are undefined and that one chunk exceeds 500 kB; these are existing environment/bundle warnings.

## Files Changed

- `server/routers/reportsRouter.ts`
- `server/services/reconciliationReports.ts`
- `server/_core/redact.ts`
- `server/reports-audit-reconciliation.guard.test.ts`
- `REPORTS_AUDIT_RECONCILIATION_STATUS.md`
