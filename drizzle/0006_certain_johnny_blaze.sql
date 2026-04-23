ALTER TABLE `stores` MODIFY COLUMN `serviceRadius` int NOT NULL DEFAULT 3000;--> statement-breakpoint
ALTER TABLE `buildings` ADD `addressLine1` varchar(300);--> statement-breakpoint
ALTER TABLE `buildings` ADD `landmark` varchar(200);--> statement-breakpoint
ALTER TABLE `stores` ADD `openingHours` text;--> statement-breakpoint
ALTER TABLE `stores` ADD `priority` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `isPrimary` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `userAddress` text;--> statement-breakpoint
ALTER TABLE `users` ADD `userLat` decimal(10,8);--> statement-breakpoint
ALTER TABLE `users` ADD `userLng` decimal(11,8);