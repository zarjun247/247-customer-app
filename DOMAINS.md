# Schema Domains

Schema split: `drizzle/schema/system.ts` → 13 domain files in `drizzle/schema/`.
Barrel: `drizzle/schema/index.ts` re-exports from all domain files. All import paths unchanged.
**Total tables: 152** (regenerated 2026-05-12 by scripts/regenerate-domains-md.mjs)

## Domain Files

### `catalog.ts` — Product Catalog (10 tables)
`products`, `productVariants`, `storeSkus`, `productAliases`, `productSupplierMappings`, `productLocks`, `productBarcodes`, `productMarginRules`, `manufacturers`, `drugCategories`

Products are global; `storeSkus` holds per-store availability and pricing. Barcodes and aliases enable multi-code scanning.

### `compliance.ts` — Audit, RBAC & DPDP (13 tables)
`auditLogs`, `commercialEvents`, `privacyConsents`, `staffAcknowledgements`, `staffDeviceSessions`, `auditLogChain`, `piiEncryptionKeys`, `capabilityDefinitions`, `capabilityGrants`, `commandLog`, `commandOutbox`, `consentNoticeVersions`, `dsrRequests`

Immutable audit trail with SHA-256 hash chain (`auditLogChain`). DPDP consent records (`consentNoticeVersions`, `dsrRequests`). Capability-based RBAC grants. Transactional outbox for command dispatch (SM-B).

### `delivery.ts` — Delivery & WhatsApp (15 tables)
`riders`, `deliveryEvents`, `deliveryOtps`, `routingDecisions`, `deliveryTasks`, `riderLocations`, `orderTimestamps`, `whatsappSessions`, `whatsappLinks`, `whatsappMessages`, `whatsappCarts`, `whatsappCartLines`, `wabaMessageTemplates`, `staffHandoffs`, `whatsappWebhookLog`

Rider assignment, OTP-verified handoff, and WhatsApp conversational commerce channel.

### `identity.ts` — Auth & Tenancy (8 tables)
`users`, `buildings`, `stores`, `staffAssignments`, `otpCodes`, `staffMaster`, `storeCapabilities`, `states`

Core authentication entities. Users can be customers or staff. Staff are scoped to a store via `staffAssignments`. OTP codes support phone-based login.

### `intelligence.ts` — AI & OCR (17 tables)
`metricsEvents`, `medivisionSyncLog`, `ingestionJobs`, `ingestionFiles`, `ocrExtractedHeaders`, `ocrExtractedLines`, `skuCreationDrafts`, `purchaseDrafts`, `purchaseDraftLines`, `ocrMatchCandidates`, `ocrReviewTasks`, `aiDecisions`, `invoiceIngestions`, `ocrJobs`, `humanReviewItems`, `aiEvalLedger`, `aiEvalOutcomes`

OCR purchase invoice ingestion pipeline. AI decision ledger with human-in-the-loop review. `aiEvalLedger` records every AI suggestion with operator outcomes for continuous evaluation.

### `inventory.ts` — Stock & Movements (10 tables)
`batches`, `batchLedger`, `stockMovements`, `stockAdjustments`, `stockReservations`, `stockTransfers`, `stockAudits`, `stockAuditLines`, `batchQuarantineLogs`, `expiryActions`

Batch-level stock truth. All quantity changes go through `stockMovements` (append-only ledger). `batchLedger.qtyOnHand` is maintained by triggers on `stockMovements`. `stockReservations` holds soft-locks for in-flight orders.

### `orders.ts` — Customer Orders (4 tables)
`orders`, `orderItems`, `cartItems`, `slaEvents`

Cart-to-order lifecycle. Orders reference `orderItems` which link to `storeSkus`. SLA events track delivery timing obligations.

### `prescriptions.ts` — Prescription Vault (6 tables)
`prescriptions`, `rxPriorApprovals`, `rxComplianceLog`, `prescriptionLines`, `prescriptionAccessLog`, `familyConsent`

Prescription lifecycle: upload → prior approval → dispense → compliance log. `prescriptionAccessLog` audits every access for DPDP compliance. `familyConsent` records guardian consent for minor patients (SM-B).

### `purchase.ts` — Supplier & Purchase (17 tables)
`suppliers`, `purchaseOrders`, `poItems`, `grnRecords`, `purchaseInvoices`, `purchaseLines`, `purchaseReturns`, `purchaseReturnLines`, `supplierPayments`, `supplierPaymentAllocations`, `refillReminders`, `vendors`, `financialYears`, `h1Register`, `accountingJournalBatches`, `accountingJournalEntries`, `tallyExportRuns`

Full procure-to-pay cycle. `h1Register` provides Schedule H/H1 statutory records. Double-entry accounting via `accountingJournalEntries`; `tallyExportRuns` tracks Tally CSV exports.

### `sales.ts` — Counter Billing (11 tables)
`sales`, `saleLines`, `counterPayments`, `refunds`, `paymentRecords`, `saleReturns`, `saleReturnLines`, `creditNotes`, `invoiceSnapshots`, `invoiceSequences`, `shiftClosings`

Over-the-counter and FEFO-driven billing. `invoiceSequences` issues statutory bill numbers. `invoiceSnapshots` provides immutable PDF evidence. `shiftClosings` captures end-of-day cash reconciliation.

### `system_comms.ts` — Notifications & Comms (4 tables)
`notificationEvents`, `notificationPreferences`, `doctorConsultRequests`, `messageTemplates`

Notification events and preferences. Doctor consult requests. Message templates for WhatsApp/SMS/email/app channels (split from system.ts in SM-E).

### `system_consumer.ts` — Consumer Health Records (15 tables)
`userImportanceScores`, `familyMembers`, `customerMedicineRecords`, `refillPlans`, `refillEvents`, `dosageSchedules`, `doseLogs`, `orderRatings`, `customerConsents`, `medicineRecordAccessLog`, `userConsents`, `generics`, `doctors`, `patientCategories`, `scheduleMaster`

Patient-centric data: family members, medicine records, refill plans and events, dosage schedules, dose logs, order ratings, consents, medicine record access log, clinical reference data (generics, doctors, patient categories, schedule master). Split from system.ts in SM-E.

### `system_ops.ts` — System Operations (22 tables)
`systemEvents`, `workerJobs`, `sloEvents`, `reservations`, `reservationLines`, `stockLockKeys`, `ledgers`, `ledgerEntries`, `reportExports`, `systemSettings`, `workflowEvents`, `helpdeskTickets`, `printers`, `idempotencyKeys`, `providerWebhookEvents`, `providerDeadLetters`, `barcodeAliases`, `labelPrintJobs`, `discountCategories`, `discountCodes`, `backupDrillResults`, `incidentRehearsalLog`

Infrastructure layer: worker jobs, SLO events, reservations, stock locks, ledgers, report exports, system settings, helpdesk, printers, idempotency keys, provider webhooks/dead-letters, barcode aliases, label print jobs, discount rules, backup drill results, incident rehearsal log (split from system.ts in SM-E).
