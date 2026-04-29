CREATE TABLE `drug_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryName` varchar(200) NOT NULL,
	`parentCategoryId` int,
	`marginPolicy` decimal(5,2) DEFAULT '0.00',
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `drug_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `suppliers` ADD `state` varchar(100);