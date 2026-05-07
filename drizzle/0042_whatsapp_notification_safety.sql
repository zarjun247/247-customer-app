ALTER TABLE `notification_events`
  MODIFY COLUMN `status` enum(
    'pending',
    'sent',
    'failed',
    'read',
    'unconfigured',
    'provider_unconfigured',
    'retry_scheduled',
    'dead_letter',
    'skipped_demo'
  ) NOT NULL DEFAULT 'pending';--> statement-breakpoint

UPDATE `notification_events`
SET `status` = 'provider_unconfigured'
WHERE `status` = 'unconfigured';--> statement-breakpoint

ALTER TABLE `notification_events`
  MODIFY COLUMN `status` enum(
    'pending',
    'sent',
    'failed',
    'read',
    'provider_unconfigured',
    'retry_scheduled',
    'dead_letter',
    'skipped_demo'
  ) NOT NULL DEFAULT 'pending';
