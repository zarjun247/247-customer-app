# OCR Invoice Exception Workflow Status

## Current OCR flow inspected
- `ocrIngestionRouter` currently accepts OCR purchase bill uploads, parses mock/LLM or CSV rows, stores headers/lines, creates OCR review tasks, can generate a purchase draft, approve/reject the draft, and hand off to a purchase invoice draft.
- `ocrPurchaseInwarding` contains OCR job creation, supplier/product matching helpers, draft helpers, review helpers, and a payable handoff assertion that expects purchase invoices to be committed by the purchase module.
- The existing purchase commit path is `purchaseRouter.commitInvoice`; it creates/updates batch ledger rows and stock movements via `increaseStockForPurchaseCommit` rather than direct OCR stock mutation.
- Product normalization support exists in `server/services/productNormalization.ts`; OCR matching now normalizes candidate tokens before fuzzy matching. Supplier SKU mapping exists as `productSupplierMappings`, but it has no confidence column, so OCR stores a nullable mapped supplier SKU mapping id and treats unmapped/low-confidence supplier SKU input as a review exception.

## Schema fields added/confirmed
Migration `drizzle/0041_ocr_invoice_exceptions.sql` adds backward-compatible nullable/defaulted columns to preserve OCR evidence and human review state:
- `ocr_extracted_lines`: `rawLineText`, `extractedProductName`, `extractedBatchNo`, `extractedExpiry`, `extractedQty`, `extractedMRP`, `extractedCost`, `mappedProductId`, `mappedSupplierSkuId`, `exceptionReason`, `approvalStatus`, `approvedBy`, `approvedAt`, `approvalDecision`, and `correctionNotes`.
- `purchase_drafts`: `approvalDecision` and `correctionNotes`.
- `purchase_draft_lines`: the same raw/extracted/mapped fields plus `confidence`, `exceptionReason`, `approvalStatus`, `approvedBy`, `approvedAt`, `approvalDecision`, and `correctionNotes`; line status now supports `held`.
- Backfill copies existing OCR line values into the new raw/extracted/mapped columns where possible.

## Exception reasons
Supported exception reasons are:
- `low_confidence`
- `ambiguous_product`
- `missing_batch`
- `missing_expiry`
- `missing_qty`
- `missing_mrp`
- `missing_cost`
- `missing_hsn_or_gst`
- `missing_schedule_for_regulated`
- `supplier_sku_unmapped`

Low-confidence, ambiguous, supplier-SKU-unmapped, and required-field failures are routed to held/pending human review and are not selected for automatic handoff.

## Approval lifecycle
- OCR processing preserves line evidence and classifies exceptions.
- Clean lines may be matched, but their `approvalStatus` remains `pending`; the system does not treat OCR confidence as human approval.
- Review actions can approve, hold, reject, or reassign a line. Approval records `approvedBy`, `approvedAt`, `approvalDecision`, and optional correction notes.
- Draft approval is blocked unless every draft line is `approved`, has `approvalStatus='approved'`, and has no exception reason.
- Rejected and held states are retained for exception queue workflows.

## Product/supplier mapping behavior
- OCR matching uses normalized product name tokens and existing product records/candidates.
- Multiple candidates are classified as `ambiguous_product`; the system does not auto-merge or auto-create product masters.
- Supplier SKU mapping is used only where an existing mapping exists; otherwise OCR marks `supplier_sku_unmapped` for review.
- Missing HSN/GST is blocking for OCR inwarding handoff; regulated schedule gaps are represented by `missing_schedule_for_regulated` where current validation supplies that requirement signal.

## Stock commit safety
- OCR does not call `increaseStockForPurchaseCommit`, `applyStockMovement`, insert stock movements, update batch ledger, or sync store SKU aggregates directly.
- Approved OCR drafts hand off by creating a draft purchase invoice and purchase lines only after human approval.
- Actual stock mutation remains in `purchaseRouter.commitInvoice`, preserving the canonical stock invariant path from PR #51.
- The OCR `commitDraft` response returns `nextStep: "purchase.commitInvoice"` to make the safe handoff explicit.

## API/report shape
- `getExceptionReport` returns `rows`, `totals`, and `csvData`.
- Totals include counts by `exceptionReason` and `approvalStatus`.

## 2026-05-09 P0 OCR fake-success safety update

- Runtime purchase OCR no longer falls back to local parser output when provider OCR is not configured or not requested. Those paths now return explicit non-success `not_configured`, `provider_disabled`, or `manual_required` states.
- CSV input is now explicitly treated as `manual_import_under_review` with zero OCR confidence, not provider OCR success.
- OCR evidence URL validation blocks placeholder-style schemes, example-domain evidence, empty file keys, and production localhost evidence before ingestion rows are created.
- Legacy invoice ingestion stores the actual storage key returned by storage and moves provider/parse failures into manual review instead of creating empty successful parse output.
- No migration or schema change was added in this safety update.

## Remaining risks
- P0: None known in this change set; OCR stock mutation remains blocked before human approval and purchase commit.
- P1: The router still relies on the existing purchase invoice commit mutation being called after OCR handoff; a future internal service wrapper for purchase commit could make this handoff more atomic without duplicating stock logic.
- P2: Supplier SKU mapping confidence is inferred from deterministic mapping presence because the current mapping schema does not expose a confidence score.

## Migration/backfill notes
- Migration number used: `0041_ocr_invoice_exceptions.sql`.
- The migration is additive/defaulted and backfills new OCR preservation columns from existing OCR columns.
- No reserved migrations for prescription vault, refund ledger, or supplier ageing were touched.

## Validation results
- `pnpm install` completed successfully (lockfile already up to date; dependency build scripts remain governed by pnpm approve-builds).
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed: 55 test files, 218 tests.
- `pnpm run build` passed with existing Vite warnings for missing optional analytics placeholders and large bundle size.

## Files changed
- `drizzle/0041_ocr_invoice_exceptions.sql`
- `drizzle/schema.ts`
- `server/routers/ocrIngestionRouter.ts`
- `server/services/ocrPurchaseInwarding.ts`
- `server/ocr-exception-workflow.test.ts`
- `OCR_EXCEPTION_WORKFLOW_STATUS.md`
