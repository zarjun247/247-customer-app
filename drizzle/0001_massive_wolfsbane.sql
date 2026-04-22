CREATE TABLE `audit_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(200) NOT NULL,
	`entityType` varchar(100),
	`entityId` int,
	`payload` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`productId` int NOT NULL,
	`batchNumber` varchar(100) NOT NULL,
	`expiryDate` timestamp NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`status` enum('active','quarantined','depleted','expired') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `buildings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`address` text,
	`pincode` varchar(10),
	`city` varchar(100),
	`primaryStoreId` int,
	`fallbackStoreId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `buildings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int NOT NULL,
	`storeSkuId` int NOT NULL,
	`quantity` int NOT NULL,
	`isLocked` boolean NOT NULL DEFAULT false,
	`lockedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cart_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`productId` int NOT NULL,
	`storeSkuId` int NOT NULL,
	`allocatedBatchId` int,
	`quantity` int NOT NULL,
	`unitPrice` decimal(10,2) NOT NULL,
	`lineTotal` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storeId` int NOT NULL,
	`prescriptionId` int,
	`status` enum('created','pharmacist_reviewing','picking','out_for_delivery','delivered','cancelled') NOT NULL DEFAULT 'created',
	`subtotal` decimal(10,2) NOT NULL,
	`total` decimal(10,2) NOT NULL,
	`promisedSlaMins` int NOT NULL DEFAULT 20,
	`deliveryAddress` text,
	`flatNumber` varchar(20),
	`buildingId` int,
	`source` enum('app','whatsapp') NOT NULL DEFAULT 'app',
	`invoiceUrl` text,
	`invoiceKey` varchar(500),
	`placedAt` timestamp NOT NULL DEFAULT (now()),
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `otp_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`code` varchar(10) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`isUsed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `otp_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`storeId` int,
	`imageUrl` text NOT NULL,
	`imageKey` varchar(500),
	`status` enum('pending_ocr','pending_pharmacist','approved','rejected') NOT NULL DEFAULT 'pending_ocr',
	`ocrText` text,
	`pharmacistNote` text,
	`pharmacistId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `prescriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(300) NOT NULL,
	`brand` varchar(200),
	`genericName` varchar(300),
	`form` varchar(100),
	`strength` varchar(100),
	`packSize` varchar(100),
	`schedule` enum('OTC','H','H1','X') NOT NULL DEFAULT 'OTC',
	`requiresPrescription` boolean NOT NULL DEFAULT false,
	`isChronicMedication` boolean NOT NULL DEFAULT false,
	`hsnCode` varchar(20),
	`barcode` varchar(100),
	`imageUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refill_reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`productId` int NOT NULL,
	`lastOrderedAt` timestamp NOT NULL,
	`avgIntervalDays` int NOT NULL DEFAULT 30,
	`nextReminderAt` timestamp NOT NULL,
	`isDismissed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `refill_reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `store_skus` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`productId` int NOT NULL,
	`mrp` decimal(10,2) NOT NULL,
	`sellingPrice` decimal(10,2) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`stockQty` int NOT NULL DEFAULT 0,
	`softLockedQty` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_skus_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`type` enum('in_building','cluster_hub') NOT NULL DEFAULT 'in_building',
	`address` text,
	`pincode` varchar(10),
	`phone` varchar(20),
	`isActive` boolean NOT NULL DEFAULT true,
	`slaMins` int NOT NULL DEFAULT 20,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`userId` int,
	`currentFlow` varchar(50),
	`flowState` text,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsapp_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `buildingId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `flatNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `assignedStoreId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `onboardingComplete` boolean DEFAULT false NOT NULL;