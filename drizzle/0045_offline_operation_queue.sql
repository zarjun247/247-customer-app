CREATE TABLE `offline_operation_queue` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `storeId` int NOT NULL,
  `terminalId` varchar(120) NOT NULL,
  `actorId` int,
  `operationType` varchar(120) NOT NULL,
  `operationCategory` enum('draft_intent','reconcile_intent','never_finalize_offline') NOT NULL,
  `payloadJson` text NOT NULL,
  `payloadHash` varchar(64) NOT NULL,
  `idempotencyKey` varchar(160) NOT NULL,
  `status` enum('queued','replaying','applied','rejected','conflict','expired','cancelled') NOT NULL DEFAULT 'queued',
  `replayAttempts` int NOT NULL DEFAULT 0,
  `lastReplayAt` timestamp NULL,
  `conflictReason` varchar(500),
  `rejectionReason` varchar(500),
  `duplicateCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `offline_operation_queue_id` PRIMARY KEY(`id`),
  CONSTRAINT `offline_operation_queue_idempotency_uq` UNIQUE(`idempotencyKey`)
);

CREATE INDEX `offline_operation_queue_store_status_created_idx` ON `offline_operation_queue` (`storeId`, `status`, `createdAt`);
CREATE INDEX `offline_operation_queue_store_created_idx` ON `offline_operation_queue` (`storeId`, `createdAt`);
