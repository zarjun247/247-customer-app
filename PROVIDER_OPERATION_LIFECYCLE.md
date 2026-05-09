# Provider Operation Lifecycle

## Canonical statuses

All external provider operations must resolve to one of these durable statuses:

- `pending`
- `queued`
- `completed`
- `sent`
- `synced`
- `verified`
- `printed`
- `failed`
- `retrying`
- `dead_letter`
- `disabled`
- `not_configured`
- `manual_required`
- `cancelled`

## Success states

The only success states are `completed`, `sent`, `synced`, `verified`, and `printed`.
They require real provider confirmation or deterministic local proof. Examples:

- Razorpay signature verification uses HMAC proof with the real secret before `verified`.
- SMS/WhatsApp can be `sent` only after the real HTTP provider call returns success.
- Printer can be `printed` only after the printer socket write completes.
- Storage upload can be `completed` only after presign and upload calls succeed.
- Tally file generation may be `completed` as local export proof, but ERP import/sync remains non-success unless confirmed by ERP.

## Fail-closed states

`not_configured`, `disabled`, `manual_required`, `queued`, `pending`, `failed`, `retrying`, `dead_letter`, and `cancelled` are not success. They must never unlock payment, dispensing, sync, print, delivery, OCR, or notification success paths by themselves.

## Retry and dead-letter behavior

`classifyProviderError` marks transient timeout/network/rate-limit/5xx failures as retryable and configuration, disabled, manual, and signature failures as non-retryable. `markProviderQueued` can enqueue a provider retry job through the existing worker queue using a sanitized payload and idempotency key. Exhausted or non-retryable attempts must move to `failed`, `manual_required`, or `dead_letter` rather than pretending success.

## Production no-fake-success doctrine

Production mode forbids demo/mock/local success. `assertProviderOperationNotFakeSuccess` rejects success states when a provider is disabled, not configured, or lacks provider confirmation/deterministic proof. Dev/test behavior may return explicit `manual_required`, `not_configured`, or queued states, but cannot claim real production success.

## Provider-specific matrix

| Provider | Operation | Success proof | Fail-closed states |
| --- | --- | --- | --- |
| Razorpay/payment | create order, verify, webhook, refund | Razorpay API response, valid HMAC signature, verified webhook signature | `not_configured`, `disabled`, `failed`, `manual_required`, `dead_letter` |
| WhatsApp | send | WhatsApp Cloud API success response | `not_configured`, `disabled`, `manual_required`, `failed`, `retrying`, `dead_letter` |
| SMS | send | MSG91 success response | `not_configured`, `disabled`, `manual_required`, `failed`, `retrying`, `dead_letter` |
| OTP | send, verify | Real SMS/OTP provider send or deterministic local DB verification; OTP value is never logged | `not_configured`, `disabled`, `manual_required`, `failed` |
| OCR | parse | Real OCR/parser result with auditable request/response hashes; raw OCR/prescription payloads are not stored | `not_configured`, `manual_required`, `failed`, `dead_letter` |
| Printer | print | Printer socket write completion or other printer acknowledgement | `not_configured`, `manual_required`, `failed`, `dead_letter` |
| Tally/ERP | export, sync | CSV/file generation is `completed`; ERP import/sync needs ERP confirmation for `synced` | `not_configured`, `manual_required`, `failed`, `dead_letter` |
| Storage | upload | Presign + upload success with stored key proof | `not_configured`, `disabled`, `failed`, `retrying`, `dead_letter` |
| Maps | healthcheck/distance | Real maps provider response or deterministic local geofence proof when explicitly designed | `not_configured`, `manual_required`, `failed`, `dead_letter` |

## Manual-required behavior

`manual_required` means the provider operation did not complete digitally and needs operator action or browser/manual fallback. It is auditable and non-successful. A manual action must create its own deterministic proof before any downstream state is treated as completed, printed, synced, verified, or sent.
