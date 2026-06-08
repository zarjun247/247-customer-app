-- Migration 0078: DB-backed rate limit buckets for distributed deployments
-- Used by DatabaseRateLimitStore when API_RATE_LIMIT_BACKEND=database.
-- Provides horizontally-durable rate limiting without Redis.
CREATE TABLE IF NOT EXISTS `rate_limit_buckets` (
  `bucket_key`     varchar(255)  NOT NULL,
  `count`          int           NOT NULL DEFAULT 1,
  `reset_at`       bigint        NOT NULL COMMENT 'Unix ms when the window resets',
  `blocked_until`  bigint        NULL     COMMENT 'Unix ms until which the key is hard-blocked',
  `updated_at`     timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`bucket_key`),
  INDEX `rate_limit_buckets_reset_at_idx` (`reset_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
