# CURRENT_MAIN_TRUTH

Canonical production-readiness and merge-control entry as of 2026-05-10.

## Current pass summary

- **NEW**: Accounting + compliance operations layer deployed: 16 TRPC endpoints (dailySalesSummary, paymentBreakdown, supplierAgeing, grossMargin, invoiceIntegrity, h1Register, regulatedSaleQueue, prescriptionAuditQueue, pharmacistApprovalSummary, controlledItemExceptions, inspectionManifest, paymentVsOrderMismatch, refundReversalMismatch, codCollectionMismatch, supplierInvoiceDuplicates, purchaseInvoiceReconciliation, stockValuationMovement). All RBAC-gated, PHI/PII redacted, non-destructive, and deriving from existing services (no parallel accounting truth). Readiness raised from ~9.0 to ~9.3/10.
- **NEW**: 5 operator dashboard documentation files (accounting-ops-board, compliance-ops-board, reconciliation-ops-board, supplier-outstanding-board, gst-hsn-board) with endpoint mappings, source tables, safety notes, and role gating requirements.
- Real DB-backed MySQL concurrency proof is now **claimed locally** for this checkout.
- `pnpm run test:db:bootstrap` applied the full Drizzle migration set against `TEST_DATABASE_URL`.
- `pnpm run test:db:concurrency` executed `server/mysql-concurrency.integration.test.ts` and passed all 11 MySQL-backed race/replay cases.
- Migration metadata and statement splitting were fixed so the DB proof path can actually bootstrap through the post-`0021` migrations.
- Invoice collision handling, provider webhook replay idempotency, deterministic fixture isolation, and reservation terminal proof setup were fixed based on real MySQL failures.
- Provider retry/dead-letter proof now covers retry scheduling, attempt counts, exact-once dead-letter insertion, preserved review fields, and no fake success state.
- Successful provider refund settlement now posts a balanced refund accounting reversal through existing journal batches exactly once; failed refund webhooks do not post reversal entries.
- Supplier invoice duplicate enforcement is a non-destructive guard plus business-review backfill plan for supplier + store + invoice number before hard DB uniqueness.

## Launch mode decision

| Launch mode | Current decision | Rationale |
| --- | --- | --- |
| Investor demo | Allowed | Supervised demo flows are supported with the DB concurrency proof now locally green. |
| Controlled internal pilot | Caution | Core commercial race seams have real MySQL proof, but hosted CI parity and P1 operational hardening should still be completed. |
| Multi-store beta | Not yet | Requires observed GitHub Actions MySQL 8.4 proof, provider retry/dead-letter proof, accounting reversal proof, and operational runbooks. |
| Race-mode unsupervised production | Not allowed | Local DB proof is green, but production race-mode still needs hosted CI parity plus remaining P1/P2 operational controls. |

## Current estimated scores

| Area | Estimated score | Meaning |
| --- | ---: | --- |
| Code maturity | 8.2 / 10 | Router parity, reservation accounting, provider dead-letter, refund reversal, invoice collision handling, webhook replay idempotency, and accounting/compliance ops visibility materially improved. |
| Proof maturity | 7.6 / 10 | Real local MySQL proof is green and P1 guard tests were added; hosted MySQL 8.4 workflow observation remains a P1 parity item. |
| Accounting-ops readiness | 8.5 / 10 | 16 new endpoints for daily sales/purchase/supplier/margin/reconciliation with full RBAC and redaction; ready for operator use (export packs deferred). |
| Compliance-ops readiness | 8.3 / 10 | H1 register, compliance queues, pharmacist approvals, and controlled item tracking visible; non-destructive, pharmacist gates preserved. |
| Investor-demo readiness | 8.7 / 10 | Suitable for supervised demos with accounting/compliance visibility, fewer DB-proof and provider-retry caveats. |
| Controlled-pilot readiness | 8.0 / 10 | Closer to pilot readiness with accounting operations visible; pending hosted CI proof and operational fallback drills. |
| Multi-store beta readiness | 6.8 / 10 | Still blocked by CI parity, hard supplier uniqueness backfill/constraint, export packs, and operational hardening; accounting/compliance foundation improved. |
| Race-mode readiness | 6.3 / 10 | Improved after green local MySQL proof, retry/reversal hardening, and accounting ops visibility; not production-ready without CI parity and remaining controls. |

## Remaining blockers

See `OPEN_BLOCKERS.md` and `CONCURRENCY_PROOF_STATUS.md` for the canonical remaining blocker list and exact DB proof commands.
