ALTER TABLE `orders` MODIFY COLUMN `status` enum('draft','awaiting_prescription','awaiting_pharmacist_review','clarification_needed','rejected','awaiting_allocation','backorder_review','reserved','picking','packed','assigned_to_rider','out_for_delivery','delivery_exception','returned','delivered','closed','cancelled','created','pharmacist_reviewing','return_to_stock') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `actorId` int;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `actorType` varchar(50) DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `actorRole` varchar(50);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `beforeJson` text;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `afterJson` text;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `reason` varchar(500);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `sessionId` varchar(200);--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `channel` varchar(50) DEFAULT 'app';--> statement-breakpoint
ALTER TABLE `orders` ADD `statusReason` varchar(500);--> statement-breakpoint
ALTER TABLE `orders` ADD `statusChangedBy` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `statusChangedAt` timestamp;