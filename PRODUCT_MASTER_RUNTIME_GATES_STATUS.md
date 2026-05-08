# Product Master Runtime Gates Status

## Conflicts resolved

- Started from the current latest-main workspace head and created `fix/resolve-product-master-runtime-gates`.
- Preserved latest-main logic for H1 statutory register handling, prescription clearance, OCR exception workflow approval lifecycle, barcode UX service flow, payment fail-closed behavior, immutable invoice snapshots, invoice numbering/idempotency, stock reservations, accounting journal batches, credit notes, and commercial lifecycle harnesses.
- Replayed only product-master runtime gate behavior into the focused product-master files; no broad docs, migrations, payment/provider/connectors, accounting, invoice numbering/idempotency, or stock/reservation code was edited.

## Gates added

- Centralized product master validation helpers now normalize persisted product metadata, fail closed on unknown schedule, enforce HSN/GST on statutory sale paths, require Rx flags for regulated schedules, validate purchase line batch/expiry/MRP/cost fields, validate barcode label master completeness, and emit duplicate candidates as review-only metadata.
- POS `addLine` resolves persisted product metadata instead of trusting client schedule/Rx flags, blocks incomplete statutory metadata, and never defaults blank schedules to OTC.
- POS `confirmSale` revalidates persisted product metadata before stock mutation while keeping latest-main H1/pharmacist clearance checks intact.
- Purchase `addLine` validates product existence plus batch, expiry, MRP, cost, HSN/GST, and regulated schedule metadata before writing the draft line.
- Barcode label payloads return `incomplete_master` when identity, batch, expiry, MRP, or barcode/canonical mapping fields are incomplete.
- OCR line approval/reassignment and draft commit paths call product/purchase validation before an approved OCR draft can become a purchase invoice.
- Product duplicate detection returns `canonicalKey`, `candidateProductIds`, `reason`, and `reviewStatus` and remains review-only with no auto-merge behavior.

## Fail-closed behavior

- Missing or unknown schedules on regulated/statutory sale paths are blocked.
- Regulated schedules without `requiresPrescription` are blocked.
- Missing HSN/GST on statutory sale paths are blocked.
- Purchase and OCR handoff paths block incomplete product/batch/cost fields before commit.

## Duplicate/review behavior

- Duplicate detection produces review candidates only.
- No canonical product auto-merge is performed.
- The master-data duplicate endpoint reports `behavior: review_only` and `autoMerge: false`.

## Remaining risks

- P0: None identified in the focused runtime gates.
- P1: Product rows that are legacy-defaulted to `OTC` in the database cannot be distinguished from intentionally OTC rows without a future schema-level provenance field.
- P2: Barcode label validation currently reports incomplete master in the payload; downstream printers must continue to respect the returned `status`.

## Files changed

- `PRODUCT_MASTER_RUNTIME_GATES_STATUS.md`
- `server/product-master-runtime-gates.guard.test.ts`
- `server/routers/masterDataPart3Router.ts`
- `server/routers/ocrIngestionRouter.ts`
- `server/routers/purchaseRouter.ts`
- `server/routers/salesRouter.ts`
- `server/services/barcodeService.ts`
- `server/services/productMasterValidation.ts`
- `server/services/productNormalization.ts`

## Validation results

- `pnpm install`: passed; lockfile already up to date.
- `pnpm run check`: failed on pre-existing `server/connectors.ts` fetch header typing errors; payment/provider/connectors code was intentionally not touched.
- `pnpm test -- --runInBand`: passed, including `server/product-master-runtime-gates.guard.test.ts`.
- `pnpm run build`: passed with existing Vite environment/chunk-size warnings.
- `git diff --check`: passed.
