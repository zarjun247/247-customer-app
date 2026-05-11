Compliance Operations Board

Backed endpoints/services:
- /trpc/complianceOps.regulatedSaleReviewQueue
- /trpc/complianceOps.prescriptionAuditQueue
- /trpc/complianceOps.pharmacistApprovalSummary
- /trpc/complianceOps.controlledItemExceptions
- /trpc/complianceOps.inspectionExportManifest

Source tables/services:
- orders, h1_register, products, order_items
- services: server/services/complianceGate.ts, server/services/prescriptionVault.ts, server/services/reconciliationReports.ts

Unsupported / unclaimed metrics:
- Clinical decision logs (out of scope for accounting sprint)

PHI/PII safety notes:
- Regulated queues return only non-identifiable metadata; patient names/phones are removed.
- Inspection manifest includes counts and ids only — do NOT include prescriptions or patient identifiers without auditor-approved export flows.