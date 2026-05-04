# BARCODE PRODUCTION UX STATUS

## Current barcode schema/tables
- barcode_aliases, label_print_jobs, product_barcodes, batches/batch_ledger, store_skus are present in schema/migrations.

## Current barcode service behavior
- Deterministic normalization and internal barcode generation.
- Sale/return/audit scan resolution returns product+batch candidate rows only (lookup-only).
- Label queue supports queued/reprint/printed/failed states.

## Current scan routes
- `sales.scanBarcodeForSale`
- `sales.scanBarcodeForReturn`
- `inventory.audit.scanBarcodeForAudit`
- `purchase.ensureScannerReadyForBatch`
- `purchase.listLabelQueue`
- `purchase.reprintLabel`

## Current label queue behavior
- Queue job creation via purchase scanner readiness.
- Reprint resets job to queued.
- Printed/failed status set explicitly.

## Current frontend scan support
- Shared `BarcodeScannerInput` component added for keyboard wedge/manual input and explicit scan states.
- Shared `BarcodeLabelPreview` component added for HTML/browser print fallback and reprint trigger.

## Gaps fixed in this PR
- Shared scanner UX component created.
- Shared label preview/print fallback component created.
- Route and non-mutation guard tests added.
- Documentation trail added for production barcode UX readiness.

## Remaining gaps
- Full screen-level POS/purchase/return/audit integration to be wired in page containers where applicable.
- Vendor printer/scanner SDK integrations intentionally deferred.
- Provider contract matrix work intentionally deferred.

## Validation results
- See command run log in PR checks and local run output.

## Next recommended prompt
`feat/provider-contract-matrix-placeholder-elimination`
