# Provider Runtime Enforcement Status

## Audit metadata

| Item | Status |
| --- | --- |
| Branch | `feat/provider-runtime-attempts-0049` |
| Latest main SHA inspected | `200fafc` local main-equivalent tip. Remote GitHub fetch was attempted but unauthenticated in this container. |
| Prior PR #95/#114 inspected | Attempted via GitHub PR URLs; both returned 404 from this unauthenticated environment, so no raw stale PR changes were merged. |
| Migration added | Yes |
| Migration number used | `0049_provider_operation_attempts.sql`; `0049` was free after `0048_rbac_staff_session_governance.sql`. |
| Next migration number after this PR | `0050` |

## Salvaged vs discarded prior work

No code was copied from prior PR #95 or #114 because the checkout cannot authenticate to GitHub and direct PR URL checks returned 404. The implementation was rebuilt from the local latest main-equivalent source, existing provider-contract/fail-closed tests, worker queue primitives, payment webhook ledger, and connector behavior.

## Provider operation statuses

The canonical runtime statuses are `pending`, `queued`, `completed`, `sent`, `synced`, `verified`, `printed`, `failed`, `retrying`, `dead_letter`, `disabled`, `not_configured`, `manual_required`, and `cancelled`.

Success states are limited to `completed`, `sent`, `synced`, `verified`, and `printed`, and require provider confirmation or deterministic local proof. `not_configured`, `disabled`, `manual_required`, `queued`, and `pending` are explicitly non-success states.

## Table/schema summary

Migration `0049_provider_operation_attempts.sql` adds `provider_operation_attempts` with provider/operation/entity identity, optional store/user refs, canonical status, provider ref, idempotency key, attempt count, retry/dead-letter timestamps, sanitized error fields, request/response hashes, and audit timestamps. Drizzle schema now mirrors the table and indexes.

Indexes added:

- provider type + operation type + status
- entity type + entity ref
- unique idempotency key
- next retry time + status
- store + created time
- provider ref

## Runtime behavior changed

- Added `server/services/providerRuntime.ts` with durable/in-memory attempt helpers, sanitization, fake-success assertion, retry classification, worker enqueue handoff, and DB persistence when `DATABASE_URL` is available.
- SMS and WhatsApp sends now record attempts and mark not-configured/manual/failure/sent states without storing raw message content.
- Razorpay payment verification now records attempt states without changing signature verification semantics; invalid signatures remain `failed` and never `verified`.
- Storage uploads now record attempts and mark missing Forge config as `not_configured`, failures as `failed`, and successful presign/upload as `completed`.
- Governance scanning was narrowed/extended to catch fail-closed statuses being treated as provider success while allowing explicit non-success states.

## Production behavior

Production cannot convert unconfigured/disabled/manual provider paths into success. Success-state helpers require provider proof or deterministic local proof, and payment verification still requires the real Razorpay HMAC comparison.

## Dev/test behavior

Dev/test/demo-like provider gaps resolve to explicit non-success states such as `manual_required` or `not_configured`; they do not produce fake `sent`, `synced`, `verified`, `printed`, `paid`, or `refunded` states.

## Fake-success prevention

`assertProviderOperationNotFakeSuccess` blocks success when provider configuration or enablement is false and blocks production success with no proof. Payload/error sanitizers redact secrets, signatures, OTP/code fields, prescription/OCR/medical/raw/blob/base64 fields, and large strings before hashing/storing.

## Tests added/updated

- `server/provider-runtime.test.ts`
- `server/provider-runtime-guards.test.ts`
- `server/connectors.failclosed.test.ts`
- Payment guard expectations updated for canonical `not_configured`/`manual_required` statuses.

## DB-backed proof status

DB-backed proof was not claimed without `TEST_DATABASE_URL`. The table/schema are statically verified by migration checks; runtime persistence is exercised through the in-memory fallback in unit tests.

## Governance scan result

Targeted provider runtime tests pass and exercise the governance scanner on virtual fake-success/fail-closed fixtures. Full repository governance scan must still be run as a merge gate because older docs/runtime references to legacy provider status names remain in non-touched areas.

## Remaining risks

| Severity | Risk | Follow-up |
| --- | --- | --- |
| P0 | Fresh/existing DB migration replay has not run in this container without `TEST_DATABASE_URL`. | Run DB smoke against an isolated MySQL database before production deploy. |
| P1 | Provider runtime persistence is lightly integrated; some provider paths still use older contract naming/docs. | Continue migrating notification/OCR/Tally/printer/OTP paths onto `providerRuntime` attempts. |
| P1 | Worker processing for provider retries is queued only at the helper boundary; no live provider retry worker was added. | Add provider-operation worker processor after each provider contract is idempotency-audited. |
| P2 | Prior PR #95/#114 could not be inspected from this environment. | Merge captain can inspect GitHub diffs manually before merge. |
