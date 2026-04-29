CREATE TABLE `product_barcodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`barcode` varchar(200) NOT NULL,
	`barcodeType` enum('ean13','ean8','code128','qr','datamatrix','other') NOT NULL DEFAULT 'ean13',
	`isPrimary` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_barcodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_margin_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`storeId` int,
	`minMarginPct` decimal(5,2) DEFAULT '0.00',
	`maxDiscountPct` decimal(5,2) DEFAULT '0.00',
	`roleOverrideRequired` boolean NOT NULL DEFAULT false,
	`effectiveFrom` timestamp NOT NULL DEFAULT (now()),
	`effectiveTo` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_margin_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_master` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(300) NOT NULL,
	`role` enum('pharmacist','salesman','cashier','store_manager','purchase_manager','delivery_rider','admin','other') NOT NULL,
	`salesmanCode` varchar(50),
	`pharmacistRegistrationNo` varchar(100),
	`storeId` int,
	`phone` varchar(20),
	`email` varchar(200),
	`loginEnabled` boolean NOT NULL DEFAULT false,
	`linkedUserId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_master_id` PRIMARY KEY(`id`)
);
