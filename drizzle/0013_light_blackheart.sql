CREATE TABLE `discount_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryName` varchar(100) NOT NULL,
	`maxDiscount` decimal(5,2) DEFAULT '0.00',
	`minMargin` decimal(5,2) DEFAULT '0.00',
	`roleOverrideRequired` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discount_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `doctors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`doctorName` varchar(300) NOT NULL,
	`registrationNo` varchar(100),
	`clinicHospital` varchar(300),
	`phone` varchar(20),
	`address` text,
	`specialization` varchar(200),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `doctors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_years` (
	`id` int AUTO_INCREMENT NOT NULL,
	`yearLabel` varchar(20) NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`isCurrent` boolean NOT NULL DEFAULT false,
	`isLocked` boolean NOT NULL DEFAULT false,
	`lockedAt` timestamp,
	`lockedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financial_years_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`genericName` varchar(300) NOT NULL,
	`aliases` text,
	`therapeuticClass` varchar(200),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `h1_register` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int,
	`prescriptionId` int,
	`storeId` int NOT NULL,
	`patientName` varchar(300) NOT NULL,
	`patientPhone` varchar(20),
	`prescribingDoctor` varchar(300),
	`drugName` varchar(300) NOT NULL,
	`batchNo` varchar(100),
	`qty` int NOT NULL,
	`prescriptionRef` varchar(100),
	`pharmacistId` int NOT NULL,
	`billNo` varchar(100),
	`dispensedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `h1_register_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingestion_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`jobType` enum('purchase_bill','prescription','stock_audit') NOT NULL DEFAULT 'purchase_bill',
	`status` enum('queued','processing','ocr_complete','under_review','committed','failed') NOT NULL DEFAULT 'queued',
	`fileUrl` text,
	`fileKey` text,
	`filename` varchar(255),
	`mimeType` varchar(100),
	`ocrRawText` text,
	`ocrConfidence` decimal(5,2),
	`errorMessage` text,
	`createdBy` int NOT NULL,
	`processedAt` timestamp,
	`committedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ingestion_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`entryDate` timestamp NOT NULL DEFAULT (now()),
	`entryType` enum('debit','credit') NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`referenceType` varchar(50),
	`referenceId` int,
	`narration` text,
	`runningBalance` decimal(14,2),
	`financialYearId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledger_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledgers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerName` varchar(200) NOT NULL,
	`ledgerType` enum('supplier','customer','sales','purchases','gst_output','gst_input','cash','bank','upi_settlement','discounts','purchase_returns','sales_returns','stock_adjustment','expiry_loss','gross_margin','expenses') NOT NULL,
	`storeId` int,
	`supplierId` int,
	`customerId` int,
	`openingBalance` decimal(14,2) DEFAULT '0.00',
	`currentBalance` decimal(14,2) DEFAULT '0.00',
	`financialYearId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ledgers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `manufacturers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(300) NOT NULL,
	`aliases` text,
	`gstin` varchar(20),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `manufacturers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `message_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateName` varchar(200) NOT NULL,
	`channel` enum('whatsapp','sms','email','app') NOT NULL DEFAULT 'sms',
	`messageBody` text NOT NULL,
	`variables` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `message_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ocr_extracted_headers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ingestionJobId` int NOT NULL,
	`supplierName` varchar(300),
	`supplierGstin` varchar(20),
	`invoiceNo` varchar(100),
	`invoiceDate` varchar(50),
	`totalAmount` decimal(12,2),
	`confidence` decimal(5,2),
	`matchedSupplierId` int,
	`reviewStatus` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ocr_extracted_headers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ocr_extracted_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ingestionJobId` int NOT NULL,
	`lineNo` int NOT NULL,
	`rawText` text,
	`itemName` varchar(300),
	`manufacturer` varchar(200),
	`batchNo` varchar(100),
	`expiryDate` varchar(50),
	`mrp` decimal(10,2),
	`purchaseRate` decimal(10,2),
	`qty` int,
	`freeQty` int DEFAULT 0,
	`discount` decimal(5,2),
	`gstRate` decimal(5,2),
	`hsnCode` varchar(20),
	`confidence` decimal(5,2),
	`matchedProductId` int,
	`matchConfidence` decimal(5,2),
	`matchStatus` enum('auto_matched','review_required','unknown_sku','rejected') NOT NULL DEFAULT 'review_required',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ocr_extracted_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patient_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryName` varchar(100) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `patient_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `printers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`printerName` varchar(200) NOT NULL,
	`printerType` enum('bill','barcode','a4','thermal') NOT NULL DEFAULT 'thermal',
	`assignedTerminal` varchar(100),
	`assignedStoreId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `printers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_aliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`alias` varchar(300) NOT NULL,
	`aliasType` enum('supplier_code','legacy_code','medivision_code','samarth_code','barcode','other') NOT NULL DEFAULT 'other',
	`supplierId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_aliases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_locks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`lockType` enum('min_margin','max_discount','price_lock','sale_block') NOT NULL,
	`lockValue` decimal(10,2),
	`roleOverrideRequired` boolean NOT NULL DEFAULT true,
	`reason` text,
	`createdBy` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_locks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_supplier_mappings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`supplierId` int NOT NULL,
	`supplierProductCode` varchar(100),
	`lastPurchaseRate` decimal(10,2),
	`isPreferred` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_supplier_mappings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_draft_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseDraftId` int NOT NULL,
	`ocrLineId` int,
	`productId` int,
	`batchNo` varchar(100),
	`expiryDate` varchar(50),
	`mrp` decimal(10,2),
	`purchaseRate` decimal(10,2),
	`qty` int,
	`freeQty` int DEFAULT 0,
	`discount` decimal(5,2),
	`gstRate` decimal(5,2),
	`hsnCode` varchar(20),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_draft_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ingestionJobId` int NOT NULL,
	`supplierId` int,
	`invoiceNo` varchar(100),
	`invoiceDate` varchar(50),
	`status` enum('draft','under_review','approved','committed','rejected') NOT NULL DEFAULT 'draft',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`committedInvoiceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`storeId` int NOT NULL,
	`invoiceNo` varchar(100) NOT NULL,
	`invoiceDate` timestamp NOT NULL,
	`supplierGstin` varchar(20),
	`totalAmount` decimal(12,2) DEFAULT '0.00',
	`totalGst` decimal(12,2) DEFAULT '0.00',
	`totalDiscount` decimal(12,2) DEFAULT '0.00',
	`netAmount` decimal(12,2) DEFAULT '0.00',
	`status` enum('draft','committed','partially_returned','returned','cancelled') NOT NULL DEFAULT 'draft',
	`notes` text,
	`createdBy` int NOT NULL,
	`committedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseInvoiceId` int NOT NULL,
	`productId` int NOT NULL,
	`batchNo` varchar(100) NOT NULL,
	`expiryDate` timestamp NOT NULL,
	`mrp` decimal(10,2) NOT NULL,
	`purchaseRate` decimal(10,2) NOT NULL,
	`saleRate` decimal(10,2),
	`qty` int NOT NULL,
	`freeQty` int DEFAULT 0,
	`schemeDiscount` decimal(5,2) DEFAULT '0.00',
	`cashDiscount` decimal(5,2) DEFAULT '0.00',
	`hsnCode` varchar(20),
	`gstRate` decimal(5,2) DEFAULT '12.00',
	`landingCost` decimal(10,2),
	`margin` decimal(5,2),
	`batchId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_return_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseReturnId` int NOT NULL,
	`purchaseLineId` int NOT NULL,
	`batchId` int NOT NULL,
	`qty` int NOT NULL,
	`returnRate` decimal(10,2) NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_return_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_returns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseInvoiceId` int NOT NULL,
	`supplierId` int NOT NULL,
	`storeId` int NOT NULL,
	`returnDate` timestamp NOT NULL DEFAULT (now()),
	`totalAmount` decimal(12,2) DEFAULT '0.00',
	`reason` text,
	`status` enum('draft','committed') NOT NULL DEFAULT 'draft',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_returns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_exports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportType` varchar(100) NOT NULL,
	`parameters` text,
	`fileUrl` text,
	`fileKey` text,
	`status` enum('queued','generating','ready','failed') NOT NULL DEFAULT 'queued',
	`requestedBy` int NOT NULL,
	`storeId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `report_exports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_master` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleCode` varchar(10) NOT NULL,
	`prescriptionRequired` boolean NOT NULL DEFAULT false,
	`pharmacistReviewRequired` boolean NOT NULL DEFAULT false,
	`h1RegisterRequired` boolean NOT NULL DEFAULT false,
	`repeatDispenseAllowed` boolean NOT NULL DEFAULT true,
	`retentionPolicyDays` int DEFAULT 365,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_master_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shift_closings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`shiftDate` timestamp NOT NULL,
	`openingCash` decimal(12,2) DEFAULT '0.00',
	`cashSales` decimal(12,2) DEFAULT '0.00',
	`upiCardSales` decimal(12,2) DEFAULT '0.00',
	`creditSales` decimal(12,2) DEFAULT '0.00',
	`refunds` decimal(12,2) DEFAULT '0.00',
	`expenses` decimal(12,2) DEFAULT '0.00',
	`cashDeposited` decimal(12,2) DEFAULT '0.00',
	`expectedCash` decimal(12,2) DEFAULT '0.00',
	`actualCash` decimal(12,2) DEFAULT '0.00',
	`variance` decimal(12,2) DEFAULT '0.00',
	`cashierId` int NOT NULL,
	`pharmacistOnDutyId` int,
	`pendingOrders` int DEFAULT 0,
	`cancelledBills` int DEFAULT 0,
	`status` enum('open','submitted','approved','locked') NOT NULL DEFAULT 'open',
	`approvedBy` int,
	`approvedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_closings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sku_creation_drafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ingestionJobId` int NOT NULL,
	`ocrLineId` int,
	`draftName` varchar(300) NOT NULL,
	`brand` varchar(200),
	`genericName` varchar(300),
	`manufacturer` varchar(200),
	`scheduleFlag` varchar(10),
	`hsnCode` varchar(20),
	`gstRate` decimal(5,2),
	`packSize` varchar(100),
	`status` enum('pending_review','approved','rejected') NOT NULL DEFAULT 'pending_review',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`activatedProductId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sku_creation_drafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stateName` varchar(100) NOT NULL,
	`stateCode` varchar(10) NOT NULL,
	`gstStateCode` varchar(4),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `states_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`storeId` int NOT NULL,
	`adjustmentType` enum('increase','decrease') NOT NULL,
	`qty` int NOT NULL,
	`reason` text NOT NULL,
	`supportingNote` text,
	`status` enum('pending_approval','approved','rejected') NOT NULL DEFAULT 'pending_approval',
	`requestedBy` int NOT NULL,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_adjustments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`storeId` int NOT NULL,
	`movementType` enum('purchase_inward','sale_reserve','sale_fulfil','cancellation_release','sale_return','purchase_return','stock_adjustment','stock_transfer','batch_transfer','quarantine','disposal','audit_correction') NOT NULL,
	`qty` int NOT NULL,
	`qtyBefore` int NOT NULL,
	`qtyAfter` int NOT NULL,
	`referenceType` varchar(50),
	`referenceId` int,
	`reason` text,
	`performedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierId` int NOT NULL,
	`storeId` int NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`paymentMode` enum('cash','cheque','upi','neft','rtgs') NOT NULL DEFAULT 'upi',
	`referenceNo` varchar(100),
	`paymentDate` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplierName` varchar(300) NOT NULL,
	`gstin` varchar(20),
	`address` text,
	`stateId` int,
	`contactPerson` varchar(200),
	`phone` varchar(20),
	`email` varchar(320),
	`paymentTerms` varchar(100),
	`defaultDiscount` decimal(5,2) DEFAULT '0.00',
	`cashDiscount` decimal(5,2) DEFAULT '0.00',
	`creditDays` int DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(200) NOT NULL,
	`settingValue` text,
	`settingType` enum('string','number','boolean','json') NOT NULL DEFAULT 'string',
	`description` text,
	`isLocked` boolean NOT NULL DEFAULT false,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','pharmacist','store_manager','inventory_operator','delivery_operator','auditor','cashier','salesman','purchase_manager','accountant','super_admin') NOT NULL DEFAULT 'user';