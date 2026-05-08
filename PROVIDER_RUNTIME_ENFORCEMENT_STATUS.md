# Provider Runtime Enforcement Status

## Status model

Provider runtime outcomes are normalized by `server/services/providerRuntime.ts` into these statuses:

- `success` — a real provider response confirmed the requested operation.
- `failed` — provider call failed and no retry/dead-letter classification has been applied yet.
- `provider_unconfigured` — required provider configuration is missing; this is never success.
- `disabled` — provider is explicitly disabled; this is never success.
- `demo_skipped` — explicit demo/local skip; this is never success.
- `preview_only` — preview/ZPL/export artifact only; this is never printed, sent, synced, or imported success.
- `retry_scheduled` — retryable failure with explicit retry metadata.
- `dead_letter` — visible terminal provider failure requiring inspection or manual action.
- `timeout` — timeout-classified failure.
- `rate_limited` — throttling/rate-limit failure.
- `unknown` — unrecognized provider result; not treated as success.

`assertProviderSuccess` and `assertRealProviderSuccess` reject unconfigured, disabled, demo, preview, retry, dead-letter, timeout, rate-limited, failed, and unknown outcomes.

## Operation registry

`providerOperationRegistry` defines runtime policies for:

- `sms.send`
- `whatsapp.send`
- `email.send`
- `push.send`
- `payment.createOrder`
- `payment.verify`
- `payment.refund`
- `storage.upload`
- `storage.download`
- `ocr.parse`
- `printer.printBatchLabel`
- `printer.printDispatchLabel`
- `tally.export`
- `maps.geocode`
- `maps.distance`

Each policy records whether production configuration is required, whether idempotency is required, retryable failure classes, max retries, dead-letter behavior, whether demo/preview is allowed outside production, and whether the operation mutates external state.

## Retry/dead-letter rules

- Retryable classes are explicit per operation (`network`, `timeout`, `rate_limited`, `provider_5xx`, etc.).
- Retries are represented as `retry_scheduled` with `nextRetryAt`; no background worker is started by this PR.
- Non-retryable provider failures become `dead_letter` when the policy requires visibility.
- Retry exhaustion becomes `dead_letter`.
- `provider_unconfigured`, `demo_skipped`, and `preview_only` are never converted into real success.

## Foundation and migration

Migration `drizzle/0045_provider_runtime_enforcement.sql` adds durable tables:

- `provider_operation_attempts`
- `provider_dead_letters`

It also extends notification event statuses with `demo_skipped` and `preview_only`. The schema is mirrored in `drizzle/schema.ts`. Indexes cover provider/operation/status, idempotency key, created time, and next retry time.

When `DATABASE_URL` is unavailable, the service uses an in-memory fallback for service-level tests and local introspection. Production durability requires running the migration against the configured database.

## Integrations completed

- Runtime executor and helper assertions were added.
- Retry/dead-letter service foundation was added.
- Notification provider normalization now preserves `provider_unconfigured`, `retry_scheduled`, `dead_letter`, `demo_skipped`, and `preview_only` instead of reporting them as sent.
- SMS, WhatsApp, label printer, and ERP/Tally connector outcomes are recorded through the provider runtime foundation without changing their existing fail-closed return semantics.
- Health responses expose provider runtime status counts and dead-letter count without secrets.
- Payment signature verification remains separate and fail-closed; missing Razorpay secret in production still returns `provider_unconfigured`/not verified rather than success.

## Integrations deferred

- No background retry worker is introduced.
- OCR, object storage, maps, and dedicated push/email provider wrappers were not redesigned because the current scope avoids storage, stock, prescription release, accounting, and reservation lifecycle redesign.
- Existing connector runtime recording does not start retries automatically; operators still need explicit replay tooling before mutating external state from dead letters.

## Healthcheck integration

`GET /api/health` and the tRPC system health procedure include a provider runtime summary:

- counts by runtime status,
- configured/unconfigured/degraded provider summaries,
- recent dead-letter count.

The health payload exposes missing environment variable counts only; it does not expose environment variable names, tokens, signatures, secrets, API keys, or payload bodies.

## Security/redaction posture

`redactProviderPayload` recursively redacts keys matching authorization, API key, token, secret, signature, password, private key, credential, and cookie patterns. Runtime attempt records store request hashes and sanitized response summaries only. Raw provider requests, full responses, tokens, signatures, and credentials must not be written to provider runtime tables.

## Production limitations

This PR is a runtime enforcement and introspection foundation. It does not claim production readiness for provider retries. Operators still need migration rollout, dashboards/alerts, and an explicitly reviewed retry worker before failed external side effects can be replayed automatically.

This PR enforces provider runtime outcomes; it does not treat demo, preview, or unconfigured providers as real success.
