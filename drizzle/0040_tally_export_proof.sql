-- P20-13: Tally export proof/audit hardening.
-- Keeps legacy dateFrom/dateTo columns while adding explicit period fields and
-- a duplicate-prevention key scoped to store/type/period/checksum. duplicateKey
-- is used because MySQL UNIQUE indexes allow multiple NULL values in composite keys.

ALTER TABLE tally_export_runs
  ADD COLUMN periodStart TIMESTAMP NULL AFTER exportType,
  ADD COLUMN periodEnd TIMESTAMP NULL AFTER periodStart,
  ADD COLUMN duplicateKey VARCHAR(192) NULL AFTER checksum,
  ADD COLUMN exportedAt TIMESTAMP NULL AFTER generatedAt,
  ADD COLUMN failureReason TEXT NULL AFTER exportedAt,
  ADD COLUMN fileKey TEXT NULL AFTER failureReason,
  ADD COLUMN fileUrl TEXT NULL AFTER fileKey,
  ADD COLUMN updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER createdAt;--> statement-breakpoint
UPDATE tally_export_runs
SET periodStart = COALESCE(periodStart, dateFrom),
    periodEnd = COALESCE(periodEnd, dateTo)
WHERE periodStart IS NULL OR periodEnd IS NULL;--> statement-breakpoint
UPDATE tally_export_runs
SET duplicateKey = SHA2(CONCAT(
  COALESCE(CAST(storeId AS CHAR), '__global__'), '|',
  exportType, '|',
  COALESCE(DATE_FORMAT(periodStart, '%Y-%m-%dT%H:%i:%s'), '__null__'), '|',
  COALESCE(DATE_FORMAT(periodEnd, '%Y-%m-%dT%H:%i:%s'), '__null__'), '|',
  checksum
), 256)
WHERE duplicateKey IS NULL;--> statement-breakpoint
ALTER TABLE tally_export_runs
  MODIFY COLUMN duplicateKey VARCHAR(192) NOT NULL,
  MODIFY COLUMN status ENUM('pending','generated','exported','failed','cancelled') NOT NULL DEFAULT 'generated';--> statement-breakpoint
ALTER TABLE tally_export_runs
  DROP INDEX uq_tally_export_checksum,
  ADD UNIQUE KEY uq_tally_export_proof_window (duplicateKey);
