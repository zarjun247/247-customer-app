# STOCK_INVARIANT_STATUS

## Schema/tables inspected
- product variants/SKUs: `product_variants`, `store_skus`
- batches/current stock: `batch_ledger`, `batches`
- stock movement: `stock_movements`
- purchase/sale/returns/adjustments: `purchase_invoices`, `purchase_invoice_lines`, `purchase_returns`, `purchase_return_lines`, `sales`, `sale_lines`, `sale_returns`, `sale_return_lines`, `stock_adjustments`

## Service functions created
- `applyStockMovement`
- `increaseStockForPurchaseCommit`
- `decreaseStockForSaleConfirmation`
- `reverseStockForSaleReturn`
- `decreaseStockForPurchaseReturn` (helper exported)
- `adjustStock`
- `assertNoNegativeStock`
- `getCurrentBatchQty`

## Flows migrated in this PR
- purchase commit
- sale confirmation
- stock adjustment approve (corrected: duplicate legacy movement removed; single movement now via `stockInvariant.adjustStock`)
- sale return approval (resaleable branch)

## Correction completed
- Removed duplicate legacy `writeMovement(... movementType: "stock_adjustment")` in `inventoryRouter.adjustment.approve` so approval now writes exactly one movement via `adjustStock(...)`.

## Remaining mutation risks
- purchase return commit path still has direct batch updates and should be migrated in next PR.
- quarantine/disposal paths in inventory router still use local mutation helper.

## FEFO status
- Existing FEFO-compatible batch-level flow preserved; no allocator redesign introduced.

## No-negative-stock behavior
- Central service rejects any movement resulting in `qtyAfter < 0`.

## Validation
- Run `pnpm run check`, `pnpm test -- --runInBand`, `pnpm run build`.

## Next recommended PR
- stock-invariant pass 2: migrate purchase return + quarantine/disposal + transfer stock writes fully into stockInvariant service and add transaction wrappers for multi-line workflows.
