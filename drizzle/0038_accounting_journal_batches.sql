CREATE TABLE IF NOT EXISTS accounting_journal_batches (
  id int AUTO_INCREMENT PRIMARY KEY,
  sourceType varchar(64) NOT NULL,
  sourceRef varchar(128) NOT NULL,
  storeId int NULL,
  status enum('draft','posted','reversed','failed') NOT NULL DEFAULT 'draft',
  totalDebit decimal(12,2) NOT NULL DEFAULT '0.00',
  totalCredit decimal(12,2) NOT NULL DEFAULT '0.00',
  postedBy int NULL,
  postedAt timestamp NULL,
  failureReason text NULL,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_journal_batch_source (sourceType, sourceRef)
);
--> statement-breakpoint
ALTER TABLE accounting_journal_entries ADD COLUMN journalBatchId int NULL;
