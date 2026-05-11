Accounting Operations Board

Backed endpoints/services:
- /trpc/accountingOps.refundSummary
- /trpc/accountingOps.paymentMethodBreakdown
- /trpc/accountingOps.supplierAgeing
- /trpc/accountingOps.grossMarginSummary
- /trpc/accountingOps.invoiceIntegrity
- export via /trpc/accountingOps.exportReport

Source tables/services:
- orders, order_items, payments, refunds, purchase_invoices, supplier_payments, batches
- services: server/services/accountingLedger.ts, server/services/reconciliationReports.ts, server/services/supplierLedger.ts

Unsupported / unclaimed metrics:
- cashbook running balance (requires bank/Cash ledger integration)
- multi-currency adjustment (not supported)

PHI/PII safety notes:
- All endpoints redact direct PHI (customerName, customerPhone) at router layer or via redactReportPayload.
- Exports default to JSON; CSV export strips PHI where possible. Use audit logs before exporting sensitive manifests.