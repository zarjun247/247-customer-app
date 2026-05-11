Status: Partial — refund and payment event append progress

Implemented (this PR #155):
- refund settlement (settleProviderRefundExactlyOnce) now appends refund_completed event within the same DB transaction using appendCommercialEventWithDb. This ensures the canonical refund event and accounting entries are persisted atomically.
- payment capture (confirmPaymentRecord) updated to persist payment_verified event inside a DB.transaction using appendCommercialEventWithDb; payment record updates and the canonical payment event are now in the same transactional boundary.

Tests added in this PR:
- server/services/appendCommercialEventWithDb.test.ts — unit tests for appendCommercialEventWithDb behavior and idempotency-key suppression.
- server/transactional.guard.test.ts — guard confirming commercialTruthSeams references appendCommercialEventWithDb for refunds.
- server/guards/payment_webhook.guard.test.ts — guard ensuring payment webhook lifecycle uses idempotency and routes refunds to settlement path.
- server/guards/sealed_paths.guard.test.ts — guards asserting sealed refund/payment paths use transactional append (no best-effort event append).

Remaining blockers / next work (open):
- Sale confirmation: currently confirmSaleExactlyOnce still uses appendCommercialEventBestEffort; stock mutation (decreaseStockForSaleConfirmation) uses its own transaction and therefore sale confirmation lacks a single transactional boundary. Resolving this requires refactoring stockInvariant.applyStockMovement to support caller-provided tx or consistent transactional composition. Not implemented in this PR.
- Purchase commit: intentionally not modified in this PR per scope.
- Outbox: separate outbox orchestration and dead-letter handling for durable downstream side-effects (next PR).
- Replay & forensic tests: add DB-backed replay tests simulating webhook replay, duplicate callbacks, and settlement collision using TEST_DATABASE_URL; these require CI/test DB configuration.

Status summary:
- Implemented: refund transaction-scoped canonical event append; payment capture transaction-scoped canonical event append; unit/guard tests added.
- Not implemented: sale transactional sealing, outbox orchestration, full replay proofs (DB-backed tests require TEST_DATABASE_URL). 

PR is still WIP for Mega Sprint 1 — this PR incrementally seals refund & payment paths and adds targeted tests; further work will follow in small PRs.
