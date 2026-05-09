# Reservation State Machine

## States

| State | Meaning | Stock availability impact |
| --- | --- | --- |
| `active` | Durable soft reservation is currently holding sellable stock for an order/cart line. | Counted by canonical availability as reserved stock. |
| `consumed` | Reservation was finalized by an explicit fulfillment lifecycle call after the business flow has completed its stock handoff. | No longer counted as active reserved stock. |
| `released` | Reservation was intentionally released without order cancellation, for example checkout/Rx remediation. | No longer counted as active reserved stock. |
| `expired` | Reservation expired because `expiresAt` elapsed and reconciliation moved it out of `active`. | No longer counted as active reserved stock. |
| `cancelled` | Reservation was released because the owning order/cart was cancelled. | No longer counted as active reserved stock. |
| `failed` | Reservation was released because payment/provider/checkout lifecycle failed. | No longer counted as active reserved stock. |

## Allowed transitions

| From | To | Allowed callers |
| --- | --- | --- |
| `active` | `consumed` | Fulfillment/delivery completion caller after the stock handoff is valid for the current model. |
| `active` | `released` | Checkout rollback, Rx rejection, manual release, item unavailable/substitution review. |
| `active` | `expired` | Expiry reconciler or explicit expiry caller. |
| `active` | `cancelled` | Order cancellation caller. |
| `active` | `failed` | Payment failure/cancellation/expiry or unrecoverable reservation failure caller. |
| terminal state | same terminal state | Same caller retry; handled as idempotent. |

## Invalid transitions

Any terminal state to a different terminal state is invalid and must fail clearly. Examples:

- `released -> consumed` is invalid.
- `failed -> released` is invalid.
- `cancelled -> consumed` is invalid.

The lifecycle service rejects those transitions with an explicit precondition error rather than returning fake success.

## Idempotency behavior

- Repeating the same terminal transition returns an idempotent success result and writes an idempotent audit event.
- `createReservation` reuses an existing active reservation for the same order/cart + product/variant/store/SKU scope where possible.
- Caller-supplied idempotency keys must be concrete strings when supplied; nullable idempotency keys are rejected.

## Audit behavior

Every lifecycle mutation writes:

1. an audit-log entry with `entityType = stock_reservation`, and
2. a commercial lifecycle event with a deterministic reservation aggregate reference.

Audit references never use `entityId: 0`, `Number(uuid)`, or `as unknown as string` for reservation identifiers.

## Failure behavior

- Missing reservation identity fails with a bad-request error.
- Missing durable reservation row fails with not-found.
- Invalid transition fails with precondition failed.
- Insufficient stock uses canonical availability and fails before creating the reservation.
- DB-backed last-unit race proof is not claimed unless the DB concurrency tests run with `TEST_DATABASE_URL`.
