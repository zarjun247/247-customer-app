# Product Master Runtime Gates Status

## Branch
- `feat/p20-14-product-master-runtime-gates`

## Runtime flows inspected
- Product normalization and duplicate helpers: `server/services/productNormalization.ts`.
- Runtime product master validation helpers: `server/services/productMasterValidation.ts`.
- Supplier SKU mapping helper behavior: `server/services/supplierSkuMapping.ts`.
- Substitution governance fail-closed behavior: `server/services/substitutionGovernance.ts`.
- Product create/edit routes: `server/routers/masterDataPart3Router.ts`.
- Purchase add-line and invoice commit boundaries: `server/routers/purchaseRouter.ts`.
- OCR purchase draft approval/commit boundaries: `server/routers/ocrIngestionRouter.ts` and `server/services/ocrPurchaseInwarding.ts`.
- Barcode label backend/service path: `server/services/barcodeService.ts` and purchase scanner readiness route.
- POS add-line and sale confirmation paths: `server/routers/salesRouter.ts`.

## Gates added
- Centralized runtime gate helpers now return explicit `ok` or `incomplete_master` status with machine-readable errors, warnings, canonical key, duplicate candidates, and review-required flags.
- Product create/edit now validates statutory completeness before regulated/statutory products are persisted; OTC products retain lighter completeness handling while HSN/GST remain statutory warnings/errors as appropriate.
- Purchase add-line validates product existence, HSN/GST, batch number, expiry, MRP, cost, and regulated schedule before a draft line is inserted.
- Purchase commit revalidates each line immediately before stock movement/inwarding side effects.
- OCR draft approval and OCR draft commit revalidate each non-rejected draft line before converting the draft into a purchase invoice/line.
- Barcode label creation validates product canonical identity, batch, expiry, MRP, internal barcode, and product statutory metadata; incomplete inputs return `incomplete_master` instead of queuing misleading labels.
- POS add-line resolves persisted product metadata rather than trusting optional client schedule/HSN/GST values, fails closed for incomplete regulated/statutory metadata, and writes effective schedule/HSN/GST to sale lines.
- Sale confirmation revalidates stored sale lines against current product master before availability checks, invoice numbering, payment creation, or stock decrement.

## Fail-closed behavior
- Regulated sale context fails if schedule is blank/unknown; there is no silent default-to-OTC behavior for sale confirmation.
- Missing HSN or GST blocks statutory sale/invoice contexts.
- Missing purchase batch, expiry, MRP, or cost blocks purchase add-line and commit.
- OCR draft approval/commit blocks ambiguous or incomplete product data instead of manufacturing defaults.
- Barcode label jobs are not queued when master data is incomplete.

## Exception/review behavior
- Legacy/OTC products are not globally blocked outside route contexts that require statutory completeness.
- Runtime validation returns warnings and duplicate candidate metadata so admin/review flows can show exceptions without automatic mutation.
- OCR rejected lines are skipped at approval/commit; all active lines must pass product master validation.

## Duplicate handling
- Duplicate detection now reports candidate/review information: `canonicalKey`, `candidateProductIds`, `score`, `reason`, and `reviewStatus`.
- No autonomous merge or product substitution is performed.

## Supplier SKU mapping behavior
- Existing supplier SKU mapping helpers remain the source of truth.
- Existing mapping helpers expose candidates and ambiguity/low-confidence state; this branch does not create a duplicate supplier mapping system.
- OCR/purchase runtime gates block low-confidence/incomplete product data at draft approval/commit boundaries instead of auto-creating or auto-mapping unsafe products.

## Files changed
- `server/services/productNormalization.ts`
- `server/services/productMasterValidation.ts`
- `server/services/barcodeService.ts`
- `server/routers/masterDataPart3Router.ts`
- `server/routers/purchaseRouter.ts`
- `server/routers/salesRouter.ts`
- `server/routers/ocrIngestionRouter.ts`
- `server/product-master-runtime-gates.guard.test.ts`
- `PRODUCT_MASTER_RUNTIME_GATES_STATUS.md`

## Tests added
- `server/product-master-runtime-gates.guard.test.ts`
  - regulated product with missing schedule is blocked in sale/POS context.
  - missing HSN/GST blocks statutory sale path.
  - purchase add-line rejects missing batch/expiry/MRP/cost.
  - barcode label creation returns `incomplete_master` for missing master data.
  - duplicate product detection produces candidates and does not auto-merge.
  - OCR approval/commit paths are wired to product validation.

## Validation results
- `pnpm install` — passed.
- `pnpm run check` — passed after fixing TypeScript issues identified by the first check run.
- `pnpm test -- --runInBand` — passed, 55 files / 213 tests.
- `pnpm run build` — passed with existing Vite environment/chunk-size warnings.

## Migrations
- None.

## Remaining risks
- P0: None identified in this branch.
- P1: Product master validation is only as accurate as existing product metadata and current schema defaults; legacy data cleanup/review still needs operational follow-through.
- P1: OCR exception schema/workflow is intentionally not implemented here; this branch blocks unsafe OCR approval/commit rather than routing into a new exception table.
- P2: Supplier SKU low-confidence review remains constrained to existing helper/report behavior; richer admin UI review is outside this branch.
- P2: OTC lighter validation may still surface warnings that require admin UX display in a separate cockpit/admin route branch.

## Safe-to-merge assessment
- Safe to merge from a product-master runtime-gates perspective.
- No migrations were added.
- Reserved/parallel work files and migrations were not modified.
