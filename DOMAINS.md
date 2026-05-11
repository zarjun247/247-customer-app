# Schema Domains

Schema split: `drizzle/schema.ts` (3202 lines) → 11 domain files in `drizzle/schema/`.
Barrel: `drizzle/schema/index.ts` re-exports from all domain files. All import paths unchanged.

## Domain Files

### `identity.ts` — Auth & Tenancy (8 tables)
`users`, `buildings`, `stores`, `staffAssignments`, `otpCodes`, `staffMaster`, `storeCapabilities`, `states`

Core authentication entities. Users can be customers or staff. Staff are scoped to a store via `staffAssignments`. OTP codes support phone-based login.

### `catalog.ts` — Product Catalog (10 tables)
`products`, `productVariants`, `storeSkus`, `productAliases`, `productSupplierMappings`, `productLocks`, `productBarcodes`, `productMarginRules`, `manufacturers`, `drugCategories`

Products are global; `storeSkus` holds per-store availability and pricing. Barcodes and aliases enable multi-code scanning.

### `inventory.ts` — Stock & Movements (10 tables)
`batches`, `batchLedger`, `stockMovements`, `stockAdjustments`, `stockReservations`, `stockTransfers`, `stockAudits`, `stockAuditLines`, `batchQuarantineLogs`, `expiryActions`

Batch-level stock truth. All quantity changes go through `stockMovements` (append-only ledger). `batchLedger.qtyOnHand` is maintained by triggers on `stockMovements`. `stockReservations` holds soft-locks for in-flight orders.

### `orders.ts` — Customer Orders (4 tables)
`orders`, `orderItems`, `cartItems`, `slaEvents`

Cart-to-order lifecycle. Orders reference `orderItems` which link to `storeSkus`. SLA events track delivery timing obligations.

### `sales.ts` — Counter Billing (11 tables)
`sales`, `saleLines`, `counterPayments`, `refunds`, `paymentRecords`, `saleReturns`, `saleReturnLines`, `creditNotes`, `invoiceSnapshots`, `invoiceSequences`, `shiftClosings`

Over-the-counter and FEFO-driven billing. `invoiceSequences` issues statutory bill numbers. `invoiceSnapshots` provides immutable PDF evidence. `shiftClosings` captures end-of-day cash reconciliation.

### `purchase.ts` — Supplier & Purchase (17 tables)
`suppliers`, `purchaseOrders`, `poItems`, `grnRecords`, `purchaseInvoices`, `purchaseLines`, `purchaseReturns`, `purchaseReturnLines`, `supplierPayments`, `supplierPaymentAllocations`, `refillReminders`, `vendors`, `financialYears`, `h1Register`, `accountingJournalBatches`, `accountingJournalEntries`, `tallyExportRuns`

Full procure-to-pay cycle. `h1Register` provides Schedule H/H1 statutory records. Double-entry accounting via `accountingJournalEntries`; `tallyExportRuns` tracks Tally CSV exports.

### `prescriptions.ts` — Prescription Vault (5 tables)
`prescriptions`, `rxPriorApprovals`, `rxComplianceLog`, `prescriptionLines`, `prescriptionAccessLog`

Prescription lifecycle: upload → prior approval → dispense → compliance log. `prescriptionAccessLog` audits every access for DPDP compliance.

### `delivery.ts` — Delivery & WhatsApp (15 tables)
`riders`, `deliveryEvents`, `deliveryOtps`, `routingDecisions`, `deliveryTasks`, `riderLocations`, `orderTimestamps`, `whatsappSessions`, `whatsappLinks`, `whatsappMessages`, `whatsappCarts`, `whatsappCartLines`, `wabaMessageTemplates`, `staffHandoffs`, `whatsappWebhookLog`

Rider assignment, OTP-verified handoff, and WhatsApp conversational commerce channel.

### `compliance.ts` — Audit & RBAC (11 tables)
`auditLogs`, `commercialEvents`, `privacyConsents`, `staffAcknowledgements`, `staffDeviceSessions`, `auditLogChain`, `piiEncryptionKeys`, `capabilityDefinitions`, `capabilityGrants`, `commandLog`, `commandOutbox`

Immutable audit trail with SHA-256 hash chain (`auditLogChain`). DPDP consent records. Capability-based RBAC grants. Transactional outbox for command dispatch.

### `intelligence.ts` — AI & OCR (17 tables)
`metricsEvents`, `medivisionSyncLog`, `ingestionJobs`, `ingestionFiles`, `ocrExtractedHeaders`, `ocrExtractedLines`, `skuCreationDrafts`, `purchaseDrafts`, `purchaseDraftLines`, `ocrMatchCandidates`, `ocrReviewTasks`, `aiDecisions`, `invoiceIngestions`, `ocrJobs`, `humanReviewItems`, `aiEvalLedger`, `aiEvalOutcomes`

OCR purchase invoice ingestion pipeline. AI decision ledger with human-in-the-loop review. `aiEvalLedger` records every AI suggestion with operator outcomes for continuous evaluation.

### `system.ts` — Infrastructure (20 tables)
`systemEvents`, `workerJobs`, `sloEvents`, `reservations`, `reservationLines`, `stockLockKeys`, `ledgers`, `ledgerEntries`, `reportExports`, `systemSettings`, `workflowEvents`, `userImportanceScores`, `helpdeskTickets`, `doctorConsultRequests`, `printers`, `idempotencyKeys`, `providerWebhookEvents`, `providerDeadLetters`, `notificationEvents`, `notificationPreferences`

Cross-cutting infrastructure: SLO tracking, idempotency keys (unique-per-request mutation guards), provider webhook deduplication, notification preferences, worker job queue, and general ledger entries.

## Table Count

| Domain | Tables |
|---|---|
| identity | 8 |
| catalog | 10 |
| inventory | 10 |
| orders | 4 |
| sales | 11 |
| purchase | 17 |
| prescriptions | 5 |
| delivery | 15 |
| compliance | 11 |
| intelligence | 17 |
| system | 20 |
| **Total** | **128** |
