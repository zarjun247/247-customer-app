# STOCK_INVARIANT_STATUS

## Pass 3 status
- Pass 3 completed on 2026-05-03 for release quarantine, batch create opening stock, and stock-audit correction movement centralization.

## Service functions created/extended
- `releaseQuarantine`
- `createBatchWithOpeningStock`
- `applyStockAuditCorrection`
- existing helper reuse: `applyStockMovement`, `quarantineBatch`, `disposeBatch`, `transferStock`, `decreaseStockForPurchaseReturn`

## Flows migrated in this pass
- `inventoryRouter.batch.releaseQuarantine`: stock mutation now uses `releaseQuarantine(...)`, writes movement with true on-hand before/after, and enforces no negative quarantined balance.
- `inventoryRouter.batch.create`: now uses `createBatchWithOpeningStock(...)`; opening stock movement is emitted via invariant service with true qty before/after.
- `inventoryRouter.audit.complete` corrections: per-variance corrections now use `applyStockAuditCorrection(...)` and avoid direct router movement writes.

## Flows not migrated / deferred
- `transfer.initiate` reservation (`qtyReserved`) is non-on-hand reservation bookkeeping and remains intentionally outside movement service mutation APIs.

## No-negative-stock coverage
- All pass-1/pass-2 paths plus pass-3 (`releaseQuarantine`, audit correction, opening stock creation) now run through invariant checks; negative on-hand and invalid quarantined decrements are rejected.

## FEFO status
- FEFO allocation/order logic unchanged in pass 3; batch-level expiry ordering behavior preserved.

## Remaining direct stock mutation risks
- `inventoryRouter` no longer directly inserts `stock_movements` for real stock mutations.
- Remaining risk is broader cross-table quantity synchronization outside inventory router scope (future pass for full stock truth reconciliation).

## Migrations
- No migrations added (existing schema sufficient for invariant centralization).

## Next recommended PR
- stock-invariant pass 4: unify remaining non-on-hand reservation/state synchronization flows (`qtyReserved`, cross-table store aggregate sync) under explicit invariant contracts.
