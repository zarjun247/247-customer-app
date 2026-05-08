# Commercial Lifecycle Ledger Status

## Purpose

This foundation introduces a canonical commercial lifecycle vocabulary and an immutable event ledger for the commercial path. The intent is to move future order, reservation, payment, invoice, refund, credit-note, and reconciliation visibility toward:

```text
commercial truth = immutable events + derived lifecycle state
```

This is infrastructure only. It does not replace existing order status, stock movement, payment verification, invoice, refund, accounting, H1, or audit truth by itself.

## Lifecycle model

The canonical lifecycle concepts are:

- cart
- reservation
- checkout
- payment
- sale/order
- invoice
- refund
- return
- credit note
- cancellation
- reconciliation

Normalized lifecycle states are:

- `initiated`
- `pending`
- `authorized`
- `confirmed`
- `partially_refunded`
- `refunded`
- `cancelled`
- `failed`
- `expired`
- `reconciled`

Existing runtime statuses are mapped additively into this vocabulary by `normalizeCommercialStatus(...)`. API responses are not changed by this PR.

## Event types added

The initial canonical event type list includes:

- `cart_created`
- `checkout_initiated`
- `reservation_created`
- `reservation_released`
- `reservation_consumed`
- `reservation_expired`
- `payment_authorized`
- `payment_verified`
- `payment_failed`
- `order_confirmed`
- `invoice_generated`
- `refund_initiated`
- `refund_completed`
- `return_initiated`
- `return_completed`
- `credit_note_generated`
- `cancellation_completed`
- `reconciliation_completed`

## Immutable ledger schema

The additive migration creates `commercial_events` with string-safe references and event metadata:

- `event_id`
- `aggregate_type`
- `aggregate_id`
- `event_type`
- `event_version`
- `actor_type`
- `actor_id`
- `store_id`
- `order_id`
- `sale_id`
- `invoice_id`
- `reservation_id`
- `payment_id`
- `refund_id`
- `event_payload`
- `occurred_at`
- `idempotency_key`
- `correlation_id`
- `created_at`

Indexes are limited to lifecycle read paths and duplicate protection:

- aggregate type + aggregate id
- occurred at
- idempotency key unique index
- correlation id
- order/payment/invoice timeline indexes

Normal application helpers expose append and read functions only; no runtime update/delete helper is provided.

## Derived-state rules

`getCommercialLifecycleState(...)` and `summarizeCommercialLifecycle(...)` derive state from ordered events:

- Checkout/cart events derive `initiated`.
- Reservation created derives reservation `authorized`.
- Reservation released derives reservation `cancelled`.
- Reservation expired derives reservation `expired`.
- Reservation consumed derives reservation `confirmed`.
- Payment authorized derives payment `authorized`.
- Payment verified derives payment `confirmed` and records paid amount.
- Payment failed derives payment `failed`.
- Order confirmed derives order `confirmed`.
- Invoice generated derives invoice `confirmed`.
- Refund initiated keeps refund `pending`.
- Refund completed accumulates refunded amount.
- Refund total below paid amount derives `partially_refunded`.
- Refund total equal to or above paid amount derives `refunded`.
- Cancellation completed derives order/overall `cancelled`.
- Reconciliation completed derives overall `reconciled`.

Supported scenarios include pending payment, successful order, partial refund, full refund, cancellation before payment, cancellation after reservation, and invoice generated while refund is pending.

## Integration coverage

This PR adds the foundation service and schema. Safe helpers are available for runtime wiring:

- `appendCommercialEvent(...)`
- `appendCommercialEvents(...)`
- `getCommercialTimeline(...)`
- `getAggregateLifecycle(...)`
- `reconcileCommercialAggregate(...)`
- `getCommercialLifecycleState(...)`
- `getCommercialTimelineByOrder(...)`
- `getCommercialTimelineByPayment(...)`
- `getCommercialTimelineByInvoice(...)`
- `summarizeCommercialLifecycle(...)`

The append service redacts sensitive payload keys such as signatures, tokens, passwords, cookies, API keys, card fields, CVV, OTP, authorization headers, and session values.

## Missing runtime paths

Runtime mutation paths are not comprehensively rewired in this PR to avoid silently changing accounting, stock, payment, prescription, H1, or refund semantics. The following paths should be wired in focused follow-up PRs after each owning flow confirms idempotency keys and transaction boundaries:

- Reservation lifecycle runtime writes (`reservation_created`, `reservation_released`, `reservation_consumed`, `reservation_expired`).
- Razorpay/payment verification runtime writes (`payment_verified`, `payment_failed`) without weakening existing fail-closed verification.
- Order confirmation runtime writes (`order_confirmed`).
- Invoice snapshot generation runtime writes (`invoice_generated`).
- Refund initiation/completion runtime writes (`refund_initiated`, `refund_completed`).
- Credit note issuance runtime writes (`credit_note_generated`).
- Cancellation runtime writes (`cancellation_completed`).

Until those paths are wired, the ledger is available for additive adoption and tests, but it is not a complete production commercial source of truth.

## Reconciliation capabilities

Read helpers can surface:

- orphan invoice
- payment without order/sale linkage
- refund without payment
- duplicate event attempt visibility
- lifecycle impossible-state detection
- deterministic aggregate timeline ordering

No helper auto-mutates production data or marks reconciliation successful without explicit events.

## Impossible-state detection coverage

`detectCommercialImpossibleStates(...)` reports:

- `refund_exceeds_payment`
- `invoice_without_successful_order`
- `consumed_reservation_without_order_confirmation`
- `payment_verified_without_sale_confirmation`
- `duplicate_invoice_ref`
- `duplicate_provider_ref`
- `refund_without_payment`
- `payment_without_order`
- `orphan_invoice`
- `duplicate_event_attempt`

These checks are read-only diagnostics.

## Idempotency and string-safe references

`idempotency_key` is unique in the additive database schema, and the append service returns the existing event on duplicate idempotent retries where possible. All aggregate and provider references are stored as strings to avoid `Number(uuid)` coercion and to preserve provider IDs exactly.

## Known limitations

- This is not full enterprise event sourcing.
- Existing runtime state remains authoritative until flow-specific wiring is added.
- The ledger does not mutate stock and does not replace `stockInvariant` or stock movement records.
- The ledger does not verify payments and does not bypass Razorpay/provider verification.
- The ledger does not issue invoices, refunds, credit notes, or accounting entries.
- Reconciliation helpers detect anomalies but do not repair data.

## Future migration path

A future full event-sourcing migration, if desired, should be incremental:

1. Wire each commercial runtime path with stable idempotency keys inside existing transactions.
2. Backfill historical events with explicit `eventVersion` and correlation IDs.
3. Build reporting read models from the ledger.
4. Compare derived lifecycle states against existing statuses in shadow mode.
5. Add reconciliation dashboards and alerting.
6. Only after parity and audit approval, consider promoting derived lifecycle state as a primary read model.
