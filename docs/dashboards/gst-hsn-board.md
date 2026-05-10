GST / HSN Board

Backed endpoints/services:
- /trpc/reports.gstSummary
- /trpc/reports.dailySaleGst

Source tables/services:
- orders, order_items, products, h1_register
- services: server/services/reconciliationReports.ts

Unsupported / unclaimed metrics:
- GSTR filing payload generation (out of scope for sprint)

PHI/PII safety notes:
- GST/HSN reports aggregate at product/HSN levels and do not include patient identifiers. Ensure invoice-level exports are audited.