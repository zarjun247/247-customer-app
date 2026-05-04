# REAL_STORE_DATA_MIGRATION_PLAN (Salsette + future stores)

## Import sources
- Inventory export
- Supplier list
- Product master
- Batch/expiry/MRP
- Barcodes
- Opening stock count
- Customer records (optional)
- Supplier outstanding balances
- Historical sales (optional read-only)

## Import sequence
1. Verify/create store
2. Import suppliers
3. Import product candidates
4. Normalize + dedupe review
5. Import supplier SKU mappings
6. Import batches
7. Physical opening stock audit
8. Apply opening stock via stockInvariant only
9. Import barcode aliases/labels
10. Reconcile supplier outstanding
11. Optional historical sales as read-only

## Safety rules
- No stock writes bypassing stockInvariant
- No opening stock double-count
- No silent duplicate merges
- No regulated product defaulted OTC
- Unknown schedule => review_required
- Every record tagged by importBatchId
- Dry-run before commit
- Rollback required

## Migration statuses
`dry_run` | `validated` | `committed` | `rolled_back` | `failed`

## Reconciliation checklist
- Physical vs system stock
- Batch expiry samples
- MRP samples
- Supplier payable check
- HSN/GST samples
- Barcode scan samples
