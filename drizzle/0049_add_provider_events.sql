-- 0049_add_provider_events.sql
-- Adds provider_events and provider_dead_letters tables for fail-closed provider attempt capture

CREATE TABLE IF NOT EXISTS `provider_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `provider` VARCHAR(100) NOT NULL,
  `operation` VARCHAR(100) NOT NULL,
  `status` ENUM('pending','queued','processing','completed','failed','provider_unconfigured','retry_scheduled','dead_letter','cancelled') NOT NULL DEFAULT 'pending',
  `correlationId` VARCHAR(128) NULL,
  `attemptCount` INT NOT NULL DEFAULT 0,
  `payload` JSON NULL,
  `errorMessage` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_provider_events_provider_status (`provider`, `status`),
  INDEX idx_provider_events_correlation (`correlationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `provider_dead_letters` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `providerEventId` INT NOT NULL,
  `reason` TEXT NULL,
  `attemptCount` INT NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `operatorReviewed` VARCHAR(100) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (providerEventId) REFERENCES provider_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
