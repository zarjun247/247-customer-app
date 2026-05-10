CREATE TABLE `invoice_sequences` (
  `id` int AUTO_INCREMENT NOT NULL,
  `store_id` varchar(36) NOT NULL,
  `financial_year` varchar(10) NOT NULL,
  `document_type` enum('sale_invoice','credit_note','debit_note','return_note') NOT NULL,
  `prefix` varchar(80) NOT NULL,
  `last_number` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `invoice_sequences_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_invoice_seq_store_fy_doc` UNIQUE(`store_id`,`financial_year`,`document_type`)
);--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `uq_sales_bill_no` UNIQUE(`bill_no`);--> statement-breakpoint
ALTER TABLE `sale_returns` ADD CONSTRAINT `uq_sale_returns_return_no` UNIQUE(`return_no`);
