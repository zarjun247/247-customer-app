# OPEN_BLOCKERS

Updated: 2026-05-11.

## Pre-existing test failures observed during PR #155 (logged 2026-05-11)

All 12 suites below failed during the PR #155 test run and were confirmed
pre-existing (present on origin/main or attributable to collection environment,
not to code introduced in #155). See evidence/pr155-prexisting-bisect.txt and
evidence/pr155-introduced-recheck.json for full analysis.

- server/accounting-compliance.guard.test.ts — cause: ReferenceError: describe is not defined; file uses describe/test without importing them from vitest
- server/ci-governance-guards.guard.test.ts — cause: SyntaxError: cannot statically import .mjs (scripts/ci-governance-guards.mjs) from a TypeScript vitest test file
- server/ocr-production-safety.test.ts — cause: SyntaxError: same .mjs static import issue
- server/auth.logout.test.ts — cause: bisect artifact; fails only under NODE_ENV=production (assertProductionEnvSafe at module load); passes cleanly in standard test environment
- server/auth.phone.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/connectors.failclosed.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/ingestion.helpdesk.consent.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/mysql-concurrency.integration.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; skips cleanly (TEST_DATABASE_URL unset) in standard test environment
- server/payment-gateway.guard.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/payment-webhook-lifecycle.guard.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/pharmacy.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment
- server/refund-ledger.test.ts — cause: bisect artifact; same NODE_ENV=production env-gate; passes cleanly in standard test environment

## P0

- None currently open for DB-backed concurrency proof. Local real MySQL execution previously passed `pnpm run test:db:bootstrap` and `pnpm run test:db:concurrency` with 11/11 MySQL harness cases green.

## P1

- Observe the GitHub Actions MySQL 8.4 `DB Concurrency Proof` workflow green for hosted-runner parity. CI MySQL 8.4 parity run still needs observation.
- Supplier invoice uniqueness is guarded at the purchase commit seam for future committed invoices, but hard DB uniqueness still needs a business-review backfill before adding a destructive-risk unique constraint. The target key is supplier + store + invoice number.
- Remove legacy `batches.quantity` mirrors after all inventory readers use canonical `batch_ledger`.

## Completed in this pass

- Added accounting + compliance operations layer: 16 TRPC endpoints across 3 routers covering daily sales/purchase summaries, payment breakdown, supplier ageing, GST/HSN, H1 register visibility, compliance queues, reconciliation boards, and stock valuation reports. All endpoints RBAC-gated, PHI/PII redacted, non-destructive, and deriving from existing services (no parallel accounting truth).
- All 5 dashboard documentation files (accounting-ops-board, compliance-ops-board, reconciliation-ops-board, supplier-outstanding-board, gst-hsn-board) created with endpoint mappings, source tables, safety notes, and role gating requirements.
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
