# Refund Ledger Status — P20-08

## Schema fields added/confirmed

Added a real `refunds` ledger table in `drizzle/0035_refund_ledger.sql` and `drizzle/schema.ts` with:

- `id`
- `paymentId`
- `orderId` nullable
- `saleId` nullable
- `provider`
- `providerRefundId` nullable
- `amountPaise`
- `status`: `pending`, `success`, `failed`, `cancelled`
- `reason` nullable
- `creditNoteId` nullable
- `initiatedBy` nullable
- `failureReason` nullable
- `createdAt`
- `updatedAt`

A composite unique key on `provider + providerRefundId` protects against duplicate provider refund identifiers. MySQL allows multiple `NULL` values in a unique index, so pending/manual rows without provider IDs remain insertable.

## Refund lifecycle

1. `initiateRefundRecord` validates the amount against the payment and inserts a pending row into `refunds`.
2. `initiateRefund` keeps the existing provider boundary compatible:
   - If Razorpay credentials are not configured, the ledger row remains `pending` with provider state `provider_not_configured`; no fake success is recorded.
   - If credentials are configured and a `gatewayPaymentId` exists, the current `paymentConnector.refund` call is used without changing connector behavior.
   - Provider processed/success statuses call `markRefundSuccess` and persist `providerRefundId`.
   - Provider failures call `markRefundFailedRecord` and persist `status = failed` plus `failureReason`.
3. `markRefundSuccess`, `markRefundFailedRecord`, `getRefundsForPayment`, and `getRefundTotalByPayment` are the service-level ledger primitives.
4. Existing legacy wrappers (`markRefundSucceeded`, `markRefundFailed`, `verifyRefundStatus`) now read/write the refund ledger rather than encoding refund truth into `payment_records.failureReason`.

## Partial/multiple refund behavior

- Multiple refund rows can exist for the same `paymentId`.
- Partial refunds are supported by storing each refund's own `amountPaise`.
- Refund allowance is computed from the paid amount minus existing `success` + `pending` refund rows.
- Pending refunds count toward consumed refundable amount, blocking concurrent over-refunds.
- `failed` and `cancelled` rows do not consume refundable amount.
- Over-refund attempts throw `BAD_REQUEST` with `Refund exceeds available paid amount`.

## Provider failure behavior

- Provider failure never marks a refund as successful.
- Failed provider calls persist a failed row and `failureReason` in the `refunds` table.
- Missing provider configuration leaves the refund pending/manual rather than faking success.
- Provider connector behavior was not redesigned or edited in this branch.

## Credit note dependency

- `creditNoteId` is present and nullable on refund rows.
- Full credit-note issuance/lifecycle is not implemented in this branch.
- A future credit-note branch should create/validate credit notes and then link their IDs to refund rows.

## Migration/backfill notes

- New migration: `drizzle/0035_refund_ledger.sql`.
- Backward-compatible create-table migration only; no destructive changes.
- Existing historical `payment_records.refundId/refundedAt/status` data is not backfilled into `refunds` in this branch. If production has historical refunds, add an operational backfill that inserts one ledger row per historical payment refund before relying on ledger-only reporting.

## Validation results

- `pnpm install`: passed; pnpm reported ignored build scripts for `@tailwindcss/oxide` and `esbuild`.
- `pnpm run check`: passed.
- `pnpm test -- --runInBand`: passed after adding refund-ledger tests.
- `pnpm run build`: passed; Vite reported existing analytics env placeholder and chunk-size warnings.

## Files changed

- `drizzle/schema.ts`
- `drizzle/0035_refund_ledger.sql`
- `server/services/refundService.ts`
- `server/routers/paymentRouter.ts`
- `server/refund-ledger.test.ts`
- `server/refund-ledger.guard.test.ts`
- `REFUND_LEDGER_STATUS.md`

## Remaining risks

- P0: None known in this branch after validation.
- P1: Historical refunds still need a production backfill plan if existing payment rows already contain refund summaries.
- P1: Provider pending statuses may need webhook/reconciliation follow-up to advance pending rows to success/failed asynchronously.
- P2: `creditNoteId` is a compatibility hook only; full credit-note lifecycle remains dependent on the separate credit-note implementation.
