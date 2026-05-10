-- OCR invoice exception workflow: preserve raw/extracted line fields and require human line approval.
-- Backward compatible: all new columns are nullable except approvalStatus defaults.

ALTER TABLE `ocr_extracted_lines`
  ADD COLUMN `rawLineText` text AFTER `rawText`,
  ADD COLUMN `extractedProductName` varchar(300) AFTER `itemName`,
  ADD COLUMN `extractedBatchNo` varchar(100) AFTER `batchNo`,
  ADD COLUMN `extractedExpiry` varchar(50) AFTER `expiryDate`,
  ADD COLUMN `extractedMRP` decimal(10,2) AFTER `mrp`,
  ADD COLUMN `extractedCost` decimal(10,2) AFTER `purchaseRate`,
  ADD COLUMN `extractedQty` int AFTER `qty`,
  ADD COLUMN `mappedProductId` int AFTER `matchedProductId`,
  ADD COLUMN `mappedSupplierSkuId` int AFTER `mappedProductId`,
  ADD COLUMN `exceptionReason` enum('low_confidence','ambiguous_product','missing_batch','missing_expiry','missing_qty','missing_mrp','missing_cost','missing_hsn_or_gst','missing_schedule_for_regulated','supplier_sku_unmapped') NULL AFTER `matchStatus`,
  ADD COLUMN `approvalStatus` enum('pending','approved','held','rejected') NOT NULL DEFAULT 'pending' AFTER `exceptionReason`,
  ADD COLUMN `approvedBy` int NULL AFTER `approvalStatus`,
  ADD COLUMN `approvedAt` timestamp NULL AFTER `approvedBy`,
  ADD COLUMN `approvalDecision` enum('approve','hold','reject') NULL AFTER `approvedAt`,
  ADD COLUMN `correctionNotes` text NULL AFTER `approvalDecision`;--> statement-breakpoint
ALTER TABLE `purchase_drafts`
  ADD COLUMN `approvalDecision` enum('approve','hold','reject') NULL AFTER `status`,
  ADD COLUMN `correctionNotes` text NULL AFTER `approvalDecision`;--> statement-breakpoint
ALTER TABLE `purchase_draft_lines`
  ADD COLUMN `rawLineText` text NULL AFTER `productId`,
  ADD COLUMN `extractedProductName` varchar(300) NULL AFTER `rawLineText`,
  ADD COLUMN `extractedBatchNo` varchar(100) NULL AFTER `extractedProductName`,
  ADD COLUMN `extractedExpiry` varchar(50) NULL AFTER `extractedBatchNo`,
  ADD COLUMN `extractedQty` int NULL AFTER `extractedExpiry`,
  ADD COLUMN `extractedMRP` decimal(10,2) NULL AFTER `extractedQty`,
  ADD COLUMN `extractedCost` decimal(10,2) NULL AFTER `extractedMRP`,
  ADD COLUMN `mappedProductId` int NULL AFTER `extractedCost`,
  ADD COLUMN `mappedSupplierSkuId` int NULL AFTER `mappedProductId`,
  ADD COLUMN `confidence` decimal(5,2) NULL AFTER `hsnCode`,
  ADD COLUMN `exceptionReason` enum('low_confidence','ambiguous_product','missing_batch','missing_expiry','missing_qty','missing_mrp','missing_cost','missing_hsn_or_gst','missing_schedule_for_regulated','supplier_sku_unmapped') NULL AFTER `confidence`,
  ADD COLUMN `approvalStatus` enum('pending','approved','held','rejected') NOT NULL DEFAULT 'pending' AFTER `exceptionReason`,
  ADD COLUMN `approvedBy` int NULL AFTER `approvalStatus`,
  ADD COLUMN `approvedAt` timestamp NULL AFTER `approvedBy`,
  ADD COLUMN `approvalDecision` enum('approve','hold','reject') NULL AFTER `approvedAt`,
  ADD COLUMN `correctionNotes` text NULL AFTER `approvalDecision`,
  MODIFY COLUMN `status` enum('pending','approved','held','rejected') NOT NULL DEFAULT 'pending';--> statement-breakpoint
UPDATE `ocr_extracted_lines`
SET
  `rawLineText` = COALESCE(`rawLineText`, `rawText`),
  `extractedProductName` = COALESCE(`extractedProductName`, `itemName`),
  `extractedBatchNo` = COALESCE(`extractedBatchNo`, `batchNo`),
  `extractedExpiry` = COALESCE(`extractedExpiry`, `expiryDate`),
  `extractedMRP` = COALESCE(`extractedMRP`, `mrp`),
  `extractedCost` = COALESCE(`extractedCost`, `purchaseRate`),
  `extractedQty` = COALESCE(`extractedQty`, `qty`),
  `mappedProductId` = COALESCE(`mappedProductId`, `matchedProductId`)
WHERE `rawLineText` IS NULL
   OR `extractedProductName` IS NULL
   OR `extractedBatchNo` IS NULL
   OR `extractedExpiry` IS NULL
   OR `extractedMRP` IS NULL
   OR `extractedCost` IS NULL
   OR `extractedQty` IS NULL
   OR `mappedProductId` IS NULL;
