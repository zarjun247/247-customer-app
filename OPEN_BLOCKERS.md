# OPEN_BLOCKERS

Updated: 2026-05-10.

## P0

- None currently open for DB-backed concurrency proof. Local real MySQL execution passed `pnpm run test:db:bootstrap` and `pnpm run test:db:concurrency` with 11/11 MySQL harness cases green.

## P1

- Observe the GitHub Actions MySQL 8.4 `DB Concurrency Proof` workflow green for hosted-runner parity.
- Add safe non-destructive supplier invoice duplicate enforcement/backfill plan before relying on supplier invoice uniqueness in production.
- Extend webhook/refund tests to cover real provider dead-letter retry paths.
- Add accounting journal reversal proof for refunds once journal batches are wired to refund settlement.
- Remove legacy `batches.quantity` mirrors after all inventory readers use canonical `batch_ledger`.

## Completed in this pass

- Executed real DB-backed concurrency proof against local MySQL with `TEST_DATABASE_URL` set.
- Fixed Drizzle migration journal and SQL statement-breakpoint issues so `pnpm run test:db:bootstrap` applies migrations through `0048`.
- Fixed DB harness safety setup, unique fixture seeding, invoice collision handling, webhook replay idempotency, and the reservation terminal race fixture.
- Verified `server/mysql-concurrency.integration.test.ts` passes all 11 MySQL-backed proof cases.

## Previously completed and still relevant

- Purchase commit router delegates commercial mutation to `commitPurchaseInvoiceExactlyOnce`.
- Sale confirmation router delegates commercial mutation to `confirmSaleExactlyOnce` after preserving compliance/availability gates.
- Refund success webhooks settle via `settleProviderRefundExactlyOnce`.
- Physical reservation accounting is centralized in `reserveBatchAtomic`, `releaseReservationAtomic`, and `consumeReservationAtomic`; terminal transitions release/consume `batch_ledger.qtyReserved` transactionally and guard against negative reserved/on-hand quantities.
- Governance guard fails direct `db.update(batchLedger).set({ qtyReserved... })` / `tx.update(batchLedger).set({ qtyReserved... })` outside `stockInvariant`/`reservationService`.
