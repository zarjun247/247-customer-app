# STOCK_INVARIANT_STATUS

## Pass 2 status
- Pass 2 is completed for purchase return commit, quarantine/disposal on-hand mutations, and transfer receive movement writes.

## Service functions created/extended
- `quarantineBatch`
- `disposeBatch`
- `transferStock`
- existing helper reuse: `decreaseStockForPurchaseReturn`

## Flows migrated in this pass
- purchase return commit: now uses `decreaseStockForPurchaseReturn(...)` in `purchaseRouter.commitReturn`.
- batch quarantine: now routes on-hand decrement through `quarantineBatch(...)` in `inventoryRouter.batch.quarantine`.
- batch disposal: on-hand disposal decrement now routes through `disposeBatch(...)` in `inventoryRouter.batch.dispose`.
- transfer receive: source decrement + destination increment movement pair now routes through `transferStock(...)` in `inventoryRouter.transfer.receive`.

## Flows not migrated / deferred
- `transfer.initiate` reservation (`qtyReserved`) is not a stock-on-hand decrement path; preserved as-is.
- `releaseQuarantine` still uses legacy `writeMovement` (`audit_correction`) because it is a quarantine reversal path not included in pass-2 scope.
- `batch.create` and stock-audit correction paths remain legacy and are deferred to a dedicated pass.

## No-negative-stock coverage
- purchase return, quarantine, disposal on-hand decrement, and transfer source decrement now enforce no-negative via stock invariant service.

## FEFO status
- FEFO-compatible batch-level behavior remains unchanged in this pass.

## Remaining direct stock mutation risks
- Legacy direct stock movement writer remains in inventory router for non-pass-2 paths (`batch.create`, `releaseQuarantine`, `audit.complete`).
- Legacy batch quantity synchronizations between `batch_ledger`, `batches`, and `store_skus` remain and should be unified in a later pass.

## Migrations
- No migrations added (existing schema was sufficient).

## Next recommended PR
- stock-invariant pass 3: centralize release-quarantine and stock-audit correction movement writes; optionally split service APIs for on-hand vs quarantined bucket mutations and remove remaining `writeMovement` router helper usage.
