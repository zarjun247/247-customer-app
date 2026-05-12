-- Migration 0061: Add encryption_key_version columns to PII-bearing tables.
-- Tables touched: prescriptions, users.
-- No prescription_vault or customer_vault tables exist in this schema;
-- encryption_key_version is added directly to the PII-bearing tables.

ALTER TABLE prescriptions
  ADD COLUMN encryption_key_version SMALLINT NOT NULL DEFAULT 1
    AFTER pharmacist_note;
ALTER TABLE prescriptions
  ADD INDEX idx_prescriptions_key_version (encryption_key_version);

ALTER TABLE users
  ADD COLUMN encryption_key_version SMALLINT NOT NULL DEFAULT 1
    AFTER updated_at;
ALTER TABLE users
  ADD INDEX idx_users_key_version (encryption_key_version);
