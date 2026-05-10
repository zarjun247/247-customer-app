ALTER TABLE supplier_payments
  MODIFY COLUMN paymentMode ENUM('cash','cheque','upi','neft','rtgs','credit','advance','debit_note','return_credit','adjustment') NOT NULL DEFAULT 'upi';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplierPaymentId INT NOT NULL,
  purchaseInvoiceId INT NULL,
  purchaseReturnId INT NULL,
  amount DECIMAL(12,2) NOT NULL,
  allocationType ENUM('invoice_payment','advance_applied','debit_note','return_credit','adjustment') NOT NULL,
  allocatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdBy INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_supplier_alloc_payment_invoice_type (supplierPaymentId, purchaseInvoiceId, allocationType)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS accounting_journal_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storeId INT NULL,
  sourceType VARCHAR(64) NOT NULL,
  sourceId INT NOT NULL,
  entryDate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accountCode VARCHAR(64) NOT NULL,
  accountName VARCHAR(200) NOT NULL,
  debit DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  credit DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(12) NOT NULL DEFAULT 'INR',
  narration TEXT NULL,
  metadataJson JSON NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_journal_source_account_direction (sourceType, sourceId, accountCode, debit, credit)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tally_export_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storeId INT NULL,
  exportType VARCHAR(64) NOT NULL,
  dateFrom TIMESTAMP NULL,
  dateTo TIMESTAMP NULL,
  filtersJson JSON NULL,
  rowCount INT NOT NULL DEFAULT 0,
  checksum VARCHAR(128) NOT NULL,
  status ENUM('generated','failed','reexported') NOT NULL DEFAULT 'generated',
  generatedBy INT NULL,
  generatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tally_export_checksum (checksum)
);
