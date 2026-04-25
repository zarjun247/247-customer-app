CREATE TABLE `delivery_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`riderId` int,
	`eventType` enum('assigned','picked_up','arrived','otp_verified','delivered','failed_attempt','returned','exception') NOT NULL,
	`lat` decimal(10,8),
	`lng` decimal(11,8),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `delivery_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `delivery_otps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`otp` varchar(10) NOT NULL,
	`isUsed` boolean NOT NULL DEFAULT false,
	`usedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `delivery_otps_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_otps_orderId_unique` UNIQUE(`orderId`)
);
--> statement-breakpoint
CREATE TABLE `grn_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poId` int,
	`storeId` int NOT NULL,
	`receivedByUserId` int NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	`status` enum('pending','verified','discrepancy') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `grn_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `metrics_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`userId` int,
	`storeId` int,
	`orderId` int,
	`value` decimal(12,2),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `metrics_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `po_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poId` int NOT NULL,
	`productId` int NOT NULL,
	`variantId` int,
	`orderedQty` int NOT NULL,
	`receivedQty` int NOT NULL DEFAULT 0,
	`unitCost` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `po_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vendorId` int NOT NULL,
	`storeId` int NOT NULL,
	`status` enum('draft','sent','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
	`expectedDelivery` timestamp,
	`totalAmount` decimal(12,2),
	`notes` text,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `riders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`storeId` int NOT NULL,
	`status` enum('available','on_delivery','offline') NOT NULL DEFAULT 'available',
	`isActive` boolean NOT NULL DEFAULT true,
	`currentLat` decimal(10,8),
	`currentLng` decimal(11,8),
	`lastLocationAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `riders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rx_compliance_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`rxId` int NOT NULL,
	`orderId` int,
	`pharmacistId` int NOT NULL,
	`action` enum('received','ocr_complete','quick_verify','manual_review','approved','rejected','dispensed','prior_approval_granted','fallback_applied') NOT NULL,
	`note` text,
	`fallbackMode` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rx_compliance_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rx_prior_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rxId` int NOT NULL,
	`approvedByPharmacistId` int NOT NULL,
	`validUntil` timestamp NOT NULL,
	`linkedProductIds` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rx_prior_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storeId` int NOT NULL,
	`role` enum('pharmacist','store_manager','inventory_operator','delivery_operator','auditor') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`assignedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_importance_scores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`score` int NOT NULL DEFAULT 50,
	`isChronic` boolean NOT NULL DEFAULT false,
	`isElderly` boolean NOT NULL DEFAULT false,
	`isAdherenceRisk` boolean NOT NULL DEFAULT false,
	`flags` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_importance_scores_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_importance_scores_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`contactName` varchar(200),
	`phone` varchar(20),
	`email` varchar(320),
	`gstin` varchar(20),
	`address` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vendors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`entityType` enum('order','prescription','refill','delivery','po','grn') NOT NULL,
	`entityId` int NOT NULL,
	`fromState` varchar(100),
	`toState` varchar(100) NOT NULL,
	`triggeredByUserId` int,
	`triggeredBySystem` boolean NOT NULL DEFAULT false,
	`payload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `status` enum('created','pharmacist_reviewing','picking','out_for_delivery','delivered','cancelled','return_to_stock') NOT NULL DEFAULT 'created';--> statement-breakpoint
ALTER TABLE `prescriptions` MODIFY COLUMN `status` enum('pending_ocr','pending_pharmacist','quick_verify','approved','rejected','additional_verification','on_file') NOT NULL DEFAULT 'pending_ocr';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','pharmacist','store_manager','inventory_operator','delivery_operator','auditor') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `ipAddress` varchar(45);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `userAgent` text;--> statement-breakpoint
ALTER TABLE `batches` ADD `unitCost` decimal(10,2);--> statement-breakpoint
ALTER TABLE `batches` ADD `supplierId` int;--> statement-breakpoint
ALTER TABLE `batches` ADD `grnId` int;--> statement-breakpoint
ALTER TABLE `order_items` ADD `requiresPrescription` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `rxGateCleared` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `rxLane` enum('otc','digital','on_file','fallback') DEFAULT 'otc' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `rxGateCleared` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `rxGateClearedAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `rxGateClearedBy` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `riderId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `cancelledAt` timestamp;--> statement-breakpoint
ALTER TABLE `orders` ADD `cancellationReason` text;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `lane` enum('otc','digital','on_file','fallback') DEFAULT 'digital' NOT NULL;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `doctorName` varchar(200);--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `doctorReg` varchar(100);--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `prescribedDate` timestamp;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `expiryDate` timestamp;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `linkedProductIds` text;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `patientNote` text;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `priorApprovalId` int;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `dispensingPharmacistId` int;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `dispensedAt` timestamp;--> statement-breakpoint
ALTER TABLE `prescriptions` ADD `retainUntil` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `staffStoreId` int;