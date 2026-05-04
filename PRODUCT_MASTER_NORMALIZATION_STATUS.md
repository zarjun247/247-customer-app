# PRODUCT_MASTER_NORMALIZATION_STATUS

## Tables/areas inspected
- drizzle/schema.ts: products, product_barcodes, barcode_aliases, batch_ledger, store_skus, suppliers, product_supplier_mappings, purchase lines.
- Routers/services: masterDataRouter, masterDataPart3Router, customerMedicineRouter, purchaseRouter, ocrIngestionRouter, barcodeService, complianceGate, stockInvariant.

## Current identity model
- Canonical identity now supported by deterministic `buildCanonicalProductKey` over generic+strength+form+pack+manufacturer.
- Original source names are retained; no automatic merge behavior.

## Risk and status
- Duplicate risk: detected via `detectPotentialDuplicateProducts` (candidate-only, no merge).
- Brand/generic/strength/form/pack: normalized helper functions now available.
- HSN/GST: completeness validators detect missing/invalid statutory fields.
- Schedule/Rx/H/H1/X: unknown schedule fail-closed in regulated-sensitive validation path.
- Supplier SKU mapping: confidence + ambiguity-aware mapping helpers; uniqueness guard.
- Barcode alias governance: uniqueness and normalization guards validated; non-mutating scan behavior retained in barcode service.
- Substitution governance: pharmacist approval enforced; controlled substitutions fail-closed.

## Fixed in this PR
- Added product normalization service.
- Added product master validation service with exception row output shape `{ rows, totals, csvData }`.
- Added supplier SKU mapping governance helper service.
- Added substitution governance helper service.
- Added guard tests and migration-plan documentation.

## Remaining gaps
- Full DB-backed workflow integration in all runtime routes is partial and should be expanded in next prompt.
- Import-batch durable tables/service not added in this PR; migration plan documented and fail-closed expectations captured.

## Validation summary
- check/test/build executed locally in this branch.

## Next recommended prompt
`feat/barcode-production-ux`
