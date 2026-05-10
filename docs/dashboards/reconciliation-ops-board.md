Reconciliation Operations Board

Backed endpoints/services:
- /trpc/reconciliation.paymentVsOrderMismatch
- /trpc/reconciliation.refundReversalMismatch
- /trpc/reconciliation.codCollectionMismatch
- /trpc/reconciliation.supplierInvoiceDuplicateWarnings
- /trpc/reconciliation.purchaseInvoiceReconciliationStatus
- /trpc/reconciliation.stockValuationMovementSummary

Source tables/services:
- orders, payment_records, payments, accounting_journal_entries, accounting_journal_batches, purchase_invoices, batches, stock_movements
- services: server/services/accountingLedger.ts, server/services/reconciliationReports.ts, server/services/supplierLedger.ts

Unsupported / unclaimed metrics:
- Automated remediation suggestions (out of scope)

PHI/PII safety notes:
- Reconciliation reports redact customer identifiers and only expose minimal invoice/order ids for investigation. Exports are audit-logged.