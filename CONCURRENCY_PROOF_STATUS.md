# CONCURRENCY_PROOF_STATUS

Updated: 2026-05-10 on branch `codex/stock-reservation-concurrency-proof`.

## Baseline map before edits

- Existing durable idempotency lived in `idempotency_keys` with `key + scope` uniqueness, request hashes, stored result JSON, `started/completed/failed` states, and replay via `withIdempotency`.
- Existing duplicate-prevention constraints already covered provider webhook `provider + providerEventId`, provider webhook `provider + idempotencyKey`, refund `provider + providerRefundId`, sales bill number, invoice sequence, and H1 sale-line uniqueness.
- Purchase commit and sale confirmation were router/session-coupled. They used idempotency but had no small exported service seam for DB-backed tests.
- Provider webhook processing had an exported raw-body seam, but duplicate insert races could surface as duplicate-key errors instead of deterministic reuse.
- Refund amount protection existed in `refundService`, but aggregate over-refund proof needed a transaction/row-lock seam.
- Reservation terminal transitions updated only `active` rows, but callers could not inspect the deterministic winner.

## Service seams added or normalized

- `commitPurchaseInvoiceExactlyOnce` commits one purchase invoice through the canonical idempotency table and routes stock increase through `stockInvariant`.
- `confirmSaleExactlyOnce` confirms one sale through the canonical idempotency table, allocates invoice numbers, routes stock decrement through `stockInvariant`, and writes one counter payment.
- `handleRazorpayWebhook` now catches provider-event duplicate-key races and reloads the existing event row for deterministic replay handling.
- `settleProviderRefundExactlyOnce` locks the payment row, checks aggregate refundable amount, enforces provider refund uniqueness, and writes exactly one successful refund ledger row.
- `claimReservationTerminalState` exposes the active-reservation terminal transition and returns whether the caller won the race.

## DB-backed tests now present

These tests are in `server/mysql-concurrency.integration.test.ts` and run only when `TEST_DATABASE_URL` is set:

1. Last-unit reservation race.
2. POS sale vs app reservation last-unit race.
3. Concurrent invoice number reservations.
4. Provider webhook uniqueness constraint.
5. Refund provider-id uniqueness constraint.
6. H1 sale-line uniqueness constraint.
7. Purchase commit double-submit through service seam.
8. Sale confirmation double-submit through service seam.
9. Full payment captured webhook replay through raw-body webhook seam.
10. Concurrent over-refund prevention through row-locked refund settlement seam.
11. Reservation payment-vs-expiry terminal transition race.

## Remaining unproven guarantees

- The new purchase and sale service seams prove exported DB-backed paths, but the original routers are not fully refactored to call those seams yet. Router parity should be the next hardening sprint before broad production claims.
- Purchase invoice supplier uniqueness is still not enforced by a destructive or backfilled schema constraint; this sprint avoided migration risk.
- DB proof must not be claimed in environments where `TEST_DATABASE_URL` is absent.

## Current production-readiness score

- Commercial-truth proof maturity: **5.8 / 10** when the DB-backed harness passes against MySQL.
- Race-mode production readiness: **4.0 / 10** until router parity, complete reservation quantity release/consume accounting, and CI DB proof are all green.
