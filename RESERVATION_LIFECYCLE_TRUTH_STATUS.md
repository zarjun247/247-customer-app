# Reservation Lifecycle Truth Status

## Final reservation lifecycle states

The durable `stock_reservations.status` lifecycle is now:

- `active` — quantity is reserved and subtracts from customer/staff availability.
- `consumed` — sale/order confirmation has claimed the reservation exactly once; physical stock deduction remains outside reservation truth.
- `released` — manual or checkout cleanup returned active reserved quantity to availability.
- `expired` — expiry helper marked an elapsed active reservation inactive for availability.
- `cancelled` — order cancellation or Rx/staff rejection removed the active reservation.
- `failed` — payment failure or reservation-failure path removed the active reservation.

## Canonical availability formula

Canonical availability is:

```text
availableQty = physical on-hand qty - active reserved qty - soft-locked qty - quarantined qty - expired/unavailable qty
```

Legacy batch-level `qtyReserved` is still subtracted as unavailable legacy reserved stock until reconciliation clears it. Durable active rows in `stock_reservations` are the new reservation truth.

## Files changed

- `server/services/reservationService.ts` — centralized lifecycle primitives, availability, expiry, idempotent transitions, and reconciliation.
- `server/routers.ts` — checkout reservation writes route through the central service and cancellation/status failures release reservations.
- `server/routers/paymentRouter.ts` — verified payments consume reservations; failed payments fail/release active reservations.
- `server/routers/salesRouter.ts` — counter sale confirmation creates/consumes reservation truth while stock deduction remains through `decreaseStockForSaleConfirmation`.
- `server/pharmacy.ts` — Rx rejection releases linked order reservations.
- `server/db.ts` — catalogue/SKU availability SQL mirrors the canonical formula.
- `drizzle/schema.ts` and `drizzle/0045_reservation_lifecycle_truth.sql` — additive reservation status/meta/index migration.
- `server/reservationLifecycleTruth.test.ts` and updated reservation guard coverage.

## Migration status

Added one additive migration: `drizzle/0045_reservation_lifecycle_truth.sql`.

It extends the reservation status enum with `failed`, adds nullable `reservationMeta` JSON for non-order references such as counter sale IDs, and adds a batch/status index for reconciliation and batch-scoped availability.

## Integration points touched

- Customer checkout/cart lock path.
- Order status cancellation/rejection/return cleanup.
- Payment verification and payment failure paths.
- Counter sale confirmation.
- Rx rejection cleanup.
- Catalogue/SKU availability read model.
- Barcode lookup remains read-only and displays canonical availability only.

## Remaining risks

- Full multi-node over-reservation protection depends on a DB engine honoring transactions and serializable isolation. The service requests serializable transaction scope, but this branch was validated without a live `TEST_DATABASE_URL` harness in this container.
- Legacy `batchLedger.qtyReserved` remains in the formula as unavailable stock to preserve latest-main behavior; operators should use reconciliation before clearing legacy soft/durable mismatches.
- Existing app-order physical stock deduction appears outside this prompt's scope; this PR consumes reservation truth at payment verification and does not introduce new order stock mutation.

## DB concurrency proof status

No `TEST_DATABASE_URL` was configured in this environment, so DB-backed concurrency tests were not run. Static/unit guard coverage proves idempotency wiring, serializable transaction intent, and no direct stock mutation regression; a live MySQL concurrency harness remains recommended before claiming multi-store production readiness.

## Rollback considerations

- Roll back code first if application behavior must revert.
- The migration is additive but enum rollback would require ensuring no rows have `status='failed'` and then narrowing the enum manually.
- `reservationMeta` is nullable and safe to leave in place during rollback.

## Production readiness impact

This PR centralizes reservation lifecycle truth; stock deduction remains governed by approved stock mutation services. It improves production safety by ensuring active reservations are the single availability lock, terminal states remove locks from availability, payment/order/sale transitions are idempotent, and reconciliation can report orphan, expired-active, and over-reserved anomalies.
