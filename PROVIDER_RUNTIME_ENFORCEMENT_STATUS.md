# Provider Runtime Enforcement Status

| Item | Status |
| --- | --- |
| Branch | `feat/rebuild-provider-runtime-enforcement` |
| Latest main SHA inspected | `f7d0498` local main-equivalent tip (`Merge pull request #107 from zarjun247/codex/create-migration-surgery-control-room`) |
| PR #95 inspection | Attempted by fetching `pull/95/head`; GitHub authentication was unavailable in this container, so no raw merge or cherry-pick was performed. Concepts were rebuilt from current main architecture only. |
| Salvaged concepts | Canonical provider lifecycle states, durable attempt ledger, fail-closed unconfigured behavior, sanitized errors/hashes, idempotency keys, retry classification, fake-success assertion. |
| Discarded concepts | Any stale migration numbering or branch-specific implementation from PR #95; no raw PR code was merged. |
| Migration | Added `drizzle/0049_provider_operation_attempts.sql`; next reserved migration number after this PR is `0050`. |
| DB proof | Not claimed unless `TEST_DATABASE_URL` is supplied and DB smoke passes. |

## Runtime implementation

`server/services/providerRuntime.ts` defines the provider operation statuses: `pending`, `queued`, `sent`, `synced`, `verified`, `printed`, `completed`, `failed`, `retrying`, `dead_letter`, `disabled`, `not_configured`, `manual_required`, and `cancelled`.

Success statuses require a provider reference or deterministic local proof. `assertProviderOperationNotFakeSuccess` blocks production success for disabled/unconfigured providers and rejects dev/test proof in production.

## Ledger schema

`provider_operation_attempts` records provider type, operation type, entity, nullable store/user references, status, provider reference, idempotency key, attempt count, retry/dead-letter timestamps, sanitized error code/message, and request/response hashes. It intentionally stores hashes rather than raw provider payloads or medical payloads.

## Provider integrations touched

- SMS and WhatsApp sends now record provider attempts and redact demo log content.
- Razorpay payment signature verification records `verified`, `failed`, or `not_configured` attempts without changing verification semantics.
- Printer label calls record `printed`, `failed`, or `not_configured`; missing printer config is not printed.
- Tally/ERP sync calls record `synced`, `failed`, or `not_configured`; missing ERP config is not synced/imported.
- Notification normalization rejects boolean-only success as production proof and keeps absent provider results on a legacy non-success unavailable status.

## Production behavior

Production missing provider configuration is non-success. Demo/test skips are non-success. Provider failures are explicit and classified for retry where appropriate. Invalid payment signatures remain failed and are never verified.

## Dev/test behavior

Dev/test may use explicit non-success skip states for unavailable providers. Dev/test proof is rejected as production success by the runtime guard.

## Tests added

- `server/provider-runtime.test.ts`
- `server/provider-runtime-guards.test.ts`

These cover fake-success prevention, unconfigured WhatsApp/SMS/printer/Tally behavior, invalid payment signatures, sanitization, idempotency, retry classification, and migration/runtime guard coverage.

## Remaining risks

- Full DB-backed provider ledger proof requires a configured `TEST_DATABASE_URL`.
- Broad worker job execution for provider retries remains intentionally narrow; retry classification is in place, but live retry processing should be added provider-by-provider.
- PR #95 could not be inspected due GitHub authentication failure in this checkout.

## Validation notes

- `node scripts/ci-governance-guards.mjs all` no longer reports provider-runtime findings from this branch after scanner self-scan false positive cleanup, but it still reports pre-existing stock mutation scanner findings in `server/services/stockTruthCertification.ts` lines 27-29.
- `pnpm run test:db:smoke` skips because `TEST_DATABASE_URL` is not set in this container.
