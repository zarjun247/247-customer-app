ALTER TABLE `products` ADD `imageHeroUrl` text;--> statement-breakpoint
ALTER TABLE `products` ADD `imageSideUrl` text;--> statement-breakpoint
ALTER TABLE `products` ADD `imageRearUrl` text;--> statement-breakpoint
ALTER TABLE `products` ADD `imageLabelUrl` text;--> statement-breakpoint
ALTER TABLE `products` ADD `imageNutritionUrl` text;--> statement-breakpoint
ALTER TABLE `products` ADD `gstRate` decimal(5,2) DEFAULT '12.00';--> statement-breakpoint
ALTER TABLE `products` ADD `searchableTokens` text;--> statement-breakpoint
ALTER TABLE `products` ADD `canonicalName` varchar(300);--> statement-breakpoint
ALTER TABLE `products` ADD `masterProductId` int;--> statement-breakpoint
ALTER TABLE `refill_reminders` ADD `snoozedUntil` timestamp;--> statement-breakpoint
ALTER TABLE `store_skus` ADD `isFeatured` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `store_skus` ADD `sponsorPriority` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `store_skus` ADD `sponsorCategory` varchar(50);--> statement-breakpoint
ALTER TABLE `store_skus` ADD `sponsorLabel` varchar(100);--> statement-breakpoint
ALTER TABLE `store_skus` ADD `sponsorValidUntil` timestamp;