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

## Mega 02 stock reservation truth update (2026-05-07)

### Fixed items
- `storeSkus.stockQty` is now synchronized through `syncStoreSkuAggregate`, which sums active `batchLedger.qtyOnHand` for the product/store/variant and no longer copies a single purchase movement `qtyAfter` into the product-store read model.
- Purchase returns now resolve the canonical `batchLedger` row for the returned legacy batch, block returns that exceed canonical batch availability, apply the invariant purchase-return movement to the ledger row, and resync the aggregate SKU read model.
- `stock_reservations` is now a durable reservation ledger with explicit `active`, `released`, `expired`, `consumed`, and `cancelled` statuses plus product/store/variant/SKU/order/cart identity and release reason fields.
- Canonical availability now subtracts active unexpired reservations, batch reserved quantity, soft locks, quarantine, and expired quantities.
- Barcode lookup, POS batch availability, app catalog/SKU reads, cart validation, checkout, and inventory current-stock reporting now read from canonical availability inputs or the canonical aggregate read model where feasible.
- The production `syncStoreSkuSoftLocks` deferred stub was replaced with a real reconciliation operation that clears temporary SKU soft locks after durable reservations become canonical.

### Remaining risks / deferred items
- Concurrency protection still relies on database isolation around the check/insert reservation sequence; a future DB integration test should prove row/gap-lock behavior under real MySQL load.
- Some command-center and legacy pharmacy/admin dashboards still use `storeSkus.stockQty` as a read-model signal; because it is now aggregate-synced this is acceptable for triage dashboards, but not a final source for sale/checkout decisions.
- Legacy `batches.quantity` remains synchronized per batch for compatibility only; `batchLedger` plus `stock_reservations` is the canonical truth.

### New score estimate
- Stock truth / reservation readiness: 8.1 / 10.
