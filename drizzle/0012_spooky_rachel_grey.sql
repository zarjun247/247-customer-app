CREATE TABLE `medivision_sync_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`filename` varchar(255) NOT NULL,
	`rowsProcessed` int NOT NULL DEFAULT 0,
	`rowsInserted` int NOT NULL DEFAULT 0,
	`rowsUpdated` int NOT NULL DEFAULT 0,
	`rowsSkipped` int NOT NULL DEFAULT 0,
	`errors` text,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `medivision_sync_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`userId` int NOT NULL,
	`gatewayOrderId` varchar(100) NOT NULL,
	`gatewayPaymentId` varchar(100),
	`gatewaySignature` varchar(500),
	`amount` int NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'INR',
	`status` enum('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
	`method` varchar(50),
	`paidAt` timestamp,
	`failureReason` text,
	`refundId` varchar(100),
	`refundedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sla_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`storeId` int NOT NULL,
	`slaStartedAt` timestamp NOT NULL,
	`promisedSlaMins` int NOT NULL,
	`slaDeadline` timestamp NOT NULL,
	`deliveredAt` timestamp,
	`breached` boolean NOT NULL DEFAULT false,
	`breachDetectedAt` timestamp,
	`breachAlertSent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sla_events_id` PRIMARY KEY(`id`)
);
