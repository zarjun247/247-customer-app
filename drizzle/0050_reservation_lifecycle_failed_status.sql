ALTER TABLE `stock_reservations`
  MODIFY COLUMN `status` enum('active','released','expired','consumed','cancelled','failed') NOT NULL DEFAULT 'active';
