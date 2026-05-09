-- Provider runtime operation attempt ledger.
-- Stores only sanitized errors and request/response hashes; raw secrets, OTPs, tokens,
-- prescription payloads, OCR text, and medical documents must not be stored here.
CREATE TABLE IF NOT EXISTS `provider_operation_attempts` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `providerType` enum('payment','whatsapp','sms','otp','email','push','ocr','printer','tally','storage','maps','other') NOT NULL,
  `operationType` enum('send','verify','create_order','capture','refund','parse','print','upload','export','sync','webhook') NOT NULL,
  `entityType` varchar(100) NOT NULL,
  `entityRef` varchar(150) NOT NULL,
  `storeId` int,
  `userId` int,
  `status` enum('pending','queued','sent','synced','verified','printed','completed','failed','retrying','dead_letter','disabled','not_configured','manual_required','cancelled') NOT NULL DEFAULT 'pending',
  `providerRef` varchar(200),
  `idempotencyKey` varchar(255),
  `attemptCount` int NOT NULL DEFAULT 1,
  `nextRetryAt` timestamp NULL,
  `lastErrorCode` varchar(100),
  `lastErrorMessage` text,
  `requestHash` varchar(64),
  `responseHash` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `deadLetteredAt` timestamp NULL,
  CONSTRAINT `provider_operation_attempts_id` PRIMARY KEY(`id`),
  CONSTRAINT `provider_operation_attempts_idempotency_key_uq` UNIQUE(`idempotencyKey`)
);

CREATE INDEX `idx_provider_operation_attempts_type_status`
  ON `provider_operation_attempts` (`providerType`, `operationType`, `status`);
CREATE INDEX `idx_provider_operation_attempts_entity`
  ON `provider_operation_attempts` (`entityType`, `entityRef`);
CREATE INDEX `idx_provider_operation_attempts_retry`
  ON `provider_operation_attempts` (`nextRetryAt`, `status`);
CREATE INDEX `idx_provider_operation_attempts_store_created`
  ON `provider_operation_attempts` (`storeId`, `createdAt`);


ALTER TABLE `notification_events`
  MODIFY COLUMN `status` enum(
    'pending',
    'sent',
    'failed',
    'read',
    'provider_unconfigured',
    'not_configured',
    'disabled',
    'retry_scheduled',
    'dead_letter',
    'skipped_demo'
  ) NOT NULL DEFAULT 'pending';
