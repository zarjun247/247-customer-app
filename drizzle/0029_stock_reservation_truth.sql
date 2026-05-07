ALTER TABLE `stock_reservations`
  MODIFY COLUMN `batchId` int NULL,
  MODIFY COLUMN `orderId` int NULL,
  MODIFY COLUMN `status` enum('active','fulfilled','released','expired','consumed','cancelled') NOT NULL DEFAULT 'active',
  ADD COLUMN `cartId` int NULL AFTER `orderId`,
  ADD COLUMN `variantId` int NULL AFTER `productId`,
  ADD COLUMN `skuId` int NULL AFTER `variantId`,
  ADD COLUMN `qty` int NULL AFTER `storeId`,
  ADD COLUMN `releaseReason` varchar(200) NULL AFTER `status`,
  ADD COLUMN `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `reservedAt`,
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `createdAt`;
--> statement-breakpoint
UPDATE `stock_reservations` SET `qty` = `qtyReserved` WHERE `qty` IS NULL;
--> statement-breakpoint
UPDATE `stock_reservations` SET `status` = 'consumed' WHERE `status` = 'fulfilled';
--> statement-breakpoint
ALTER TABLE `stock_reservations`
  MODIFY COLUMN `qty` int NOT NULL,
  MODIFY COLUMN `status` enum('active','released','expired','consumed','cancelled') NOT NULL DEFAULT 'active';
