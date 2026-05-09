# Reservation Lifecycle Status

- Latest main SHA inspected: `200fafcc20451cc43e8d6272588ec7e26e12d9c8` (local repository head; GitHub fetch failed because remote authentication was unavailable in this environment).
- Prior PR #88 inspected: No; GitHub API returned 404/not accessible.
- Prior PR #115 inspected: No; GitHub API returned 404/not accessible.
- Salvaged from prior PRs: none; this branch was implemented from current local main only.
- Discarded from prior PRs: all uninspected prior branch code to avoid raw stale merges.

## Migration

- Migration added: Yes.
- Migration number used: `0050_reservation_lifecycle_failed_status.sql`.
- Reason: current schema had `active`, `released`, `expired`, `consumed`, and `cancelled` but lacked required `failed`.
- Next migration number after this PR: `0051`.

## State machine summary

Required states are now represented as `active`, `consumed`, `released`, `expired`, `cancelled`, and `failed`. Only `active` may transition to a terminal state. Terminal release/cancel/expire/fail calls are idempotent; consume replay is valid only with the same idempotency key.

## Service functions added/changed

Created `server/services/reservationLifecycle.ts` with:

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

Updated legacy `server/services/reservationService.ts` wrappers so lifecycle mutations require idempotency keys, support `failed`, avoid `entityId: 0`, and reject invalid terminal transitions.

## Integration points touched

- Checkout/order creation: creates durable reservations for order items and fails already-created reservations when checkout reservation creation fails.
- Payment router: payment modal failure and verification failure hand off to reservation failure/release without changing signature verification semantics.
- Payment webhook lifecycle: provider failed/cancelled/expired events pass explicit reservation idempotency keys.
- Rx review: full Rx rejection releases linked order reservations.
- Delivery fulfillment: delivered orders consume reservations idempotently.

## Stock mutation safety

Reservation lifecycle code does not update `batchLedger`, `storeSkus`, or `stockMovements`. Availability checks still use canonical availability from `reservationService`; stock mutation remains outside this lifecycle PR.

## Payment/Rx/cancellation/expiry behavior

- Payment failed/expired/cancelled: reservation moves to `failed` through payment failure handoff.
- Payment verification failure: if a payment/order exists for the gateway order, reservation is failed/released before the verification error is rethrown.
- Rx rejected: linked order reservation is released.
- Order cancellation: existing wrapper maps to `cancelled`.
- Expiry: reconcile marks elapsed active reservations `expired`.

## Tests added

- `server/reservation-lifecycle.test.ts`
- `server/reservation-lifecycle-guards.test.ts`
- `server/reservation-checkout-failure.test.ts`

## DB-backed proof status

Not claimed in this PR unless `TEST_DATABASE_URL` is present and DB smoke/concurrency scripts pass. Atomic last-unit race proof remains a follow-up if DB-backed concurrency cannot run.

## Remaining risks

### P0

- True last-unit oversell proof requires a live MySQL concurrency run with `TEST_DATABASE_URL`; do not claim DB race safety if skipped.

### P1

- Checkout/order creation is not fully wrapped in a database transaction in this PR, so partial order rows may be marked cancelled if reservation creation fails.
- Multi-reservation order-level transitions use legacy wrapper iteration; a future DB-backed transaction should harden this path.

### P2

- Admin/manual recovery UX can be made more explicit around terminal reservation reasons.

## Follow-up prompt

`feat/atomic-reservation-locking-db-proof`
