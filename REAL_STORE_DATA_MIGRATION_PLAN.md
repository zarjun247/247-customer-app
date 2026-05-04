# REAL_STORE_DATA_MIGRATION_PLAN (Salsette + future stores)

## 1) Import sources
- Inventory export
- Supplier master
- Product/medicine master
- Batch/expiry/MRP data
- Barcode data
- Opening stock count sheet
- Customer records (if imported)
- Supplier outstanding balances
- Optional historical sales (read-only)

## 2) Import sequence
1. Create/verify store.
2. Import suppliers.
3. Import product-master candidates.
4. Normalize + dedupe review queue.
5. Import supplier SKU mapping candidates.
6. Import batches.
7. Perform physical opening stock audit.
8. Apply opening stock through `stockInvariant` only.
9. Import barcodes/labels linked to product+batch.
10. Reconcile supplier outstanding.
11. Optionally import historical sales as read-only history.

## 3) Safety rules
- No stock import bypasses `stockInvariant`.
- No opening stock double-count.
- No silent product merge.
- Unknown schedule products default to `review_required` (never OTC by default).
- Imported rows tagged with import batch ID.
- Mandatory dry-run before commit.
- Rollback path required per batch.

## 4) Migration statuses
- `dry_run`
- `validated`
- `committed`
- `rolled_back`
- `failed`

## 5) Reconciliation checklist
- Physical stock vs system stock.
- Batch expiry sampling.
- MRP sampling.
- Supplier payable reconciliation.
- HSN/GST sample checks.
- Barcode scan sampling.
