Supplier Outstanding Board

Backed endpoints/services:
- /trpc/reports.supplierOutstanding
- /trpc/accountingOps.supplierAgeing

Source tables/services:
- purchase_invoices, supplier_payments, purchase_returns, suppliers
- services: server/services/supplierLedger.ts

Unsupported / unclaimed metrics:
- Supplier credit-term analytics (requires AP terms data)

PHI/PII safety notes:
- Supplier names are business entities and included. No patient PHI is used in supplier reports.