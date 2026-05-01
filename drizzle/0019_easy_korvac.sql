CREATE TABLE `ai_decisions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ingestionJobId` int NOT NULL,
	`ocrLineId` int,
	`decisionType` enum('auto_match','review_flag','sku_create','reject','schedule_gate') NOT NULL,
	`confidence` decimal(5,2) NOT NULL,
	`reasoning` text,
	`modelVersion` varchar(50),
	`inputSnapshot` text,
	`outputSnapshot` text,
	`overriddenBy` int,
	`overriddenAt` timestamp,
	`overrideReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_decisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `counter_payments` (
	`id` varchar(36) NOT NULL,
	`sale_id` varchar(36) NOT NULL,
	`payment_mode` enum('cash','upi','card','credit','mixed') NOT NULL DEFAULT 'cash',
	`amount` decimal(12,2) NOT NULL DEFAULT '0',
	`payment_ref` varchar(200),
	`gateway_ref` varchar(200),
	`status` enum('pending','confirmed','failed','refunded') NOT NULL DEFAULT 'confirmed',
	`created_by` varchar(36) NOT NULL,
	`created_at` bigint NOT NULL,
	CONSTRAINT `counter_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_consents` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`consentType` enum('medicine_record_storage','family_profile','refill_reminder_whatsapp','refill_reminder_app','refill_reminder_sms','prescription_data_processing','chronic_condition_tracking','marketing_communications','data_sharing_doctor') NOT NULL,
	`granted` boolean NOT NULL DEFAULT true,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	`ipAddress` varchar(45),
	`version` varchar(20) NOT NULL DEFAULT '1.0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_consents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_medicine_records` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`familyMemberId` int,
	`productId` int NOT NULL,
	`batchId` int,
	`orderId` int,
	`saleId` int,
	`prescriptionId` int,
	`purchaseType` enum('prescribed','otc','chronic_refill','counter','whatsapp') NOT NULL DEFAULT 'otc',
	`qty` int NOT NULL,
	`purchaseDate` timestamp NOT NULL,
	`doctorName` varchar(200),
	`doctorReg` varchar(100),
	`isNewMedicine` boolean NOT NULL DEFAULT false,
	`isChronicFlag` boolean NOT NULL DEFAULT false,
	`discontinued` boolean NOT NULL DEFAULT false,
	`discontinuedReason` varchar(500),
	`discontinuedAt` timestamp,
	`pharmacistNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_medicine_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`relation` varchar(50),
	`dateOfBirth` date,
	`gender` enum('male','female','other'),
	`phone` varchar(20),
	`patientCategoryId` int,
	`chronicConditions` text,
	`allergies` text,
	`bloodGroup` varchar(10),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingestion_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ingestionJobId` int NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`fileSizeBytes` int,
	`pageCount` int,
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ingestion_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `medicine_record_access_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`targetUserId` int NOT NULL,
	`accessedBy` int NOT NULL,
	`accessType` enum('view','export','admin_view','api_check') NOT NULL,
	`purpose` varchar(200),
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `medicine_record_access_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ocr_match_candidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ocrLineId` int NOT NULL,
	`productId` int NOT NULL,
	`matchScore` decimal(5,2) NOT NULL,
	`matchMethod` enum('exact_name','fuzzy_name','barcode','hsn_gst','supplier_alias','previous_mapping','manufacturer_strength') NOT NULL,
	`matchDetails` text,
	`isSelected` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ocr_match_candidates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ocr_review_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ingestionJobId` int NOT NULL,
	`ocrLineId` int,
	`taskType` enum('header_review','line_review','sku_creation','h1_review','low_confidence') NOT NULL,
	`priority` enum('high','medium','low') DEFAULT 'medium',
	`status` enum('pending','in_progress','resolved','skipped') DEFAULT 'pending',
	`assignedTo` int,
	`resolvedBy` int,
	`resolvedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ocr_review_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prescription_access_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prescriptionId` int NOT NULL,
	`accessedBy` int NOT NULL,
	`accessType` enum('view','download','print','api_check','audit') DEFAULT 'view',
	`ipAddress` varchar(50),
	`userAgent` text,
	`purpose` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prescription_access_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prescription_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prescriptionId` int NOT NULL,
	`lineNo` int NOT NULL DEFAULT 1,
	`drugName` varchar(300) NOT NULL,
	`genericName` varchar(300),
	`strength` varchar(100),
	`dosageForm` varchar(100),
	`qty` int,
	`duration` varchar(100),
	`frequency` varchar(100),
	`instructions` text,
	`scheduleCode` enum('OTC','Rx','H','H1','X','NRX') DEFAULT 'Rx',
	`requiresH1` int DEFAULT 0,
	`status` enum('pending','approved','rejected','clarification_needed') DEFAULT 'pending',
	`pharmacistNote` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`linkedProductId` int,
	`linkedBatchNo` varchar(100),
	`linkedSaleLineId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prescription_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refill_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`refillPlanId` int NOT NULL,
	`userId` int NOT NULL,
	`eventType` enum('reminder_sent_app','reminder_sent_whatsapp','reminder_sent_sms','refill_ordered','refill_missed','refill_snoozed','refill_cancelled','prescription_expired','fresh_rx_required','plan_paused','plan_resumed') NOT NULL,
	`dueDate` date NOT NULL,
	`orderId` int,
	`saleId` int,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refill_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refill_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`familyMemberId` int,
	`productId` int NOT NULL,
	`prescriptionId` int,
	`frequencyDays` int NOT NULL,
	`qty` int NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date,
	`nextDueDate` date NOT NULL,
	`lastFulfilledDate` date,
	`status` enum('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
	`reminderDaysBefore` int NOT NULL DEFAULT 3,
	`whatsappReminder` boolean NOT NULL DEFAULT true,
	`appReminder` boolean NOT NULL DEFAULT true,
	`prescriptionExpiryDate` date,
	`needsFreshRx` boolean NOT NULL DEFAULT false,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `refill_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sale_lines` (
	`id` varchar(36) NOT NULL,
	`sale_id` varchar(36) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`batch_ledger_id` varchar(36),
	`batch_no` varchar(100),
	`expiry_date` date,
	`mrp` decimal(10,2) NOT NULL DEFAULT '0',
	`sale_rate` decimal(10,2) NOT NULL DEFAULT '0',
	`qty` int NOT NULL DEFAULT 1,
	`discount_pct` decimal(5,2) NOT NULL DEFAULT '0',
	`discount_amount` decimal(10,2) NOT NULL DEFAULT '0',
	`gst_rate` decimal(5,2) NOT NULL DEFAULT '0',
	`gst_amount` decimal(10,2) NOT NULL DEFAULT '0',
	`hsn_code` varchar(20),
	`line_total` decimal(12,2) NOT NULL DEFAULT '0',
	`requires_prescription` int NOT NULL DEFAULT 0,
	`schedule_code` varchar(10),
	`rx_cleared` int NOT NULL DEFAULT 0,
	`created_at` bigint NOT NULL,
	CONSTRAINT `sale_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sale_return_lines` (
	`id` varchar(36) NOT NULL,
	`return_id` varchar(36) NOT NULL,
	`sale_line_id` varchar(36) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`batch_ledger_id` varchar(36),
	`return_qty` int NOT NULL DEFAULT 1,
	`unit_price` decimal(10,2) NOT NULL DEFAULT '0',
	`refund_amount` decimal(10,2) NOT NULL DEFAULT '0',
	`gst_reversal` decimal(10,2) NOT NULL DEFAULT '0',
	`stock_disposition` enum('resaleable','quarantine','disposal') NOT NULL DEFAULT 'resaleable',
	`created_at` bigint NOT NULL,
	CONSTRAINT `sale_return_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sale_returns` (
	`id` varchar(36) NOT NULL,
	`return_no` varchar(50) NOT NULL,
	`sale_id` varchar(36) NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`reason` text NOT NULL,
	`refund_mode` enum('cash','upi','card','credit_note') NOT NULL DEFAULT 'cash',
	`refund_ref` varchar(200),
	`total_refund` decimal(12,2) NOT NULL DEFAULT '0',
	`gst_reversal` decimal(12,2) NOT NULL DEFAULT '0',
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`approved_by` varchar(36),
	`approved_at` bigint,
	`created_by` varchar(36) NOT NULL,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `sale_returns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` varchar(36) NOT NULL,
	`bill_no` varchar(50) NOT NULL,
	`sale_type` enum('counter','medicine','app','whatsapp','phone_assisted','prescription','otc','chronic_refill') NOT NULL DEFAULT 'counter',
	`store_id` varchar(36) NOT NULL,
	`customer_id` varchar(36),
	`customer_mobile` varchar(20),
	`customer_name` varchar(200),
	`salesman_code` varchar(50),
	`pharmacist_code` varchar(50),
	`pharmacist_name` varchar(200),
	`pharmacist_reg_no` varchar(100),
	`prescription_id` varchar(36),
	`subtotal` decimal(12,2) NOT NULL DEFAULT '0',
	`discount_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`gst_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`gst_summary` text,
	`payment_mode` enum('cash','upi','card','credit','mixed') NOT NULL DEFAULT 'cash',
	`payment_ref` varchar(200),
	`status` enum('draft','confirmed','returned','cancelled') NOT NULL DEFAULT 'draft',
	`bill_printed` int NOT NULL DEFAULT 0,
	`whatsapp_sent` int NOT NULL DEFAULT 0,
	`email_sent` int NOT NULL DEFAULT 0,
	`notes` text,
	`created_by` varchar(36) NOT NULL,
	`confirmed_at` bigint,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `sales_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_handoffs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`userId` int,
	`sessionId` int,
	`reason` enum('customer_request','bot_confused','rx_clarification','delivery_exception','complaint','supplier_bill','other') NOT NULL,
	`reasonNote` text,
	`status` enum('open','assigned','resolved','closed') NOT NULL DEFAULT 'open',
	`assignedTo` int,
	`assignedAt` timestamp,
	`resolvedAt` timestamp,
	`resolutionNote` text,
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`relatedOrderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_handoffs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `waba_message_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`category` enum('order_status','refill_reminder','rx_received','delivery_otp','bill_share','staff_handoff','delivery_exception','welcome','supplier_bill','custom') NOT NULL,
	`language` varchar(10) NOT NULL DEFAULT 'en',
	`body` text NOT NULL,
	`headerText` varchar(200),
	`footerText` varchar(200),
	`buttonLabels` text,
	`paramCount` int NOT NULL DEFAULT 0,
	`paramDescriptions` text,
	`wabaTemplateId` varchar(200),
	`wabaStatus` enum('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `waba_message_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `waba_message_templates_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_cart_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cartId` int NOT NULL,
	`productId` int NOT NULL,
	`variantId` int,
	`storeSkuId` int NOT NULL,
	`qty` int NOT NULL DEFAULT 1,
	`unitPrice` varchar(20) NOT NULL,
	`lineTotal` varchar(20) NOT NULL,
	`requiresPrescription` boolean NOT NULL DEFAULT false,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_cart_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_carts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`userId` int,
	`storeId` int,
	`status` enum('active','confirmed','expired','abandoned') NOT NULL DEFAULT 'active',
	`prescriptionId` int,
	`deliveryAddress` text,
	`flatNumber` varchar(50),
	`buildingId` int,
	`convertedOrderId` int,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_carts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`userId` int NOT NULL,
	`verifiedAt` timestamp NOT NULL,
	`verificationMethod` enum('otp','app_login','staff_override') NOT NULL DEFAULT 'otp',
	`isActive` boolean NOT NULL DEFAULT true,
	`linkedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_links_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_messages` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`userId` int,
	`direction` enum('inbound','outbound') NOT NULL,
	`messageType` enum('text','image','document','audio','template','button','interactive') NOT NULL DEFAULT 'text',
	`body` text,
	`mediaUrl` text,
	`mediaKey` varchar(500),
	`templateName` varchar(100),
	`templateParams` text,
	`externalMsgId` varchar(200),
	`sessionId` int,
	`flow` varchar(50),
	`status` enum('received','sent','delivered','read','failed') NOT NULL DEFAULT 'received',
	`errorCode` varchar(50),
	`errorMessage` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_webhook_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`source` varchar(50) NOT NULL DEFAULT 'waba',
	`payload` text NOT NULL,
	`signature` varchar(500),
	`signatureValid` boolean,
	`processedAt` timestamp,
	`errorMessage` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_webhook_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `batches` MODIFY COLUMN `status` enum('active','quarantined','depleted','expired','recalled','damaged','returned_to_supplier') NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `batches` ADD `batchNo` varchar(100);--> statement-breakpoint
ALTER TABLE `batches` ADD `mfgDate` timestamp;--> statement-breakpoint
ALTER TABLE `batches` ADD `mrp` decimal(10,2);--> statement-breakpoint
ALTER TABLE `batches` ADD `purchaseRate` decimal(10,2);--> statement-breakpoint
ALTER TABLE `batches` ADD `saleRate` decimal(10,2);--> statement-breakpoint
ALTER TABLE `batches` ADD `schemeDiscount` decimal(5,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `batches` ADD `cashDiscount` decimal(5,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `batches` ADD `landingCost` decimal(10,2);--> statement-breakpoint
ALTER TABLE `batches` ADD `margin` decimal(5,2);--> statement-breakpoint
ALTER TABLE `batches` ADD `qtyOnHand` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `batches` ADD `qtyReserved` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `batches` ADD `qtyQuarantined` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `batches` ADD `qtyExpired` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `batches` ADD `internalBarcode` varchar(100);--> statement-breakpoint
ALTER TABLE `batches` ADD `manufacturerBarcode` varchar(100);--> statement-breakpoint
ALTER TABLE `batches` ADD `purchaseInvoiceId` int;--> statement-breakpoint
ALTER TABLE `batches` ADD `storageCondition` enum('room_temp','refrigerated','frozen','controlled') DEFAULT 'room_temp';--> statement-breakpoint
ALTER TABLE `batches` ADD `coldChainFlag` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `batches` ADD `expiryBucket` enum('normal','warning','critical','quarantine_candidate','expired') DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE `batches` ADD `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `h1_register` ADD `saleId` int;--> statement-breakpoint
ALTER TABLE `h1_register` ADD `prescriptionLineId` int;--> statement-breakpoint
ALTER TABLE `ingestion_jobs` ADD `sourceType` enum('upload','email','whatsapp','watched_folder','csv_import','legacy') DEFAULT 'upload';--> statement-breakpoint
ALTER TABLE `ingestion_jobs` ADD `supplierHint` varchar(300);--> statement-breakpoint
ALTER TABLE `ingestion_jobs` ADD `totalLines` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ingestion_jobs` ADD `matchedLines` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ingestion_jobs` ADD `reviewLines` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ingestion_jobs` ADD `unknownLines` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `ocr_extracted_headers` ADD `invoiceDateParsed` date;--> statement-breakpoint
ALTER TABLE `ocr_extracted_headers` ADD `totalTax` decimal(12,2);--> statement-breakpoint
ALTER TABLE `ocr_extracted_headers` ADD `reviewedBy` int;--> statement-breakpoint
ALTER TABLE `ocr_extracted_headers` ADD `reviewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `ocr_extracted_lines` ADD `normalizedName` varchar(300);--> statement-breakpoint
ALTER TABLE `ocr_extracted_lines` ADD `strength` varchar(100);--> statement-breakpoint
ALTER TABLE `ocr_extracted_lines` ADD `dosageForm` varchar(100);--> statement-breakpoint
ALTER TABLE `ocr_extracted_lines` ADD `packSize` varchar(100);--> statement-breakpoint
ALTER TABLE `ocr_extracted_lines` ADD `totalValue` decimal(12,2);--> statement-breakpoint
ALTER TABLE `ocr_extracted_lines` ADD `rejectionReason` text;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `patientName` varchar(300);--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `patientPhone` varchar(20);--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `patientAddress` text;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `clarificationNote` text;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `clarificationRequestedAt` timestamp;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `repeatDispenseCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `repeatDispenseMax` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `linkedSaleId` int;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `linkedOrderId` int;--> statement-breakpoint
ALTER TABLE `purchase_draft_lines` ADD `saleRate` decimal(10,2);--> statement-breakpoint
ALTER TABLE `purchase_draft_lines` ADD `landingCost` decimal(10,2);--> statement-breakpoint
ALTER TABLE `purchase_draft_lines` ADD `margin` decimal(5,2);--> statement-breakpoint
ALTER TABLE `purchase_draft_lines` ADD `rejectionReason` text;--> statement-breakpoint
ALTER TABLE `purchase_drafts` ADD `totalValue` decimal(12,2);--> statement-breakpoint
ALTER TABLE `purchase_drafts` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `purchase_drafts` ADD `rejectionReason` text;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `sourceType` enum('manual','ocr','import','whatsapp') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `rawFileRef` varchar(500);--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `gstSummary` json;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `approvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `debitNoteNo` varchar(100);--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD `mfgDate` timestamp;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD `rawLineText` text;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD `confidence` decimal(5,2);--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD `reviewerId` int;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `purchase_returns` ADD `debitNoteNo` varchar(100);--> statement-breakpoint
ALTER TABLE `purchase_returns` ADD `gstReversal` json;--> statement-breakpoint
ALTER TABLE `purchase_returns` ADD `approvedBy` int;--> statement-breakpoint
ALTER TABLE `purchase_returns` ADD `committedAt` timestamp;--> statement-breakpoint
ALTER TABLE `purchase_returns` ADD `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD `purchaseInvoiceId` int;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD `voucherNo` varchar(100);--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD `bankRef` varchar(200);--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;