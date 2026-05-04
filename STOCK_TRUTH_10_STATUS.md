# STOCK TRUTH 10 STATUS

## Mutation audit findings
- Audited stock mutation signatures across routers/services/tests with `rg` for stock movements, qty mutations, opening stock, transfer, return, audit and barcode paths.
- Primary production mutation gateway remains `server/services/stockInvariant.ts` for purchase inward, sale fulfil, sale return, purchase return, adjustment, quarantine/disposal, audit correction, and transfer movements.
- Remaining non-stock reservation/soft-lock writes are in reservation/legacy helpers and are treated as reservation-domain (not direct on-hand mutation).

## Files inspected
- `server/services/stockInvariant.ts`
- `server/services/reservationService.ts`
- `server/services/idempotencyService.ts`
- `server/services/barcodeService.ts`
- `server/services/reconciliationTruth.ts`
- `server/routers/purchaseRouter.ts`
- `server/routers/salesRouter.ts`
- `server/routers/inventoryRouter.ts`
- `server/routers/reportsRouter.ts`
- `drizzle/schema.ts`
- stock/idempotency/reservation guard tests under `server/*.test.ts`

## Paths fixed
- Opening stock hardening in `createBatchWithOpeningStock`: batch now inserts with `qtyOnHand = 0`, then applies exactly one invariant movement for opening quantity.
- Transfer hardening in `transferStock`: source and destination updates + movement rows now execute inside one DB transaction boundary.

## Direct mutations removed
- Removed opening-stock double-count risk from batch create path by eliminating non-zero initial on-hand insert.

## Direct mutations retained with justification
- Reservation and soft-lock domain writes remain outside stockInvariant in reservation-specific service/helpers by design (reservation truth domain), not stock on-hand movement.
- Quarantine disposition in sale-return approval currently updates quarantined bucket and does not re-enter sellable on-hand; tracked as controlled derived mutation gap.

## Canonical stock source
- On-hand source of truth: `batchLedger.qtyOnHand` with movement ledger `stockMovements`.
- Availability source: reservation service formula `availableQty = onHandQty - reservedQty - softLockedQty - quarantinedQty - expiredQty`.

## Remaining risks / gaps
- Some legacy modules still reference `storeSkus.stockQty` for availability/reporting convenience and require deeper integration follow-up.
- Quarantine bucket mutation path should be fully wrapped with explicit invariant helper in next commercial integration pass.
- End-to-end DB integration proofs are partial; static guard coverage added.

## Validation results
- See CI/local run summary in this PR description and final validation checklist.

## Next recommended prompt
`test/commercial-flow-integration`


## Cleanup replay note (2026-05-04)
- Prompt 6 stock-truth patch replayed on clean branch `feat/stock-truth-10-clean` from latest available local mainline commit (`7fcaef3`).
- Opening stock hardening preserved (zero insert + single invariant opening movement).
- Transfer atomicity hardening preserved (single transaction for source/destination + movement rows).
- Remaining gaps: deeper commercial integration tests; return/cancel/refund end-to-end proof; purchase/sale/report integration proof; broader direct qty update audit follow-up.
- Next prompt: `test/commercial-flow-integration`.
