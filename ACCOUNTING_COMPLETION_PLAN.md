ACCOUNTING COMPLETION PLAN

Objective: Provide minimal, auditable accounting exports and ledgers required for GST/Tally and regulatory reporting.

Required ledgers:
- Sales ledger (invoices, saleLines, payments)
- Purchase ledger (supplier invoices, batches)
- Stock movement ledger (batchLedger + stockMovements)
- Audit trail ledger (auditLogs)

GST exports:
- Daily/Monthly GST summary: taxable value, GST amounts by HSN/GST rate
- HSN reports mapping products to HSN codes

HSN reports:
- Product-level HSN mapping report; flag missing HSN for manual review

Accountant email reports:
- Weekly reconciliation CSV of sales/purchase and payments

Daily/weekly/monthly reports:
- Daily: sales summary, stock movement summary
- Weekly: pending invoices, reconciliation exceptions
- Monthly: GST export, ledger closing

Tally export requirements:
- Provide CSV exports matching Tally import schema

Audit trail requirements:
- Every financial action must have audit log record (actor, action, before/after)

Reconciliation truth requirements:
- Reconciliation report must identify negative_on_hand, reserved_exceeds_on_hand, ledger mismatch

Next steps:
- Implement exports, add tests, and integrate into release gating

Notes (2026-05-10):
- Refund accounting reversal: service-level posting of a balanced refund journal batch has been added to the refund success lifecycle. The batch is posted only once per refund via existing `accounting_journal_batches` source uniqueness semantics and a service-level idempotency guard. This avoids destructive migrations while ensuring linkage from refund -> posted journal batch.
- Backfill plan: a separate non-destructive backfill must be prepared to group legacy orphan entries into balanced posted batches where possible. This backfill requires manual reconciliation and should be executed under a controlled script that inserts `accounting_journal_batches` rows and updates `accounting_journal_entries.journalBatchId` only when debit == credit for a source event. Do not run the backfill without accounting sign-off.
- Next test steps: add DB-backed guard tests for refund journal posting and audit the `accounting_journal_batches` UQ before any migration that enforces uniqueness at the schema level.
