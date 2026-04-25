CREATE TABLE `helpdesk_tickets` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`orderId` int,
	`prescriptionId` int,
	`category` enum('order','prescription','delivery','billing','product','account','other') NOT NULL DEFAULT 'other',
	`subject` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`status` enum('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`assignedTo` int,
	`resolvedAt` timestamp,
	`resolutionNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `helpdesk_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `human_review_items` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`ingestionId` bigint NOT NULL,
	`rawLine` text NOT NULL,
	`parsedName` varchar(255),
	`parsedBatch` varchar(100),
	`parsedExpiry` varchar(50),
	`parsedQty` int,
	`parsedUnitCost` decimal(10,2),
	`parsedMrp` decimal(10,2),
	`parsedBarcode` varchar(100),
	`matchedProductId` int,
	`matchedVariantId` int,
	`matchConfidence` decimal(5,2),
	`isDuplicate` boolean NOT NULL DEFAULT false,
	`duplicateOfId` bigint,
	`status` enum('pending','approved','rejected','merged') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `human_review_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_ingestions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`uploadedBy` int NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileUrl` varchar(500) NOT NULL,
	`originalFilename` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL DEFAULT 'application/pdf',
	`status` enum('pending_ocr','ocr_complete','under_review','approved','rejected') NOT NULL DEFAULT 'pending_ocr',
	`ocrRawText` text,
	`itemCount` int NOT NULL DEFAULT 0,
	`approvedCount` int NOT NULL DEFAULT 0,
	`rejectedCount` int NOT NULL DEFAULT 0,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoice_ingestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ocr_jobs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`ingestionId` bigint NOT NULL,
	`status` enum('queued','processing','complete','failed') NOT NULL DEFAULT 'queued',
	`provider` varchar(50) NOT NULL DEFAULT 'llm',
	`rawResponse` text,
	`parsedJson` text,
	`errorMessage` text,
	`attempts` int NOT NULL DEFAULT 0,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ocr_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_consents` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`consentType` enum('terms_of_service','privacy_policy','rx_data_processing','marketing','location') NOT NULL,
	`version` varchar(20) NOT NULL,
	`granted` boolean NOT NULL DEFAULT true,
	`ipAddress` varchar(45),
	`userAgent` varchar(500),
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `user_consents_id` PRIMARY KEY(`id`)
);
