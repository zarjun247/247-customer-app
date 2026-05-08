# Commercial Lifecycle Ledger Status

## Lifecycle model

This foundation defines commercial truth as append-only commercial events plus derived lifecycle state. The normalized concepts are cart, reservation, checkout, payment, sale/order, invoice, refund, return, credit note, cancellation, and reconciliation. The normalized states are `initiated`, `pending`, `authorized`, `confirmed`, `partially_refunded`, `refunded`, `cancelled`, `failed`, `expired`, and `reconciled`.

Existing runtime statuses are mapped additively into those normalized states by `mapCommercialStatus(...)`. API responses and legacy status fields remain unchanged.

## Event types added

The canonical event vocabulary includes:

- `cart_initiated`
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
- `return_completed`
- `credit_note_generated`
- `cancellation_completed`
- `reconciliation_completed`

## Ledger schema

The additive `commercial_events` table stores string-safe references for aggregate, actor, store, order, sale, invoice, reservation, payment, refund, idempotency, and correlation identifiers. It includes indexes for aggregate lookup, deterministic timeline reads, idempotency protection, and reconciliation-by-correlation visibility.

The runtime service exposes append and read helpers only. There is no normal update/delete service path; update/delete attempts are explicitly rejected by the append-only guard helper.

## Derived-state rules

`getCommercialLifecycleState(...)` derives state from event streams using the following foundation rules:

- `payment_failed` takes the lifecycle to `failed`.
- `cancellation_completed` takes the lifecycle to `cancelled`.
- `reservation_expired` takes the lifecycle to `expired`.
- Completed refunds are compared with verified/authorized payment amount.
  - refund total equal to or greater than paid total derives `refunded`.
  - refund total below paid total derives `partially_refunded`.
- `reconciliation_completed` derives `reconciled` when no higher-priority terminal state exists.
- `order_confirmed` or `invoice_generated` derives `confirmed`.
- `payment_verified` derives `authorized` until sale/order confirmation appears.
- `reservation_created`, checkout initiation, or payment authorization derives `pending`.
- `cart_initiated` derives `initiated`.

This is intentionally a foundation model, not full enterprise event sourcing.

## Integration coverage

Safest/high-confidence runtime paths now append best-effort ledger events after the existing source-of-truth mutation succeeds:

- reservation creation
- reservation release/expiry/cancellation helpers
- payment verification persistence
- payment failure persistence
- POS sale/order confirmation
- invoice generation after sale confirmation
- refund initiation
- refund completion
- issued credit note generation
- credit-note cancellation completion

All integration is best-effort and non-blocking so current accounting, stock, payment, reservation, H1, refund, and audit behavior remains authoritative and unchanged.

## Missing runtime paths

The following paths are documented gaps for future waves:

- Some WhatsApp/order conversion flows that emit legacy workflow events are not fully mirrored into the commercial ledger.
- Return completion is represented in the vocabulary but not comprehensively wired across all return paths.
- Provider webhook-specific idempotency may still be enforced by existing payment/refund logic before the ledger receives a mirrored event.
- Historical data is not backfilled by this PR.
- Supplier ledger, OCR inwarding, barcode lifecycle, and H1 release flows are intentionally not redesigned.

## Reconciliation capabilities

Read helpers support deterministic timelines by aggregate, order, payment, and invoice:

- `getCommercialTimeline(...)`
- `getCommercialTimelineByOrder(...)`
- `getCommercialTimelineByPayment(...)`
- `getCommercialTimelineByInvoice(...)`
- `summarizeCommercialLifecycle(...)`
- `reconcileCommercialAggregate(...)`

Summaries include lifecycle state, event counts, first/last event timestamps, anomaly lists, and critical-anomaly flags.

## Impossible-state detection coverage

Read-only anomaly detection surfaces:

- refund greater than payment
- invoice without successful order
- consumed reservation without order confirmation
- payment verified but no sale/order confirmation
- orphan invoice
- payment without order/sale references
- refund without payment
- duplicate invoice references
- duplicate provider/payment/refund references
- duplicate idempotency-key append attempts when visible to the caller

Detection never auto-mutates production data and never marks reconciliation successful by itself.

## Secret redaction and string-safe refs

Payload serialization redacts sensitive keys such as secrets, passwords, tokens, signatures, API keys, authorization/cookie values, OTPs, CVV, and card numbers. Commercial references remain strings to avoid `Number(uuid)` coercion and preserve provider IDs, invoice numbers, payment IDs, refund IDs, and credit note numbers exactly.

## Known limitations

- The ledger is foundational infrastructure; existing tables remain operational truth until a future migration deliberately changes ownership.
- Best-effort event append failures do not fail existing flows.
- Reconciliation anomalies are visibility signals, not automated repair actions.
- The lifecycle derivation model is intentionally simple and may need additional event versions for complex split shipment, multi-payment, multi-invoice, and store-transfer scenarios.

## Future migration toward full event sourcing

Future waves can backfill historical events, expand webhook coverage, promote commercial-event summaries to reporting read models, and gradually move selected read paths from scattered status fields to derived state. Any such migration should be explicit, audited, and protected by current stockInvariant, reservation lifecycle, payment fail-closed, H1 compliance, refund, and audit guarantees.

> This PR adds immutable commercial lifecycle infrastructure; it does not replace existing accounting, stock, or payment truth by itself.
