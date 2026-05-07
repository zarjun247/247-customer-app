# Payment Provider Fail-Closed Status

## Scope

This document covers the P20-06 payment fail-closed hardening work on branch `feat/p20-06-payment-provider-failclosed`.

Reserved migration: **None**. No schema or migration changes were added.

## Payment verification behavior

- Payment verification now returns a structured provider result with `verified`, `status`, `realGatewayVerification`, and optional `reason` fields.
- Production/unconfigured payment verification is fail-closed:
  - Missing `RAZORPAY_KEY_SECRET` returns `status: "provider_unconfigured"` and `verified: false` from the payment service.
  - Direct connector verification without a secret throws `Payment provider_unconfigured: RAZORPAY_KEY_SECRET missing` outside explicit demo/test mode.
- The payment router now requires both `verified: true` and `realGatewayVerification: true` before it fetches a payment record, marks payment captured, updates order status, or starts SLA tracking.
- Failed or unconfigured verification is audited as `payment.verify_failed` and returned as a controlled tRPC error.

## Webhook signature behavior

- Webhook verification remains gated by `PAYMENT_WEBHOOK_ENABLED`.
- Missing `RAZORPAY_WEBHOOK_SECRET` in production throws a controlled `PRECONDITION_FAILED` error.
- Missing webhook signatures return `false`.
- Malformed or unequal-length signatures return `false`; `crypto.timingSafeEqual` is only called after buffer length checks.
- Valid Razorpay HMAC-SHA256 signatures over the raw body are accepted.
- Raw body verification is preserved: the HMAC digest is still computed from the supplied raw body string.

## Payment lifecycle helper behavior

- `recordPaymentAttempt`, `markPaymentAuthorized`, and `markPaymentRefunded` no longer return fake `{ ok: true }` success in production paths.
- In production/non-demo mode, these unwired helpers throw `NOT_IMPLEMENTED` to fail closed until durable state transitions are implemented.
- `markPaymentCaptured` continues to persist through `confirmPaymentRecord` and returns `status: "verified"` only after the persistence call completes.
- `markPaymentFailed` continues to persist through `failPaymentRecord` and returns `status: "failed"`.

## Demo/local/test behavior

- Demo/local/test behavior is explicit through `PAYMENT_PROVIDER_MODE=demo|local|test`, truthy `LOCAL_DEMO_MODE`, or `NODE_ENV=test`.
- Missing Razorpay secret in explicit demo/test mode returns `status: "demo_skipped"`, `verified: false`, and `realGatewayVerification: false`; it does not claim real gateway success.
- Connector demo placeholders are labelled `DEMO_SKIPPED`/`demo_*_skipped` rather than stub success.

## Remaining risks

- **P0:** None identified in the touched payment verification path.
- **P1:** Payment failure does not newly release order/stock/reservations in this branch. No reservation internals were changed; release behavior should be handled by the existing payment-failure flow or a dedicated reservation-safe task.
- **P2:** Webhook route posture is still guarded by `PAYMENT_WEBHOOK_ROUTE_IMPLEMENTED`; this branch hardens signature verification but does not claim end-to-end webhook production readiness.

## Validation results

- `pnpm install` — passed; pnpm reported ignored build-script warnings for `@tailwindcss/oxide` and `esbuild`.
- `pnpm run check` — passed.
- `pnpm test -- --runInBand` — passed: 55 test files, 212 tests.
- `pnpm run build` — passed; Vite emitted existing environment/chunk-size warnings.

## Files changed

- `server/connectors.ts`
- `server/services/paymentGateway.ts`
- `server/routers/paymentRouter.ts`
- `server/payment-gateway.guard.test.ts`
- `server/payment-router.failclosed.test.ts`
- `PAYMENT_PROVIDER_FAILCLOSED_STATUS.md`

## Tests added/updated

- Added missing webhook signature rejection coverage.
- Added malformed webhook signature no-throw coverage for invalid and unequal-length signatures.
- Added valid payment verification structured-result coverage.
- Added missing Razorpay secret production fail-closed coverage.
- Added explicit demo-mode `demo_skipped` coverage.
- Added lifecycle helper `NOT_IMPLEMENTED` production coverage.
- Added payment router fail-closed coverage proving failed verification does not call payment capture, order status update, or SLA start helpers.
- Added guard coverage for payment fake-success placeholder removal.
