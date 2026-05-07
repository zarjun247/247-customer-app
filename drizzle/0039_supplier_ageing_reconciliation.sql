ALTER TABLE supplier_payment_allocations
  ADD COLUMN allocatedBy INT NULL AFTER allocatedAt;

UPDATE supplier_payment_allocations
SET allocatedBy = createdBy
WHERE allocatedBy IS NULL AND createdBy IS NOT NULL;
