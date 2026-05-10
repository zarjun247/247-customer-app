ALTER TABLE `provider_webhook_events`
  MODIFY COLUMN `processingStatus` enum('received','verified','ignored_duplicate','processed','failed','retry_scheduled','dead_letter','rejected_signature','unsupported_event') NOT NULL DEFAULT 'received',
  ADD COLUMN `attemptCount` int NOT NULL DEFAULT 0 AFTER `processingStatus`,
  ADD COLUMN `maxAttempts` int NOT NULL DEFAULT 3 AFTER `attemptCount`,
  ADD COLUMN `nextRetryAt` timestamp NULL AFTER `maxAttempts`,
  ADD COLUMN `lastAttemptAt` timestamp NULL AFTER `nextRetryAt`;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `provider_dead_letters` (
  `id` int AUTO_INCREMENT NOT NULL,
  `providerEventId` int NOT NULL,
  `provider` varchar(50) NOT NULL,
  `eventType` varchar(100) NOT NULL,
  `paymentId` int,
  `orderId` int,
  `refundId` varchar(150),
  `rawPayloadHash` varchar(64) NOT NULL,
  `failureReason` text,
  `attemptCount` int NOT NULL DEFAULT 0,
  `deadLetterClass` varchar(80) NOT NULL,
  `reviewStatus` enum('pending_review','resolved','replayed') NOT NULL DEFAULT 'pending_review',
  `reviewedBy` varchar(100),
  `reviewedAt` timestamp NULL,
  `reviewNote` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `provider_dead_letters_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_provider_dead_letters_event` UNIQUE(`providerEventId`)
);--> statement-breakpoint
CREATE INDEX `idx_provider_dead_letters_status` ON `provider_dead_letters` (`reviewStatus`);--> statement-breakpoint
CREATE INDEX `idx_provider_dead_letters_provider_created` ON `provider_dead_letters` (`provider`, `createdAt`);
