# Payment Provider Fail-Closed Status

## Scope

This status file covers the P20-06 payment-provider fail-closed hardening work. No database migration was added.

## Payment verification behavior

- `verifyGatewayPaymentSignature` now returns an explicit verification result instead of a bare success boolean.
- A successful real Razorpay HMAC check returns `{ verified: true, status: "verified" }`.
- Signature mismatch returns `{ verified: false, status: "failed" }`.
- Missing `RAZORPAY_KEY_SECRET` in production or other non-demo runtime returns `{ verified: false, status: "provider_unconfigured" }`; the payment router maps this to a controlled `PRECONDITION_FAILED` response and does not mark payment/order state as successful.
- Explicit demo/test mode with a missing secret returns `{ verified: false, status: "demo_skipped" }`; it is intentionally not treated as a real gateway verification.

## Webhook signature behavior

- `verifyGatewayWebhookSignature` preserves raw-body HMAC verification using the exact raw body string supplied by the caller.
- Webhooks remain fail-closed when `PAYMENT_WEBHOOK_ENABLED` is not enabled.
- Missing webhook signatures return `false`.
- Malformed signatures and unequal-length signatures return `false`; `timingSafeEqual` is only called after a length check.
- Missing `RAZORPAY_WEBHOOK_SECRET` in production throws a controlled `PRECONDITION_FAILED` error.
- Valid Razorpay webhook signatures are accepted.

## Payment lifecycle helper behavior

- `markPaymentCaptured` persists captured payment state through the existing payment record path and returns `{ ok: true, status: "persisted" }` only after persistence is attempted.
- `markPaymentFailed` persists failed payment state through the existing payment record path and returns `{ ok: true, status: "persisted" }` only after persistence is attempted.
- `recordPaymentAttempt`, `markPaymentAuthorized`, and `markPaymentRefunded` are not wired to durable lifecycle state yet. In production they throw `NOT_IMPLEMENTED` rather than returning fake success.
- In explicit demo/test mode, unwired lifecycle helpers return `{ ok: false, status: "demo_skipped" }` and do not claim production success.

## Demo/local behavior

- Demo/test behavior is explicit through `PAYMENT_DEMO_MODE=true`, `LOCAL_DEMO_MODE=true`, or `NODE_ENV=test`.
- Demo/test payment verification with missing Razorpay credentials is reported as `demo_skipped`, not `verified`.
- Payment connector order creation and refund no longer produce stub provider IDs when Razorpay credentials are missing.

## Router behavior

- `paymentRouter.verifyPayment` now requires `verification.verified === true` before fetching payment state, capturing payment, advancing order status, or starting the SLA clock.
- Failed, malformed, demo-skipped, or provider-unconfigured verification results are audited as failures and rejected.
- The existing explicit `failPayment` path still marks payment records failed when the caller invokes it.

## Remaining risks

- **P1:** There is no safely wired automatic reservation release in the verification-failure path. This change does not modify reservation internals; operators should continue to use the existing failure path until a dedicated reservation-release integration is added.
- **P1:** Razorpay webhook route enablement remains guarded by `PAYMENT_WEBHOOK_ROUTE_IMPLEMENTED`; this work hardens signature verification but does not claim end-to-end webhook production readiness.
- **P2:** `recordPaymentAttempt`, `markPaymentAuthorized`, and `markPaymentRefunded` still need durable persistence design before they can be enabled in production flows.

## Validation results

- `pnpm install` passed; lockfile was already up to date. pnpm emitted its existing ignored-build-scripts warning for `@tailwindcss/oxide` and `esbuild`.
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed with 54 test files / 212 tests.
- `pnpm run build` passed. Vite emitted existing analytics-placeholder and chunk-size warnings.

## Files changed

- `server/services/paymentGateway.ts`
- `server/routers/paymentRouter.ts`
- `server/connectors.ts` (payment connector block only)
- `server/payment-gateway.guard.test.ts`
- `PAYMENT_PROVIDER_FAILCLOSED_STATUS.md`
