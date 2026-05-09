# Provider Operation Lifecycle

This repository treats every external provider operation as an explicit state transition. Provider code must not silently no-op or mark an unconfigured provider as successful.

## Canonical statuses

`pending`, `queued`, `sent`, `synced`, `verified`, `printed`, `completed`, `failed`, `retrying`, `dead_letter`, `disabled`, `not_configured`, `manual_required`, and `cancelled` are the canonical provider operation attempt statuses.

Success statuses are limited to `sent`, `synced`, `verified`, `printed`, and `completed`; they require a real provider reference or deterministic local proof. Disabled or unconfigured providers must use `disabled` or `not_configured`, never a success status.

## Retry and dead-letter behavior

`classifyProviderError` separates retryable transient failures such as timeouts, 429, 502, and 503 from non-retryable conditions such as invalid signatures, unauthorized responses, disabled providers, or missing configuration. `shouldRetryProviderOperation` allows retry only while the attempt count is below the maximum. Exhausted or non-retryable operations are explicit `failed`, `manual_required`, or `dead_letter` states.

## Production fail-closed rules

- Production demo/test proof cannot satisfy a successful provider operation.
- Unconfigured production providers must return `not_configured` or a legacy non-success adapter value that is recorded as `not_configured` in the provider runtime ledger.
- Disabled providers must return `disabled` and cannot be upgraded to `sent`, `synced`, `verified`, `printed`, or `completed`.
- Raw secrets, OTPs, authorization tokens, raw prescription payloads, and OCR medical text must not be written to logs or the provider operation ledger.

## Provider-specific matrix

| Provider | Success proof | Unconfigured/disabled behavior | Retry/dead-letter notes |
| --- | --- | --- | --- |
| Razorpay | Valid signature, provider order/refund/capture reference, or verified webhook signature. | Missing credentials are `not_configured`/legacy `provider_unconfigured`; invalid signatures are `failed`, never `verified`. | Signature mismatch is non-retryable; gateway/network calls may be retried safely only with idempotency. |
| WhatsApp | Provider API response or delivery webhook. | Missing Cloud API config records `not_configured`; demo skips are non-success. | Send failures are retryable for transient provider/network errors and dead-letter after exhaustion. |
| SMS | Provider API response. | Missing SMS key records `not_configured`; demo skips are non-success. | Transient MSG91/network failures are retryable. |
| OTP | Provider send plus user verification; OTP value must not be logged. | Missing provider/rate limit posture is `not_configured` or `manual_required`. | Send retry is allowed for transient provider failures; verification mismatch is non-retryable. |
| OCR | Provider parse result only after actual OCR; medical review remains manual where required. | Missing OCR provider is `not_configured`/`manual_required`; never fake parsed invoice/prescription data. | Transient OCR failures can retry; low-confidence/regulated data goes manual. |
| Printer | TCP/device acknowledgement or deterministic local file generation when explicitly local. | Missing printer host is `not_configured` or `manual_required`; browser preview is not `printed`. | Network/timeouts can retry; exhausted jobs dead-letter/manual print. |
| Tally/ERP | ERP response reference for sync/import. File generation is only `completed`/generated proof, not `synced`. | Missing ERP config records `not_configured`; generated CSV remains not imported/synced. | Export sync may retry by idempotency key/checksum. |
| Storage | Successful storage API upload or explicit dev/test local storage proof. | Missing storage provider is `not_configured`; sensitive access fails closed. | Upload failures are retryable when idempotent. |
| Maps | Real geocoding/distance response. | Missing maps provider is `not_configured`; checkout/delivery gates must fail closed or use manual routing. | Retry transient HTTP/network failures. |

## No-stubs/no-fake-success doctrine

Provider code may expose dev/test skip behavior only as a non-success status. No production code may return fake WhatsApp/SMS/payment/printer/OCR/Tally/storage/maps success.
