CREATE TABLE audit_log_chain (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  audit_log_id BIGINT NULL,
  sequence_number BIGINT NOT NULL,
  prev_hash VARCHAR(64) NOT NULL,
  row_hash VARCHAR(64) NOT NULL,
  hashed_payload JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_audit_chain_sequence UNIQUE (sequence_number),
  CONSTRAINT uq_audit_chain_row_hash UNIQUE (row_hash)
);
CREATE INDEX idx_audit_chain_seq ON audit_log_chain (sequence_number);
CREATE INDEX idx_audit_chain_audit ON audit_log_chain (audit_log_id);

-- Seed sequence 0 with genesis hash so chain has a defined starting state
INSERT INTO audit_log_chain (sequence_number, prev_hash, row_hash, hashed_payload)
VALUES (
  0,
  '0000000000000000000000000000000000000000000000000000000000000000',
  SHA2('genesis:247-customer-app:2026-05-11', 256),
  JSON_OBJECT('kind', 'genesis', 'note', 'chain start')
);
