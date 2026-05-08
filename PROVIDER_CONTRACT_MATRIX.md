# Provider Contract Matrix

This matrix is governance/config/test documentation only. It does not rewrite connector implementations, payment lifecycle logic, WhatsApp business logic, OCR inwarding, stock/reservation/commercial lifecycle logic, or product-master runtime gate files.

Status words are intentionally conservative:

- `configured` means required environment variables are present only. It does **not** mean production readiness has been verified.
- `provider_unconfigured`, `disabled`, `demo_skipped`, `preview_only`, `failed`, and `manual_only` are non-success states.
- Demo/test output must never be labelled as real `sent`, `printed`, `synced`, or `verified` success.
- Generated/exported artifacts are not equivalent to provider sync/import success.

| Provider | Env vars | Production behavior | Demo behavior | Allowed success state | Unconfigured behavior | Retry/dead-letter requirement | Audit requirement | Remaining implementation gap |
|---|---|---|---|---|---|---|---|---|
| Razorpay/payment | Required: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`. Optional: `RAZORPAY_WEBHOOK_SECRET`, `PAYMENT_PROVIDER_ENABLED`, `PAYMENT_WEBHOOK_ENABLED`. | Fail closed. Payment may be treated as paid only after real Razorpay signature/verification succeeds. Env presence means configured, not production-ready. | Explicit demo/test can be reported only as `demo_skipped`; never `verified`. | `verified` only. | `provider_unconfigured` / `demo_skipped` / `failed`; order/payment must not be marked paid/verified. | No automatic retry for signature verification; manual intervention for unconfigured provider, failed verification, or webhook posture issues. | Required. | End-to-end webhook production readiness remains separate from this matrix. |
| WhatsApp | Required: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_TOKEN`. Optional: `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_PROVIDER_ENABLED`. | Fail closed for sends when credentials are missing; regulated intents remain staff/pharmacist gated. | `demo_skipped`; never `sent`. | `sent`, `delivered` only after real provider response/webhook. | `provider_unconfigured` / `demo_skipped` / `failed`. | Retry send failures; dead-letter after max attempts; manual intervention for regulated or dead-lettered events. | Required. | Durable queue/dead-letter worker is not implemented in this PR. |
| OTP | Required: `OTP_PROVIDER_API_KEY`, `OTP_RATE_LIMIT_BACKEND`. Optional: `OTP_PROVIDER_ENABLED`. | Fail closed. Production requires provider credentials and explicit production-safe rate limiting. | Demo not allowed in production; test/dev codes must not surface in production. | `sent`, `verified` only after real provider/user verification. | `provider_unconfigured` / `disabled` / `failed`. | Retry transient sends; no dead-letter requirement by default; ops manual intervention if provider/rate-limiter posture is invalid. | Required. | Existing auth OTP path is mostly static-guarded here; no connector rewrite. |
| SMS | Required: `SMS_PROVIDER_API_KEY`. Optional: `SMS_SENDER_ID`, `SMS_PROVIDER_ENABLED`. | Fail closed for sends when credentials are missing. | `demo_skipped`; never `sent`. | `sent`, `delivered` only after real provider result/webhook if available. | `provider_unconfigured` / `demo_skipped` / `failed`. | Retry send failures; dead-letter after max attempts; fallback/manual notification after DLQ. | Required. | Durable queue/dead-letter worker is not implemented in this PR. |
| Email | Required: `EMAIL_PROVIDER_API_KEY`. Optional: `EMAIL_FROM`, `EMAIL_PROVIDER_ENABLED`, SMTP variables. | Disabled-safe until a real adapter is wired; must not claim sent when disabled/unconfigured. | `demo_skipped`; never `sent`. | `sent`, `delivered` only after real adapter/provider result. | `disabled` / `provider_unconfigured` / `demo_skipped` / `failed`. | Retry and dead-letter required for real adapter. | Required. | No dedicated email connector found in inspected files; future adapter must satisfy this contract. |
| Push notification | Required: `PUSH_PROVIDER_API_KEY`. Optional: `PUSH_PROVIDER_ENABLED`, FCM variables. | Disabled-safe until a real adapter is wired; must not claim delivery when disabled/unconfigured. | `demo_skipped`; never `sent`. | `sent`, `delivered` only after real provider result. | `disabled` / `provider_unconfigured` / `demo_skipped` / `failed`. | Retry and dead-letter required for real adapter. | Required. | No dedicated push connector found in inspected files; future adapter must satisfy this contract. |
| OCR | Required: `OCR_PROVIDER_API_KEY`. Optional: `OCR_PROVIDER_ENABLED`, `OCR_PROVIDER_NAME`. | Manual-only fail-safe. OCR output is assistive and may at most become `ocr_complete_pending_review`; stock/purchase commit remains human-reviewed. | Demo not allowed for production mutation paths. | `ocr_complete_pending_review` only. | `disabled` / `provider_unconfigured` / `failed` / `pending_manual_review` / `manual_only`. | Retry provider failures; dead-letter after max attempts; manual review/intervention for failed or low-confidence drafts. | Required. | Provider-specific OCR adapter/readiness is not certified here. |
| Object storage | Required: `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`. Optional: `STORAGE_PROVIDER_ENABLED`, S3 vars. | Fail closed. Sensitive file access requires authenticated proxy and must not expose files when storage is unconfigured. | Demo not allowed for sensitive file exposure. | `stored` only after real storage path succeeds. | `provider_unconfigured` / `disabled` / `failed`. | Retry upload/transient failures; dead-letter after max attempts; manual intervention for sensitive access denial. | Required. | Storage provider posture is env-gated; this PR does not add a new storage adapter. |
| Maps/geocoding/delivery distance | Required: `GOOGLE_MAPS_API_KEY`. Optional: `MAPS_PROVIDER_ENABLED`. | Manual-only safe fallback; no invented route/distance when provider is missing. | `demo_skipped`; never `distance_calculated`. | `distance_calculated` only after real provider calculation. | `disabled` / `provider_unconfigured` / `demo_skipped` / `failed` / `manual_only`. | Retry transient geocode/distance failures; manual intervention for overrides; no DLQ by default. | Not required by default. | No dedicated server-side maps adapter was found beyond env exposure; future adapter must satisfy this contract. |
| Tally/ERP/export | Required: `ERP_BASE_URL`, `ERP_API_KEY`. Optional: `ERP_COMPANY_ID`, `ERP_PROVIDER_ENABLED`. | Manual-only when unavailable. Generated Tally export files are allowed, but not `synced` without real ERP/provider confirmation. | `demo_skipped`; never `synced`. | `export_generated` for local artifact only; `synced` only after real ERP response. | `provider_unconfigured` / `demo_skipped` / `failed` / `export_generated_not_synced` / `manual_only`. | Retry sync pushes; dead-letter after max attempts; manual import/intervention for generated-not-synced exports. | Required. | XML/ODBC/import proof and durable sync DLQ remain future work. |
| Printer/label printing | Required: `PRINTER_HOST`. Optional: `PRINTER_PORT`, `PRINTER_PROVIDER_ENABLED`. | Preview-only safe fallback when unavailable; must not mark `printed` unless real print path succeeds. | `preview_only`/`demo_skipped`; never `printed`. | `printed` only after real printer path; `preview_generated` for ZPL/browser fallback. | `provider_unconfigured` / `demo_skipped` / `preview_only` / `not_printed` / `failed`. | Retry print jobs; dead-letter after max attempts; manual intervention/browser fallback when unavailable. | Required. | Durable printer queue/dead-letter worker remains outside this PR. |

## Ops dashboard status expectations

Provider-facing ops/health views should use only non-secret state values:

- `configured`
- `provider_unconfigured`
- `disabled`
- `demo_skipped`
- `preview_only`
- `failed`
- `unknown`
- `retry_scheduled`
- `dead_letter`
- `manual_intervention_required`

The status helper must never expose raw API keys, tokens, webhook secrets, SMTP passwords, or private keys.
