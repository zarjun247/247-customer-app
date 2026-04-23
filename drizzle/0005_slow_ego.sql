CREATE TABLE `product_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`strength` varchar(100),
	`packSize` varchar(100),
	`form` varchar(100),
	`unit` varchar(20),
	`displayLabel` varchar(200),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `batches` ADD `variantId` int;--> statement-breakpoint
ALTER TABLE `cart_items` ADD `variantId` int;--> statement-breakpoint
ALTER TABLE `order_items` ADD `variantId` int;--> statement-breakpoint
ALTER TABLE `store_skus` ADD `variantId` int;