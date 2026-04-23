ALTER TABLE `products` ADD `category` enum('medicine','devices','baby','nutrition','fmcg','wellness') DEFAULT 'medicine' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `companyName` varchar(200);--> statement-breakpoint
ALTER TABLE `products` ADD `companyCode` varchar(20);--> statement-breakpoint
ALTER TABLE `products` ADD `imageApprovalStatus` enum('pending','approved','rejected') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `imageApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `imageApprovedBy` int;