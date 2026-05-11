CREATE TABLE IF NOT EXISTS `slo_events` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `sloName` varchar(80) NOT NULL,
  `target` decimal(8,4) NOT NULL,
  `measuredValue` decimal(10,4) NOT NULL,
  `withinBudget` boolean NOT NULL,
  `sampleCount` int NOT NULL DEFAULT 1,
  `windowSeconds` int NOT NULL DEFAULT 60,
  `context` json NULL,
  `measuredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `slo_events_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX `idx_slo_events_name_measured` ON `slo_events` (`sloName`, `measuredAt`);--> statement-breakpoint
CREATE INDEX `idx_slo_events_within_budget` ON `slo_events` (`withinBudget`, `measuredAt`);
