CREATE TABLE `system_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` enum('order_placed','rx_uploaded','rx_approved','rx_rejected','stock_reserved','picking_started','packed','rider_assigned','delivered','delivery_failed','refill_due','payment_received','payment_failed','purchase_committed','stock_adjusted','batch_quarantined','manual_override','sla_breach_risk','sync_stale','ocr_pending','order_cancelled','whatsapp_order','counter_sale','pharmacist_approved','out_for_delivery') NOT NULL,
	`entityType` varchar(50),
	`entityId` int,
	`storeId` int,
	`actorId` int,
	`actorType` enum('customer','pharmacist','rider','system','admin','whatsapp') NOT NULL DEFAULT 'system',
	`payload` text,
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
	`channel` enum('app','whatsapp','counter','system','import') NOT NULL DEFAULT 'system',
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	`isProcessed` boolean NOT NULL DEFAULT false,
	CONSTRAINT `system_events_id` PRIMARY KEY(`id`)
);
