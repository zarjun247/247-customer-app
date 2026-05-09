# OCR Production Safety Status

## Audit metadata

| Item | Value |
| --- | --- |
| Branch | `fix/p0-ocr-fake-ingestion-placeholder-storage` |
| Latest main SHA inspected | `200fafcc20451cc43e8d6272588ec7e26e12d9c8` |
| Remote refresh | Attempted `git fetch origin main`, `git checkout -B main origin/main`, and `git pull --rebase origin main`; GitHub HTTPS fetch failed in this container because credentials were unavailable. Work proceeded from the latest local main-equivalent SHA above. |
| Migrations added | No |
| Schema changed | No |

## Files inspected

- `server/routers/ocrIngestionRouter.ts`
- `server/routers/ingestionRouter.ts`
- `server/routers/purchaseRouter.ts`
- `server/services/ocrPurchaseInwarding.ts`
- `server/ingestion.ts`
- `server/storage.ts`
- `server/_core/llm.ts`
- `server/_core/storageAccess.ts`
- `server/connectors.ts`
- `client/src/pages/OcrIngestion.tsx`
- `client/src/pages/PurchaseEntry.tsx`
- `client/src/pages/ocr/AdminOcr.tsx`
- `client/src/pages/purchase/AdminPurchaseInvoices.tsx`
- `server/ocr-exception-workflow.test.ts`
- `server/ocr-purchase.guard.test.ts`
- `server/placeholder-production.guard.test.ts`
- `server/ci-governance-guards.guard.test.ts`
- `scripts/ci-governance-guards.mjs`
- Existing OCR/status/audit docs present in repo.

## Fake or misleading paths found

- `ocrIngestionRouter.processJob` used a local parser fallback when `useLlmOcr` was false, including hard-coded pharmacy distributor/header/line data that could make an OCR job look parsed without provider proof.
- CSV text entered through the OCR process path could be mixed into OCR output without a clear manual-import success boundary.
- OCR purchase upload accepted caller-supplied evidence URLs without blocking placeholder-style or example-domain references.
- The legacy invoice ingestion pipeline returned an empty parsed item list on provider parse failure and moved the ingestion back to `pending_ocr`, which was ambiguous rather than an explicit manual-review failure.
- `parseSupplierBill` defaulted the provider label to a local parser name instead of an explicit unavailable/manual-required state.

## Fixes made

- Added central OCR production-safety helpers for provider readiness, evidence URL validation, real file-key enforcement, and explicit manual CSV import parsing.
- Removed the purchase OCR local parser fallback from runtime OCR processing; provider OCR now requires real evidence, provider readiness, and explicit provider execution.
- Provider-not-configured, provider-disabled, and provider-not-requested paths now return non-success `not_configured`, `provider_disabled`, or `manual_required` responses and mark the job failed instead of parsed.
- Manual CSV import is parsed only for `sourceType: "csv_import"`, returns `manual_import_under_review`, has zero OCR confidence, and is not returned as OCR success.
- Storage/evidence validation rejects empty file keys, placeholder-style schemes, example-domain evidence, and localhost evidence in production.
- Legacy invoice ingestion now persists the actual stored key returned by storage, creates a failed OCR job plus `under_review` ingestion when the OCR provider is unavailable, and marks provider/parse failures as manual-review required instead of retry-green.
- OCR parse failures now throw `manual_required` errors rather than creating empty successful line-item output.
- Governance scanning was strengthened to catch OCR placeholder evidence URLs and provider-unconfigured parse/upload success if reintroduced.

## Production behavior

- Production OCR provider execution is disabled unless `OCR_PROVIDER_ENABLED` permits it and an OCR/Forge credential is present.
- Unconfigured or disabled OCR returns explicit non-success statuses and requires manual review.
- Runtime OCR does not synthesize supplier headers, invoice numbers, or line items when provider OCR is unavailable or fails.
- OCR drafts still cannot mutate stock directly; handoff remains human-approved draft creation followed by the existing purchase commit path.

## Development/test behavior

- No new runtime stubs were introduced.
- Local fixture allowance is explicit and limited to non-production environments through the OCR safety helper; no runtime caller uses it to claim OCR success.
- Test fixtures may still contain blocked strings to prove scanners catch regressions.

## Manual-review behavior

- Provider unavailable, provider disabled, storage/evidence invalid, provider not requested, empty provider output, and parse failures all resolve to explicit manual-required states.
- CSV/manual import is labelled as manual import and enters review; it does not masquerade as provider OCR output.

## Storage failure behavior

- `storagePut` failures abort upload before ingestion/OCR records are created.
- Successful storage uses the actual returned storage key for invoice ingestion evidence.
- Purchase OCR upload rejects fake/placeholder evidence references before creating ingestion rows.

## Provider-not-configured behavior

- New provider readiness returns `not_configured` with `ok: false` and a manual-review reason when production OCR credentials are missing.
- Provider-unconfigured paths do not return parsed/successful OCR results.

## Stock mutation safety

- No stock mutation logic was modified.
- OCR router/service guard tests continue to verify no direct stock mutation calls are present in OCR runtime paths.
- OCR handoff still creates a draft purchase invoice only after review; actual stock mutation remains in the existing purchase commit flow.

## Tests added/updated

- Added `server/ocr-production-safety.test.ts` covering provider readiness, placeholder evidence blocking, manual import labelling, source-code guards, parse-failure behavior, and governance scanner regressions.
- Updated `scripts/ci-governance-guards.mjs` with OCR placeholder evidence and provider-unconfigured success detection.

## Validation results

- `pnpm test -- server/ocr-production-safety.test.ts --runInBand` passed and, due the project Vitest config, ran the full suite: 85 passed, 2 skipped; DB integration tests skipped because `TEST_DATABASE_URL` is not set.
- `pnpm run check` passed.
- Full requested validation is tracked in the PR body/final handoff; DB proof must not be claimed unless `TEST_DATABASE_URL` is provided and DB smoke tests run.

## Remaining risks

- Remote GitHub `main` could not be authenticated from this container; latest inspected SHA is the local main-equivalent SHA listed above.
- No live OCR provider call was executed in this container.
- DB-backed smoke/integration proof is not claimed without `TEST_DATABASE_URL`.
