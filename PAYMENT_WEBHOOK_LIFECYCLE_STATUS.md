# Payment Webhook Lifecycle Status

## Scope

This document covers the Razorpay payment webhook lifecycle implemented for Wave 1 / Prompt 7. The implementation is focused on provider callbacks, durable idempotency, audited payment/refund state transitions, and safe reservation integration. It does not redesign accounting, stock deduction, prescription approval, H1/compliance gates, or supplier ledgers.

## Webhook Event Model

Provider callbacks are recorded in `provider_webhook_events` through additive migration `0045_provider_webhook_events.sql` and the mirrored Drizzle schema. The ledger stores:

- `provider`
- `providerEventId`
- `eventType`
- `paymentId`, `orderId`, `refundId`
- `rawPayloadHash`
- sanitized `payloadJson`
- `signatureVerified`
- `processingStatus`
- `processedAt`
- `failureReason`
- `idempotencyKey`
- timestamps

Supported processing states are:

- `received`
- `verified`
- `ignored_duplicate`
- `processed`
- `failed`
- `rejected_signature`
- `unsupported_event`

Indexes protect operational lookup and replay handling:

- unique `provider + providerEventId` when a provider event ID is present
- unique `provider + idempotencyKey`, where the key is either provider event ID or payload hash
- `rawPayloadHash`
- payment/order/refund reference indexes

## Signature Verification Behavior

Webhook processing requires the raw JSON bytes and a Razorpay webhook HMAC signature. Production fails closed when:

- `PAYMENT_WEBHOOK_ENABLED` is not enabled
- `RAZORPAY_WEBHOOK_SECRET` is missing
- the raw body is unavailable
- the signature is missing, malformed, unequal length, or mismatched
- the payload is malformed JSON

No payment, order, reservation, or refund transition is attempted until the webhook signature has been verified.

Manual checkout verification remains separate and still uses the Razorpay order/payment signature path. `provider_unconfigured` and `demo_skipped` are explicitly not commercial success states.

## Idempotency Rules

The webhook lifecycle uses two duplicate protections:

1. `provider + providerEventId` when Razorpay sends an event ID.
2. `provider + rawPayloadHash` when the provider event ID is absent.

A duplicate that already reached `processed`, `ignored_duplicate`, or `unsupported_event` returns an idempotent success response without repeating commercial mutation. Duplicate events cannot re-confirm a payment, re-advance an order, regenerate downstream side effects, re-release consumed reservations, or re-complete a refund.

## Payment State Transition Rules

The service recognizes these lifecycle transitions:

- `attempt_created`
- `authorized`
- `captured`
- `failed`
- `refunded`
- `partially_refunded`
- `cancelled`
- `expired`

Currently implemented webhook transitions are:

- `payment.captured` / `order.paid` → captured
- `payment.failed` → failed
- `payment.cancelled` / `order.cancelled` → cancelled
- `payment.expired` / `order.expired` → expired

Captured payment advancement is centralized through the shared lifecycle helper and checks existing paid state before mutating the payment/order path. Manual verification reuses the same helper after manual signature verification succeeds.

## Reservation Integration

Failed, cancelled, and expired payment webhooks release active reservations through `releaseReservationOnPaymentFailure`. The reservation service updates only reservations whose status is `active`, so consumed reservations are not released. The payment webhook path does not directly mutate stock, batches, batch ledger, store SKU quantities, or stock invariant state.

Captured payments do not directly deduct stock. They continue through the existing order advancement path so stock/reservation consumption remains owned by the approved sales/fulfillment lifecycle.

## Refund Integration

Refund success/failure webhooks are reconciled through the existing refund ledger service only:

- refund success uses `markRefundSuccess`
- refund failure uses `markRefundFailedRecord`
- terminal refund records are treated idempotently
- provider refund IDs remain protected by the existing unique provider refund guard
- over-refund controls remain in `initiateRefundRecord` / `assertRefundAmountAllowed`

If a refund webhook arrives without a matching refund ledger record, processing fails rather than guessing or creating commercial state from an ambiguous callback.

## Commercial Event Integration

The repo currently has a typed `system_events` table with a limited enum that cannot safely accept arbitrary payment webhook lifecycle event names without a broader event-bus migration. This PR therefore appends lifecycle audit events for:

- `payment_webhook_received`
- `payment_signature_verified`
- `payment_captured`
- `payment_failed`
- `refund_webhook_received`
- `refund_completed`
- `payment_duplicate_event_ignored`

A future commercial-event migration can map these audit actions into first-class typed event bus names without blocking this safety work.

## Raw Body Requirement

`/api/webhooks/razorpay` must be registered behind `express.raw({ type: "application/json" })` before the normal JSON parser. The server middleware already reserves `/api/webhooks/razorpay` for raw parsing, and the route rejects production callbacks if `req.body` is not a `Buffer` or raw string.

Operational checklist for raw-body verification:

1. Keep `registerRawWebhookParsers` before `normalJsonParser`.
2. Do not proxy-transform or reserialize webhook bodies before the app verifies HMAC.
3. Configure `RAZORPAY_WEBHOOK_SECRET` in production.
4. Configure provider dashboard callbacks to `/api/webhooks/razorpay`.
5. Monitor rejected-signature and failed processing audit entries.

## Remaining Risks

- Live Razorpay delivery has not been proven in this repo-only validation pass.
- The system event bus enum is not expanded in this PR; lifecycle events are audit-backed rather than first-class `system_events` rows.
- Refund webhooks require an existing refund ledger row and intentionally fail closed when the provider reference cannot be matched.
- Database unique indexes are additive, but production rollout should confirm no existing table name conflicts before migration execution.

## Manual Operational Checklist

Before production enablement:

1. Set `PAYMENT_WEBHOOK_ENABLED=true`.
2. Set `RAZORPAY_WEBHOOK_SECRET` to the dashboard webhook secret.
3. Confirm `/api/webhooks/razorpay` receives the unmodified raw JSON body.
4. Send a Razorpay test webhook and verify one `provider_webhook_events` row is created.
5. Replay the exact webhook and verify `ignored_duplicate` / idempotent behavior.
6. Test a failed/cancelled payment and verify only active reservations are released.
7. Test refund processed/failed callbacks against an existing refund ledger row.
8. Confirm no webhook path directly mutates stock quantity tables.
