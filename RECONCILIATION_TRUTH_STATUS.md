# RECONCILIATION TRUTH STATUS

## Schema/tables inspected
sales, sale_lines, counter_payments, sale_returns, sale_return_lines, stock_movements, h1_register, purchase_invoices, supplier_payments, shift_closings.

## Canonical truth sources
- Orders/Sales: `sales`
- Lines: `sale_lines`
- Payments: `counter_payments`
- Refunds/returns: `sale_returns` + `sale_return_lines`
- Cancellations: `sales.status=cancelled` + cancellation fields
- Stock movement truth: `stock_movements`

## Service functions added
`server/services/reconciliationTruth.ts`:
- recordSaleTruth
- recordPaymentTruth
- recordRefundTruth
- recordCancellationTruth
- getOrderFinancialTruth
- getDailySalesTruth
- getGstReportTruth
- getH1ReportTruth
- getBatchwiseBalanceTruth
- verifyOrderTruth
- verifyMovementTruth

## Cancellation/refund policy implemented
- Denies cancellation for delivered sale.
- Requires cancellation reason.
- Records cancellation requested/cancelled audit events.
- Computes cancellation cost (5% for packed/out_for_delivery fallback policy).
- Emits refund.recorded audit when paid order gets cancelled.

## Report endpoints migrated/normalized
- `reports.dailySale` now returns `{ rows, totals, csvData }`.
- `reports.gstSummary` now returns `{ rows, totals, csvData }`.
- `reports.h1Register` now returns `{ rows, totals, csvData }`.

## Deferred
- Full movement-level reconciliation on legacy order tables deferred due mixed `orders` and `sales` report sources.
- Payment/refund gateway settlement reconciliation deferred to next PR.

## Migrations
No migration added; existing tables and fields were reused.

## Validation
- `pnpm run check`: pass
- `pnpm test -- --runInBand`: pass
- `pnpm run build`: pass (with non-blocking Vite warnings about optional analytics env placeholders and chunk-size warning).

## Fixes made in validation pass
- No code fixes were required after running full validation; compilation, tests, and build all passed on this branch.
- Guard test remains lightweight/string-based by design; integration-level cancellation/report shape tests are still deferred to a future DB-backed harness pass.

## Next recommended mega prompt
Rx/H/H1/X Compliance + POS + Discounts + Margin Locks
