ALTER TABLE `stock_reservations`
  MODIFY COLUMN `status` enum('active','released','expired','consumed','cancelled','failed') NOT NULL DEFAULT 'active',
  ADD COLUMN `reservationMeta` json NULL AFTER `releaseReason`,
  ADD INDEX `idx_stock_reservations_batch_status` (`batchId`, `status`);
