-- Provider runtime enforcement + retry/dead-letter foundation.
-- Payload columns are summaries/hashes only; raw provider payloads and secrets are not stored.

ALTER TABLE notification_events
  MODIFY COLUMN status enum('pending','sent','failed','read','provider_unconfigured','retry_scheduled','dead_letter','skipped_demo','demo_skipped','preview_only') NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS provider_operation_attempts (
  id bigint AUTO_INCREMENT PRIMARY KEY,
  provider varchar(100) NOT NULL,
  operation varchar(120) NOT NULL,
  idempotencyKey varchar(191) NOT NULL,
  status enum('success','failed','provider_unconfigured','disabled','demo_skipped','preview_only','retry_scheduled','dead_letter','timeout','rate_limited','unknown') NOT NULL,
  attemptNo int NOT NULL DEFAULT 1,
  maxAttempts int NOT NULL DEFAULT 1,
  retryable boolean NOT NULL DEFAULT false,
  nextRetryAt timestamp NULL,
  deadLetterReason varchar(500) NULL,
  requestHash varchar(64) NULL,
  responseSummaryJson text NULL,
  correlationId varchar(191) NULL,
  relatedEntityType varchar(80) NULL,
  relatedEntityId varchar(120) NULL,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX provider_attempt_provider_operation_status_idx (provider, operation, status),
  INDEX provider_attempt_idempotency_key_idx (idempotencyKey),
  INDEX provider_attempt_created_at_idx (createdAt),
  INDEX provider_attempt_next_retry_at_idx (nextRetryAt)
);

CREATE TABLE IF NOT EXISTS provider_dead_letters (
  id bigint AUTO_INCREMENT PRIMARY KEY,
  provider varchar(100) NOT NULL,
  operation varchar(120) NOT NULL,
  idempotencyKey varchar(191) NOT NULL,
  status enum('success','failed','provider_unconfigured','disabled','demo_skipped','preview_only','retry_scheduled','dead_letter','timeout','rate_limited','unknown') NOT NULL DEFAULT 'dead_letter',
  attemptNo int NOT NULL DEFAULT 1,
  maxAttempts int NOT NULL DEFAULT 1,
  retryable boolean NOT NULL DEFAULT false,
  nextRetryAt timestamp NULL,
  deadLetterReason varchar(500) NULL,
  requestHash varchar(64) NULL,
  responseSummaryJson text NULL,
  correlationId varchar(191) NULL,
  relatedEntityType varchar(80) NULL,
  relatedEntityId varchar(120) NULL,
  resolvedAt timestamp NULL,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX provider_dead_provider_operation_status_idx (provider, operation, status),
  INDEX provider_dead_idempotency_key_idx (idempotencyKey),
  INDEX provider_dead_created_at_idx (createdAt),
  INDEX provider_dead_next_retry_at_idx (nextRetryAt)
);
