# OPEN_BLOCKERS

Updated: 2026-05-10.

## P0

- DB-backed concurrency proof is **not claimed** in this checkout because `TEST_DATABASE_URL` is not configured. `pnpm run test:db:concurrency` exits with the MySQL integration suite skipped, so real DB race proof must be run in Docker/CI or another environment with `TEST_DATABASE_URL`.

## P1

- Add safe non-destructive supplier invoice duplicate enforcement/backfill plan before relying on supplier invoice uniqueness in production.
- Extend webhook/refund tests to cover real provider dead-letter retry paths.
- Add accounting journal reversal proof for refunds once journal batches are wired to refund settlement.
- Remove legacy `batches.quantity` mirrors after all inventory readers use canonical `batch_ledger`.

## Completed in this pass

- Purchase commit router now delegates commercial mutation to `commitPurchaseInvoiceExactlyOnce`.
- Sale confirmation router now delegates commercial mutation to `confirmSaleExactlyOnce` after preserving compliance/availability gates.
- Refund success webhooks settle via `settleProviderRefundExactlyOnce`.
- Physical reservation accounting is centralized in `reserveBatchAtomic`, `releaseReservationAtomic`, and `consumeReservationAtomic`; terminal transitions release/consume `batch_ledger.qtyReserved` transactionally and guard against negative reserved/on-hand quantities.
- Governance guard now fails direct `db.update(batchLedger).set({ qtyReserved... })` / `tx.update(batchLedger).set({ qtyReserved... })` outside `stockInvariant`/`reservationService`.
