CREATE TABLE `provider_webhook_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `provider` varchar(50) NOT NULL,
  `providerEventId` varchar(150),
  `eventType` varchar(100) NOT NULL,
  `paymentId` int,
  `orderId` int,
  `refundId` varchar(150),
  `rawPayloadHash` varchar(64) NOT NULL,
  `payloadJson` json,
  `signatureVerified` boolean NOT NULL DEFAULT false,
  `processingStatus` enum('received','verified','ignored_duplicate','processed','failed','rejected_signature','unsupported_event') NOT NULL DEFAULT 'received',
  `processedAt` timestamp,
  `failureReason` text,
  `idempotencyKey` varchar(255) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `provider_webhook_events_id` PRIMARY KEY(`id`),
  CONSTRAINT `provider_webhook_events_provider_event_id_uq` UNIQUE(`provider`,`providerEventId`),
  CONSTRAINT `provider_webhook_events_idempotency_key_uq` UNIQUE(`provider`,`idempotencyKey`)
);--> statement-breakpoint
CREATE INDEX `idx_provider_webhook_events_payload_hash` ON `provider_webhook_events` (`rawPayloadHash`);--> statement-breakpoint
CREATE INDEX `idx_provider_webhook_events_payment` ON `provider_webhook_events` (`paymentId`);--> statement-breakpoint
CREATE INDEX `idx_provider_webhook_events_order` ON `provider_webhook_events` (`orderId`);--> statement-breakpoint
CREATE INDEX `idx_provider_webhook_events_refund` ON `provider_webhook_events` (`refundId`);
