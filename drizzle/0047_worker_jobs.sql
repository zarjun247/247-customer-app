CREATE TABLE `worker_jobs` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `queueName` varchar(100) NOT NULL,
  `jobType` varchar(150) NOT NULL,
  `payloadJson` json NOT NULL,
  `payloadHash` varchar(64) NOT NULL,
  `idempotencyKey` varchar(200) NOT NULL,
  `correlationId` varchar(100),
  `relatedEntityType` varchar(100),
  `relatedEntityId` varchar(100),
  `status` enum('queued','reserved','running','completed','failed','retry_scheduled','dead_letter','cancelled','expired') NOT NULL DEFAULT 'queued',
  `priority` int NOT NULL DEFAULT 0,
  `retryCount` int NOT NULL DEFAULT 0,
  `maxRetries` int NOT NULL DEFAULT 3,
  `nextRetryAt` timestamp NULL,
  `workerId` varchar(100),
  `reservedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `failureReason` text,
  `deadLetterReason` text,
  `deadLetterClass` varchar(80),
  `resolvedAt` timestamp NULL,
  `resolvedBy` varchar(100),
  `resolutionNote` text,
  `heartbeatAt` timestamp NULL,
  `replayOfJobId` bigint,
  `auditTrailJson` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `worker_jobs_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_worker_jobs_idempotency_key` UNIQUE(`idempotencyKey`)
);--> statement-breakpoint
CREATE INDEX `idx_worker_jobs_queue_status` ON `worker_jobs` (`queueName`, `status`);--> statement-breakpoint
CREATE INDEX `idx_worker_jobs_next_retry_at` ON `worker_jobs` (`nextRetryAt`);--> statement-breakpoint
CREATE INDEX `idx_worker_jobs_correlation_id` ON `worker_jobs` (`correlationId`);--> statement-breakpoint
CREATE INDEX `idx_worker_jobs_created_at` ON `worker_jobs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_worker_jobs_heartbeat_at` ON `worker_jobs` (`heartbeatAt`);
