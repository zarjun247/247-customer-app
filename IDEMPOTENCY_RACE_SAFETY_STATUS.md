# IDEMPOTENCY_RACE_SAFETY_STATUS

Date: 2026-05-07  
Branch: `feat/mega-03-idempotency-invoice-race-safety`

## Fixed items
- `beginIdempotentOperation` now attempts the insert first and handles duplicate-key errors before loading the existing row, avoiding select-then-insert race behavior as the final path.
- The database/schema contract requires a unique idempotency key on `(key, scope)` via `idempotency_keys_key_scope_uidx`.
- `createMutationFingerprint` now uses canonical JSON plus full SHA-256 hex output, so equivalent object key ordering hashes identically and different payloads diverge without weak truncation.
- `withIdempotency` now replays completed operations only after request-hash validation, conflicts on completed/different payload, conflicts deterministically on duplicate in-progress requests, and permits retry of failed operations only when the request hash matches.
- Idempotency/audit duplicate paths preserve UUID/string entity references in JSON payloads and `entityRef` metadata instead of coercing UUID IDs through unsafe `Number(...)` conversions.

## DB constraint / migration notes
- Existing migration `drizzle/0026_idempotency_reservations.sql` already creates `UNIQUE KEY idempotency_keys_key_scope_uidx (key, scope)`.
- No new idempotency migration was added because the required unique constraint already exists on main after PR #51.
- Backfill assumption: existing rows must not contain duplicate `(key, scope)` values; the existing unique key would already reject such duplicates in migrated environments.

## Remaining risks
- Runtime concurrency tests still need a real MySQL integration harness to prove duplicate-key behavior against the production driver under load.
- Not every mutation endpoint in the application has been wrapped with idempotency; this pass hardens the shared service and existing wired paths.
- In-progress duplicate behavior is fail-fast conflict/retry-after rather than wait/poll; this is intentional until a request coordinator or queue is introduced.

## Deferred items with reason
- No broad audit schema migration for a dedicated `entity_ref` column was added; string references are preserved in audit payload/metadata to avoid high-blast-radius audit-table changes.
- No H1/Rx/payment/refund/accounting/barcode UX changes were attempted outside idempotency safety.

## New score estimate
- Idempotency race safety: 8.1 / 10.
- Remaining lift to 9.5+: DB-backed concurrent integration tests and wider mutation endpoint rollout.
