# PRODUCT_MASTER_NORMALIZATION_STATUS

## Tables inspected
products, product_variants, store_skus, batch_ledger/batches, product_barcodes, barcode_aliases, suppliers, product_supplier_mappings.

## Current identity model
Canonical identity now uses deterministic key: generic/name + strength + form + pack + manufacturer.

## Risks and posture
- Duplicate product risk: detected by canonical key + score-based candidate list.
- HSN/GST completeness: flagged via validation helpers.
- Schedule/Rx/H/H1/X: unknown schedule fails closed for regulated-sensitive flow.
- Supplier SKU mapping: ambiguous mappings remain draft until pharmacist/admin approval.
- Barcode alias: uniqueness guard and active-link governance required.
- Substitution: pharmacist approval mandatory; H1/X fail closed.

## Fixed in this prompt
- Added product normalization helpers and duplicate detection.
- Added product master completeness validation and exception row output.
- Added supplier SKU mapping governance helpers.
- Added substitution governance helpers.
- Added static/service guard tests.

## Remaining gaps
- Full DB-backed workflow wiring in every route still partial and should be completed incrementally.
- Barcode alias audit trail persistence wiring can be extended in next prompts.

## Validation
See test/build results in PR summary.

## Next recommended prompt
`feat/barcode-production-ux`
