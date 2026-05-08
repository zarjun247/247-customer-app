CREATE TABLE `regulated_release_events` (
  `id` bigint AUTO_INCREMENT NOT NULL,
  `orderId` varchar(100),
  `saleId` varchar(100),
  `saleLineRef` varchar(100),
  `productId` varchar(100),
  `batchId` varchar(100),
  `batchLedgerId` varchar(100),
  `prescriptionId` varchar(100),
  `h1RegisterId` varchar(100),
  `h1Ref` varchar(100),
  `customerId` varchar(100),
  `storeId` varchar(100),
  `pharmacistId` varchar(100),
  `scheduleFlag` varchar(20),
  `decision` enum('approved','rejected','clarification_required') NOT NULL,
  `checklistJson` json,
  `missingFieldsJson` json,
  `evidenceHash` varchar(64) NOT NULL,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `regulated_release_events_id` PRIMARY KEY(`id`)
);
CREATE INDEX `idx_reg_release_sale` ON `regulated_release_events` (`saleId`);
CREATE INDEX `idx_reg_release_order` ON `regulated_release_events` (`orderId`);
CREATE INDEX `idx_reg_release_prescription` ON `regulated_release_events` (`prescriptionId`);
CREATE INDEX `idx_reg_release_product` ON `regulated_release_events` (`productId`);
CREATE INDEX `idx_reg_release_pharmacist` ON `regulated_release_events` (`pharmacistId`);
CREATE INDEX `idx_reg_release_created` ON `regulated_release_events` (`createdAt`);
