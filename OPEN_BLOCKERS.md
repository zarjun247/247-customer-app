# OPEN_BLOCKERS

Updated: 2026-05-10.

## P0

- None currently open for DB-backed concurrency proof. Local real MySQL execution previously passed `pnpm run test:db:bootstrap` and `pnpm run test:db:concurrency` with 11/11 MySQL harness cases green.

## P1

- Incident Command Center remains foundation-only: first-class incident records, SLA breach counters, provider heartbeat rollups, stock anomaly rules, and audit anomaly rules still need real runtime implementations before launch claims.
- Observe the GitHub Actions MySQL 8.4 `DB Concurrency Proof` workflow green for hosted-runner parity. CI MySQL 8.4 parity run still needs observation.
- Supplier invoice uniqueness is guarded at the purchase commit seam for future committed invoices, but hard DB uniqueness still needs a business-review backfill before adding a destructive-risk unique constraint. The target key is supplier + store + invoice number.
- Remove legacy `batches.quantity` mirrors after all inventory readers use canonical `batch_ledger`.

## Completed in this pass

- Hardened observability foundation: `/metrics` and `/api/observability/*` are staff/admin gated, HTTP telemetry is structured and redacted, provider/dead-letter metrics derive from durable provider/worker tables, and fake/unbacked dashboard claims were removed.
- Added provider retry/dead-letter proof: provider failures remain tied to `provider_webhook_events`, retry scheduling records `retry_scheduled` and increments `attemptCount`, and exhaustion inserts into `provider_dead_letters` exactly once through `uq_provider_dead_letters_event`.
- Added provider dead-letter operator-review fields and duplicate-dead-letter protection; retry/dead-letter paths return `emittedSuccess: false` and do not claim fake provider success.
- Wired refund settlement to post a balanced accounting refund reversal batch through the existing `accounting_journal_batches` / `accounting_journal_entries` ledger once a provider refund succeeds.
- Added refund reversal guard proof that replay returns before posting another journal batch, failed/refused refund webhook handling does not post accounting entries, and journal totals balance.
- Added a non-destructive supplier invoice duplicate plan/guard: future commits are blocked when another committed/returned invoice already has the same supplier + store + invoice number, while existing dirty data is preserved for business-review backfill.

## Previously completed and still relevant

- Executed real DB-backed concurrency proof against local MySQL with `TEST_DATABASE_URL` set.
- Fixed Drizzle migration journal and SQL statement-breakpoint issues so `pnpm run test:db:bootstrap` applies migrations through `0048`.
- Fixed DB harness safety setup, unique fixture seeding, invoice collision handling, webhook replay idempotency, and the reservation terminal race fixture.
- Verified `server/mysql-concurrency.integration.test.ts` passes all 11 MySQL-backed proof cases.
- Purchase commit router delegates commercial mutation to `commitPurchaseInvoiceExactlyOnce`.
- Sale confirmation router delegates commercial mutation to `confirmSaleExactlyOnce` after preserving compliance/availability gates.
- Refund success webhooks settle via `settleProviderRefundExactlyOnce`.
- Physical reservation accounting is centralized in `reserveBatchAtomic`, `releaseReservationAtomic`, and `consumeReservationAtomic`; terminal transitions release/consume `batch_ledger.qtyReserved` transactionally and guard against negative reserved/on-hand quantities.
- Governance guard fails direct `db.update(batchLedger).set({ qtyReserved... })` / `tx.update(batchLedger).set({ qtyReserved... })` outside `stockInvariant`/`reservationService`.
