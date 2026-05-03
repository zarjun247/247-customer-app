# BARCODE SCAN TRUTH STATUS (Production)

Scanner model is keyboard-wedge first (USB/Bluetooth scanner enters barcode text into focused input).

## Routes wired
- `sales.scanBarcodeForSale` lookup only; returns barcode resolution candidates and confirms stock mutation remains at `confirmSale` through stockInvariant.
- `sales.scanBarcodeForReturn` lookup only; return commit path remains stockInvariant-owned.
- `purchase.ensureScannerReadyForBatch` creates internal barcode alias + queues label print job.
- `purchase.listLabelQueue` / `purchase.reprintLabel` expose print queue ops.
- `inventory.audit.scanBarcodeForAudit` returns count candidate only; final correction remains `applyStockAuditCorrection`.

## Behavior
- Barcode aliases enforce uniqueness via service check.
- Label payload contains operational-only fields (product/batch/expiry/MRP/internal barcode/store) and excludes patient/customer data.
- Missing printer/provider does not fake success; print job lifecycle remains queued/failed and can be retried.
- OCR inwarding is scanner-ready only after human-reviewed commit path invokes scanner-ready helper.

## App availability sync
Customer app catalog availability continues to use canonical `store_skus.stockQty - softLockedQty` path (no shadow inventory).

## Remaining gaps
- UI polish for dedicated scan widgets can be incremental; backend endpoints are now present for production integration.
- Vendor printer/scanner SDK integrations remain intentionally out of scope.
