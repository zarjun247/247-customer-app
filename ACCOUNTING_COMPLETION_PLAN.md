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
