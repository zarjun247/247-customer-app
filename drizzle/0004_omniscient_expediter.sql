ALTER TABLE `buildings` ADD `lat` decimal(10,8);--> statement-breakpoint
ALTER TABLE `buildings` ADD `lng` decimal(11,8);--> statement-breakpoint
ALTER TABLE `stores` ADD `serviceRadius` int DEFAULT 2000 NOT NULL;