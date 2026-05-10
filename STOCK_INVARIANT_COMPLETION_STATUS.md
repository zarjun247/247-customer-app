# STOCK_INVARIANT_COMPLETION_STATUS

Updated: 2026-05-10.

## Audit command

`rg -n "db\.update\(batchLedger\)|tx\.update\(batchLedger\)|db\.update\(batches\)|qtyOnHand|qtyReserved|insert\(stockMovements\)" server drizzle --glob '*.ts' --glob '!server/mysql-concurrency.integration.test.ts'`

## Result

- Purchase and sale service seams route commercial stock increases/decreases through `stockInvariant`.
- `stockInvariant.ts` remains the approved writer for `batch_ledger.qtyOnHand` and `stock_movements` commercial movement rows.
- `commercialTruthSeams.ts` inserts a new `batch_ledger` row with zero quantities before calling `increaseStockForPurchaseCommit`; this is an allowed batch-initialization exception, not a stock movement.
- Existing `purchaseRouter.ts` legacy `batches.quantity` mirror writes remain documented exceptions for backward compatibility with legacy batch display. They mirror `stockInvariant` movement results and should be removed after all readers use `batch_ledger`.
- Existing `reservationService.ts` writes `stock_reservations.status/releaseReason` only; it does not yet decrement `batch_ledger.qtyReserved` on terminal transition. This is a P1 reservation truth blocker.

## Remaining bypasses / exceptions

- Legacy `batches` writes in purchase commit/return are compatibility mirrors.
- Test fixtures and in-memory commercial harnesses mutate fixture objects only and are not runtime stock truth.
- Reservation `qtyReserved` accounting still requires a follow-up sprint to reconcile durable reservation rows to `batch_ledger.qtyReserved` without double release.
