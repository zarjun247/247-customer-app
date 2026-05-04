# PAYMENT_GATEWAY_STATUS

## Scope
Prompt 9 correction: webhook route posture + refund safety + payment report/status honesty.

## Webhook route status
- Dedicated **payment webhook route is not implemented** in current server routing.
- Current architecture has no raw-body payment webhook endpoint wired in `server/_core/index.ts` for gateway callbacks.
- Production posture is now fail-closed via env validation marker: if `PAYMENT_WEBHOOK_ENABLED=true` and `PAYMENT_WEBHOOK_ROUTE_IMPLEMENTED!=true`, boot fails with `PAYMENT_WEBHOOK_ENABLED_UNSUPPORTED_WITHOUT_VERIFIED_ROUTE`.
- Until route implementation is merged, `PAYMENT_WEBHOOK_ENABLED` must stay `false` in production.

## Refund execution status
- Gateway refund API execution is still not implemented in this PR.
- `initiateRefund` now records provider state as `pending_provider` or `provider_not_configured`, returns pending status, and does not mark success prematurely.
- `markRefundSucceeded` is the only path that sets `status=refunded`.
- Failed/provider-gap path returns `manual_required` and emits `refund.failed`.

## Refund ledger safety
- Duplicate refund IDs are rejected with `refund.duplicate_detected` audit.
- Refund amount guard exists (`assertRefundAmountAllowed`) and rejects amount above paid minus previously-refunded amount.
- Refund status metadata is stored as provider-state marker in payment record `failureReason` until gateway settlement is confirmed.

## Payment release policy status
- `assertPaymentCanRelease` helper exists for prepaid-vs-COD release checks.
- Delivery route is not yet wired to this helper; regulated release gates remain separate and additional.
- Enforcement status is partial and explicitly documented (not claimed complete).

## Settlement/report honesty
- Canonical reconciliation still uses sales/counter-payment truth.
- Deferred report normalization (not complete):
  - dedicated online settlement report
  - refund settlement rollup report
  - payment variance report
- Existing migrated report endpoints should continue returning `{ rows, totals, csvData }` where already implemented.

## Validation
- `pnpm install`
- `pnpm run check`
- `pnpm test -- --runInBand`
- `pnpm run build`

## Next recommended prompt
`feat/invoice-statutory-billing`
