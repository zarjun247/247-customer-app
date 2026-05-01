-- PART 12: system_events table for event bus persistence
CREATE TABLE IF NOT EXISTS `system_events` (
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

-- Index for fast event type + time queries
CREATE INDEX IF NOT EXISTS `idx_system_events_type_time` ON `system_events` (`eventType`, `occurredAt`);
CREATE INDEX IF NOT EXISTS `idx_system_events_store_time` ON `system_events` (`storeId`, `occurredAt`);
CREATE INDEX IF NOT EXISTS `idx_system_events_severity` ON `system_events` (`severity`, `occurredAt`);
