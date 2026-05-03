CREATE TABLE `idempotency_keys` (
  `id` bigint AUTO_INCREMENT PRIMARY KEY,
  `key` varchar(191) NOT NULL,
  `scope` varchar(100) NOT NULL,
  `operationType` varchar(120) NOT NULL,
  `actorId` int NULL,
  `storeId` int NULL,
  `entityType` varchar(100) NULL,
  `entityId` varchar(120) NULL,
  `status` enum('started','completed','failed') NOT NULL DEFAULT 'started',
  `requestHash` varchar(255) NULL,
  `resultJson` json NULL,
  `errorJson` json NULL,
  `expiresAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `idempotency_keys_key_scope_uidx` (`key`,`scope`)
);
