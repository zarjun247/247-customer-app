ALTER TABLE `h1_register` MODIFY `storeId` int;--> statement-breakpoint
ALTER TABLE `h1_register` ADD `storeRef` varchar(36);--> statement-breakpoint
ALTER TABLE `h1_register` ADD `doctorName` varchar(300);--> statement-breakpoint
ALTER TABLE `h1_register` ADD `doctorRegNo` varchar(100);--> statement-breakpoint
ALTER TABLE `h1_register` ADD `productId` varchar(36);--> statement-breakpoint
ALTER TABLE `h1_register` ADD `batchLedgerId` varchar(36);--> statement-breakpoint
ALTER TABLE `h1_register` ADD `batchId` varchar(36);--> statement-breakpoint
ALTER TABLE `h1_register` ADD `saleRef` varchar(36);--> statement-breakpoint
ALTER TABLE `h1_register` ADD `saleLineRef` varchar(36);--> statement-breakpoint
ALTER TABLE `h1_register` ADD `saleBillNo` varchar(100);--> statement-breakpoint
ALTER TABLE `h1_register` ADD `statutoryContextStatus` varchar(60) NOT NULL DEFAULT 'complete';--> statement-breakpoint
UPDATE `h1_register`
SET
  `saleRef` = CASE
    WHEN `prescriptionRef` REGEXP '^sale:[^:]+:line:[^:]+$' THEN SUBSTRING_INDEX(SUBSTRING_INDEX(`prescriptionRef`, ':line:', 1), 'sale:', -1)
    ELSE `saleRef`
  END,
  `saleLineRef` = CASE
    WHEN `prescriptionRef` REGEXP '^sale:[^:]+:line:[^:]+$' THEN SUBSTRING_INDEX(`prescriptionRef`, ':line:', -1)
    ELSE `saleLineRef`
  END,
  `saleBillNo` = COALESCE(`saleBillNo`, `billNo`)
WHERE `prescriptionRef` REGEXP '^sale:[^:]+:line:[^:]+$';--> statement-breakpoint
CREATE UNIQUE INDEX `uq_h1_register_sale_line_ref` ON `h1_register` (`saleRef`, `saleLineRef`);
