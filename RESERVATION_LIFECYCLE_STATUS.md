# RESERVATION_LIFECYCLE_STATUS

## Audit metadata

| Item | Value |
| --- | --- |
| Branch name | `feat/rebuild-reservation-lifecycle-truth` |
| Latest main SHA inspected | `f7d049825eb17922e9fa0c47326620e26a396186` |
| Remote refresh status | Attempted to add/fetch `https://github.com/zarjun247/247-customer-app.git`; unauthenticated GitHub access failed in this container. Work proceeded from local latest-main-equivalent tip `f7d049825eb17922e9fa0c47326620e26a396186`. |
| PR #88 inspected | Attempted via GitHub fetch ref; inaccessible without credentials, so no raw PR code was merged. |
| Migration tail verified | `0045_provider_webhook_events.sql`, `0046_commercial_event_ledger.sql`, `0047_worker_jobs.sql`, `0048_rbac_staff_session_governance.sql`. |
| Migration added | Yes: `0049_reservation_lifecycle_failed_status.sql`. |
| DB race proof status | Not claimed unless DB commands run successfully with `TEST_DATABASE_URL`. |

## What was salvaged vs discarded

### Salvaged concepts

- A central lifecycle service with explicit state operations.
- Durable `stock_reservations` rows as reservation truth.
- Canonical availability as the only reservation availability gate.
- Commercial event ledger and audit-log mutation trace.
- Idempotent terminal retries and explicit invalid-transition failures.

### Discarded concepts

- Any stale migration number from PR #88.
- Nullable/fake idempotency identifiers.
- `Number(uuid)`, `entityId: 0`, and production identifier casts.
- Any claim that last-unit DB races are solved without DB-backed proof.
- Any payment-provider runtime behavior rewrite beyond reservation handoff checks.

## Lifecycle state machine

The production state set is:

- `active`
- `consumed`
- `released`
- `expired`
- `cancelled`
- `failed`

Only `active` can transition to a different state. Repeating a terminal transition to the same terminal state is idempotent. Terminal-to-different-terminal drift fails explicitly.

## Central service functions

`server/services/reservationLifecycle.ts` exposes:

- `createReservation`
- `assertAvailableForReservation`
- `consumeReservation`
- `releaseReservation`
- `expireReservation`
- `cancelReservation`
- `failReservation`
- `getReservationStatus`
- `reconcileExpiredReservations`
- `getReservationAuditSummary`
- `assertOrderHasActiveReservations`

## Integration points

| Area | Handoff |
| --- | --- |
| Checkout/order creation | Validates canonical availability before order creation; creates durable active reservations after order lines; releases any created reservations and cancels the order if reservation creation fails. |
| Payment success | Requires active order reservation before marking captured payment flow as shippable/picking. The reservation remains active as pending fulfillment because the current app-order model does not expose a safe batch stock decrement at payment capture. |
| Payment failure/cancel/expiry | Moves matching active reservations to `failed`, making availability explicit and auditable. |
| Order cancellation | Moves matching active reservations to `cancelled`. |
| Rx rejection | Releases matching order reservations with `rx_rejected` where a linked order is present. H1/Rx compliance release logic itself was not changed. |
| Delivery/fulfillment | `consumeReservation` exists for the explicit fulfillment handoff, but this PR does not wire blind consumption because no safe app-order stock mutation/batch handoff exists in the current model. |

## Migration

`0049_reservation_lifecycle_failed_status.sql` extends the `stock_reservations.status` enum with `failed`. This is additive/backward-compatible for existing rows.

## Tests added

- `server/reservationLifecycle.test.ts` covers state inventory, valid transitions, invalid transitions, idempotent terminal retries, safe identifier guards, integration handoff markers, and no direct stock mutation in the lifecycle service.
- `server/mega-stock-reservation-truth.guard.test.ts` was updated for the `failed` terminal state.

## Remaining risks

| Severity | Risk | Follow-up |
| --- | --- | --- |
| P0 | DB-backed last-unit race proof requires `TEST_DATABASE_URL`; do not claim race safety unless those tests pass. | `feat/atomic-reservation-locking-db-proof` |
| P1 | `createOrder` validates and then inserts/reserves without proven row locks/named locks in this PR. | Add DB transaction/locking proof with concurrent tests. |
| P1 | App-order delivery consumption is intentionally not wired because current stock mutation doctrine lacks an order-line-to-batch fulfillment gateway. | Define fulfillment batch allocation gateway before consuming reservations automatically. |
| P2 | PR #88 was not accessible from this container, so rebuild relied on mission notes and current main inspection. | Merge captain can compare PR #88 manually before merge. |

## Next required prompt

`feat/atomic-reservation-locking-db-proof`

## Validation results in this container

| Command | Result |
| --- | --- |
| `pnpm install` | Passed; pnpm warned that dependency build scripts are ignored until approved. |
| `pnpm run check` | Passed. |
| `pnpm test -- --runInBand` | Passed: 497 tests passed, 1 DB lifecycle test skipped because `TEST_DATABASE_URL` is not set. |
| `pnpm run build` | Passed with existing analytics placeholder/chunk-size warnings from Vite. |
| `node scripts/verify-migrations.mjs` | Passed: latest numbered migration is `0049`. |
| `node scripts/ci-governance-guards.mjs all` | Passed after allowlisting the new reservation lifecycle gateway. |
| `git diff --check` | Passed. |
| `pnpm run test:db:smoke` | Skipped by test harness because `TEST_DATABASE_URL` is not set. |
| `pnpm run test:db:concurrency` | Not available; package.json has no script by this name. |
