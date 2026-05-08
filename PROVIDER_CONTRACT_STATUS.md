# Provider Contract Status

## Files inspected

- `server/_core/env.ts` — production fail-hard environment checks for core app, storage, payment, WhatsApp webhook posture, and OTP posture.
- `server/connectors.ts` — SMS/WhatsApp, Razorpay payment, label printer, and ERP connectors/statuses.
- `server/services/paymentGateway.ts` and `server/routers/paymentRouter.ts` — Razorpay verification result boundaries and payment router handling.
- `server/routers/whatsappRouter.ts`, `server/services/whatsappBridge.ts`, and `server/whatsapp-notification-safety.guard.test.ts` — WhatsApp safety/webhook guards.
- `server/routers/ocrIngestionRouter.ts`, `server/services/ocrPurchaseInwarding.ts`, and `server/ocr-purchase.guard.test.ts` — OCR draft/review and no direct stock commit guards.
- `server/_core/storageAccess.ts`, `server/_core/storageProxy.ts`, `server/storage.ts`, and `server/storage-access.guard.test.ts` — sensitive storage access and upload/proxy posture.
- `server/services/tallyExport.ts`, `server/tally-export-proof.guard.test.ts`, and `server/accounting-tally-production.guard.test.ts` — Tally export proof vs sync/import distinction.
- `server/connectors.failclosed.test.ts`, `server/payment-gateway.guard.test.ts`, and `server/auth-otp.guard.test.ts` — existing provider fail-closed/static posture tests.
- Repository search for email, push, maps/geocoding/delivery-distance provider code; no dedicated server connector was found for email or push, and maps appears as config/env exposure rather than a server-side adapter.

## Contracts added

- `server/config/providerContracts.ts` adds explicit contracts for:
  - Razorpay/payment
  - WhatsApp
  - OTP
  - SMS
  - email
  - push notification
  - OCR
  - object storage
  - maps/geocoding/delivery distance
  - Tally/ERP/export
  - printer/label printing
- Every contract declares required/optional environment variables, production/demo behavior flags, failure mode, allowed success states, unavailable states, audit/retry/dead-letter requirements, manual intervention events, ops dashboard statuses, and notes.

## Guard/service helpers added

- `server/services/providerContract.ts` adds:
  - `getProviderContract(name)`
  - `getAllProviderContracts()`
  - `evaluateProviderStatus(env, mode)`
  - `assertProviderNotFakeSuccessful(providerResult)`
- The status helper returns configured/unconfigured/disabled/demo/preview/failed/unknown-style status without returning secret values.
- `configured` means env variables are present only; it does not claim verified production readiness.

## Tests added

- `server/provider-contract.guard.test.ts` proves:
  - Every known provider has a contract entry.
  - Production-required providers list required env vars and safe failure modes.
  - Unconfigured production payment/WhatsApp/SMS/ERP cannot evaluate as success.
  - Demo/test statuses are not labelled `sent`, `printed`, `synced`, or `verified`.
  - Fake success result shapes are rejected.
  - Printer contract supports preview/manual fallback rather than fake printing.
  - Tally/ERP contract distinguishes generated/exported artifacts from synced state.
  - Payment success requires `verified` state.
  - Storage sensitive file access is audit-required and fail-closed.
  - OCR is manual-review only before purchase/stock mutation.
  - Retry/dead-letter/manual-intervention status expectations are present for operational providers.

## Behavior confirmed

- Missing production Razorpay credentials must not produce `verified` payment success.
- Missing production WhatsApp/SMS credentials must not produce `sent` message success.
- Missing printer configuration must not produce `printed`; preview/manual fallback remains a non-print success boundary.
- Missing ERP/Tally configuration must not produce `synced`; generated export artifacts remain generated-not-synced.
- OCR output remains assistive/pending review and cannot directly mutate stock from the OCR router.
- Sensitive storage file access remains authenticated/proxied and is modelled as audit-required/fail-closed.
- Demo/test provider outputs are visible as `demo_skipped`/`preview_only`, not real provider success.

## Remaining gaps

- Durable retry queues and dead-letter queues are documented as requirements but are not implemented in this PR.
- Email and push notification contracts are governance placeholders because no dedicated runtime connectors were found in inspected server files.
- Maps/geocoding/delivery distance contract is governance-only until a dedicated server adapter is introduced.
- Provider env presence is intentionally not treated as production readiness verification.
- Webhook/provider certification, live credentials, DLT/template approval, printer fleet certification, OCR vendor certification, and ERP import proof remain operational verification tasks.

## Validation results

- `pnpm install` completed successfully; pnpm reported existing ignored build-script warnings for `@tailwindcss/oxide` and `esbuild`.
- `pnpm run check` passed after a type-only ERP header narrowing in `server/connectors.ts`; connector behavior was not changed.
- `pnpm test -- --runInBand` passed: 70 files, 360 tests.
- `pnpm run build` passed with existing Vite warnings for undefined analytics placeholders and large chunk size.
- `git diff --check` passed.

## Files changed

- `server/config/providerContracts.ts`
- `server/services/providerContract.ts`
- `server/provider-contract.guard.test.ts`
- `server/connectors.ts` (type-only ERP header narrowing so validation compiles; no connector behavior change)
- `PROVIDER_CONTRACT_MATRIX.md`
- `PROVIDER_CONTRACT_STATUS.md`

## Migrations/dependencies

- Migrations added: None.
- Dependencies added: None.
