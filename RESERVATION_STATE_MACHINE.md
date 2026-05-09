# Reservation State Machine

## States

Durable stock reservations use these explicit states:

- `active` — a live stock hold that contributes to canonical reserved quantity.
- `consumed` — terminal; fulfillment/delivery consumed the reservation and the same idempotency key may replay safely.
- `released` — terminal; the hold was released before fulfillment.
- `expired` — terminal; the hold elapsed and reconciliation marked it expired.
- `cancelled` — terminal; order/customer/admin cancellation ended the hold.
- `failed` — terminal; checkout/payment/Rx/system failure ended the hold truthfully.

## Terminal states

`consumed`, `released`, `expired`, `cancelled`, and `failed` are terminal states. Terminal reservations are not counted as active availability locks.

## Allowed transitions

- `active` → `consumed`
- `active` → `released`
- `active` → `expired`
- `active` → `cancelled`
- `active` → `failed`

## Invalid transitions

The lifecycle rejects terminal recovery into consumption unless a future audited recovery flow is explicitly built:

- `released` → `consumed`
- `cancelled` → `consumed`
- `expired` → `consumed`
- `failed` → `consumed`
- `consumed` → `consumed` with a different idempotency key

## Idempotency behavior

- Every mutation requires a non-empty idempotency key.
- `released`, `cancelled`, `expired`, and `failed` may be replayed idempotently in the same terminal state.
- `consumed` may be replayed only when the same operation/idempotency key proves it is the same consume action.
- Duplicate terminal calls do not create duplicate in-memory audit events in the guard tests.

## Audit behavior

The lifecycle writes audit records with string-safe reservation references and commercial lifecycle events with non-null idempotency keys. It avoids `entityId: 0`, UUID-to-number conversion, and fake success return objects.

## Failure behavior

Invalid transitions throw clear `CONFLICT` errors. Missing idempotency keys throw `BAD_REQUEST`. Missing reservation references throw `BAD_REQUEST`/`NOT_FOUND`; callers do not receive fabricated success.

## Caller matrix

| Caller | Lifecycle action |
| --- | --- |
| Checkout | Creates reservations after order/items exist; if a later reservation fails, already-created reservations are marked `failed`. |
| Payment | Failed/expired/cancelled payment handoffs mark reservations `failed`; verification failure does the same when the gateway order maps to a payment/order. |
| Rx review | Full prescription rejection releases the linked order reservation with an Rx-specific idempotency key. |
| Cancellation | Existing cancellation handoff maps to `cancelled` through `releaseReservationOnOrderCancel`. |
| Expiry job | `reconcileExpiredReservations` / `expireStaleReservations` mark elapsed active reservations `expired`. |
| Delivery/fulfillment | Delivery completion consumes reservation with a delivery-specific idempotency key. |
| Admin/manual correction | Manual release uses `released`; failed manual correction should use `failed` with an explicit reason and idempotency key. |
