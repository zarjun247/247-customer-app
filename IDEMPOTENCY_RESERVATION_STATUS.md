# IDEMPOTENCY + RESERVATION STATUS

## Branch cleanup
- Replayed Prompt 5 idempotency/reservation work onto clean branch `feat/idempotency-reservation-truth-clean` (no scope broadening).

## Wired in this correction
- Purchase commit (`purchaseRouter.commitInvoice`): wrapped in `withIdempotency` using deterministic key `purchase:commit:<invoiceId>:<requestId|no-request-id>`; duplicate committed invoice returns existing committed state and skips stock/payable rerun.
- Sale confirm (`salesRouter.confirmSale`): wrapped in `withIdempotency` using deterministic key `sale:confirm:<saleId>:<requestId|no-request-id>`; `confirmed` status returns idempotent response, preventing duplicate stock deduction and discount usage.
- Payment verify (`paymentRouter.verifyPayment`): wrapped in `withIdempotency` keyed by `gatewayOrderId+gatewayPaymentId`; if payment already `paid`, returns idempotent success and does not re-advance order/SLA.
- Delivery delivered (`deliveryRouter.deliverWithOtp` + `deliverWithPhoto`): delivered-status short-circuit returns idempotent success and skips duplicate close/log transitions.
- Stock audit correction (`inventoryRouter.complete`): completed-status short-circuit returns idempotent response and skips reapplying corrections.
- OCR purchase draft commit (`ocrIngestionRouter.commitDraft`): committed-status short-circuit returns existing invoice binding.

## Reservation truth wiring
- Real route wiring added in sale confirmation path: each sale line now checks `getCanonicalAvailability` before commit.
- Canonical formula remains: `availableQty = onHandQty - reservedQty - softLockedQty - quarantinedQty - expiredQty`.

## Deferred paths
- Sale return/cancel/refund full idempotent wrappers (status guards exist in parts; full parity deferred).
- Full DB row-locking/CAS across all critical mutation paths.
- Full payment webhook replay ledger beyond verify path.
- Full reservation lifecycle persistence across all flows.

## Duplicate behavior summary
- Duplicate completed op => idempotent success with existing state for the above wired paths.
- Duplicate in-progress op => conflict via central idempotency service contract.

## Validation
- pnpm install
- pnpm run check
- pnpm test -- --runInBand
- pnpm run build

Next recommended prompt: `feat/stock-truth-10`.
