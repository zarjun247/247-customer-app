CREATE TABLE pii_encryption_keys (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  key_version INT NOT NULL,
  scope VARCHAR(64) NOT NULL,
  wrapped_data_key VARBINARY(512) NOT NULL,
  algorithm VARCHAR(32) NOT NULL DEFAULT 'aes-256-gcm',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rotated_from_id VARCHAR(36) NULL,
  retired_at TIMESTAMP NULL,
  CONSTRAINT uq_pii_keys_scope_version UNIQUE (scope, key_version),
  CONSTRAINT fk_pii_keys_rotated_from FOREIGN KEY (rotated_from_id) REFERENCES pii_encryption_keys(id)
);
CREATE INDEX idx_pii_keys_scope ON pii_encryption_keys (scope, key_version);
CREATE INDEX idx_pii_keys_retired ON pii_encryption_keys (retired_at);
