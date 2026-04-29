CREATE TABLE `batch_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`variantId` int,
	`storeId` int NOT NULL,
	`supplierId` int,
	`batchNo` varchar(100) NOT NULL,
	`mfgDate` date,
	`expiryDate` date NOT NULL,
	`mrp` decimal(10,2) NOT NULL,
	`purchaseRate` decimal(10,2) NOT NULL,
	`saleRate` decimal(10,2) NOT NULL,
	`schemeDiscount` decimal(5,2) DEFAULT '0.00',
	`cashDiscount` decimal(5,2) DEFAULT '0.00',
	`landingCost` decimal(10,2),
	`margin` decimal(5,2),
	`qtyOnHand` int NOT NULL DEFAULT 0,
	`qtyReserved` int NOT NULL DEFAULT 0,
	`qtyQuarantined` int NOT NULL DEFAULT 0,
	`qtyExpired` int NOT NULL DEFAULT 0,
	`internalBarcode` varchar(100),
	`manufacturerBarcode` varchar(100),
	`purchaseInvoiceId` int,
	`grnId` int,
	`storageCondition` enum('ambient','cold_chain','controlled','frozen') NOT NULL DEFAULT 'ambient',
	`coldChainFlag` boolean NOT NULL DEFAULT false,
	`expiryBucket` enum('normal','warning','critical','quarantine_candidate','expired') NOT NULL DEFAULT 'normal',
	`status` enum('active','quarantined','depleted','expired','recalled','damaged','returned_to_supplier') NOT NULL DEFAULT 'active',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `batch_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `batch_quarantine_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`productId` int NOT NULL,
	`storeId` int NOT NULL,
	`reason` enum('near_expiry','quality_issue','recall','damage','cold_chain_breach','manual') NOT NULL,
	`qtyQuarantined` int NOT NULL,
	`initiatedBy` int NOT NULL,
	`approvedBy` int,
	`status` enum('pending_review','approved','released','disposed') NOT NULL DEFAULT 'pending_review',
	`note` text,
	`initiatedAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `batch_quarantine_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `expiry_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`productId` int NOT NULL,
	`storeId` int NOT NULL,
	`expiryDate` date NOT NULL,
	`daysToExpiry` int NOT NULL,
	`expiryBucket` enum('normal','warning','critical','quarantine_candidate','expired') NOT NULL,
	`actionTaken` enum('flagged','price_reduced','quarantined','returned_to_supplier','disposed','sold_before_expiry','no_action') NOT NULL DEFAULT 'flagged',
	`actionBy` int,
	`actionAt` timestamp NOT NULL DEFAULT (now()),
	`note` text,
	CONSTRAINT `expiry_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_audit_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auditId` int NOT NULL,
	`batchId` int NOT NULL,
	`productId` int NOT NULL,
	`systemQty` int NOT NULL,
	`countedQty` int,
	`variance` int,
	`status` enum('pending','counted','approved','adjusted') NOT NULL DEFAULT 'pending',
	`countedBy` int,
	`countedAt` timestamp,
	CONSTRAINT `stock_audit_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`auditType` enum('full','spot_check','expiry_sweep','scheduled') NOT NULL DEFAULT 'full',
	`status` enum('draft','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
	`startedBy` int NOT NULL,
	`completedBy` int,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`totalVariances` int DEFAULT 0,
	`note` text,
	CONSTRAINT `stock_audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_reservations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`orderId` int NOT NULL,
	`productId` int NOT NULL,
	`storeId` int NOT NULL,
	`qtyReserved` int NOT NULL,
	`status` enum('active','fulfilled','cancelled','expired') NOT NULL DEFAULT 'active',
	`reservedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`fulfilledAt` timestamp,
	`cancelledAt` timestamp,
	CONSTRAINT `stock_reservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromStoreId` int NOT NULL,
	`toStoreId` int NOT NULL,
	`batchId` int NOT NULL,
	`productId` int NOT NULL,
	`qtyTransferred` int NOT NULL,
	`transferType` enum('inter_store','batch_to_batch','return_to_supplier') NOT NULL DEFAULT 'inter_store',
	`status` enum('pending','in_transit','received','cancelled') NOT NULL DEFAULT 'pending',
	`initiatedBy` int NOT NULL,
	`receivedBy` int,
	`initiatedAt` timestamp NOT NULL DEFAULT (now()),
	`receivedAt` timestamp,
	`note` text,
	CONSTRAINT `stock_transfers_id` PRIMARY KEY(`id`)
);
