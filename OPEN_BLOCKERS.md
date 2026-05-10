# OPEN_BLOCKERS

Updated: 2026-05-10.

## P0

- DB-backed concurrency proof is **not claimed locally** in this checkout because `TEST_DATABASE_URL` is not configured and Docker is unavailable. The exact proof path now exists in CI via `.github/workflows/concurrency-proof.yml`, but a green workflow run is still required before marking the DB race-proof gap closed.

## P1

- Add safe non-destructive supplier invoice duplicate enforcement/backfill plan before relying on supplier invoice uniqueness in production.
- Extend webhook/refund tests to cover real provider dead-letter retry paths.
- Add accounting journal reversal proof for refunds once journal batches are wired to refund settlement.
- Remove legacy `batches.quantity` mirrors after all inventory readers use canonical `batch_ledger`.

## Completed in this pass

- Restored `scripts/repo-governance-audit.mjs` and wired it into validation documentation.
- Restored CI DB concurrency evidence path in `.github/workflows/concurrency-proof.yml` with MySQL 8.4, migration bootstrap, and `pnpm run test:db:concurrency`.
- Documented `TEST_DATABASE_URL`, the local Docker MySQL path, CI proof path, and no-proof-when-skipped rule.

## Previously completed and still relevant

- Purchase commit router delegates commercial mutation to `commitPurchaseInvoiceExactlyOnce`.
- Sale confirmation router delegates commercial mutation to `confirmSaleExactlyOnce` after preserving compliance/availability gates.
- Refund success webhooks settle via `settleProviderRefundExactlyOnce`.
- Physical reservation accounting is centralized in `reserveBatchAtomic`, `releaseReservationAtomic`, and `consumeReservationAtomic`; terminal transitions release/consume `batch_ledger.qtyReserved` transactionally and guard against negative reserved/on-hand quantities.
- Governance guard fails direct `db.update(batchLedger).set({ qtyReserved... })` / `tx.update(batchLedger).set({ qtyReserved... })` outside `stockInvariant`/`reservationService`.
