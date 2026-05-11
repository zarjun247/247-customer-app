CREATE TABLE ai_eval_ledger (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sequence_number BIGINT NOT NULL,
  prev_hash VARCHAR(64) NOT NULL,
  row_hash VARCHAR(64) NOT NULL,
  suggestion_kind VARCHAR(64) NOT NULL,
  scope_type VARCHAR(32) NOT NULL,
  scope_id VARCHAR(64) NULL,
  input_hash VARCHAR(64) NOT NULL,
  input_snapshot JSON NOT NULL,
  output_payload JSON NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by_user_id VARCHAR(36) NULL,
  trace_id VARCHAR(64) NULL,
  CONSTRAINT uq_ai_eval_sequence UNIQUE (sequence_number),
  CONSTRAINT uq_ai_eval_row_hash UNIQUE (row_hash)
);
CREATE INDEX idx_ai_eval_kind_generated ON ai_eval_ledger (suggestion_kind, generated_at);
CREATE INDEX idx_ai_eval_scope ON ai_eval_ledger (scope_type, scope_id, generated_at);
CREATE INDEX idx_ai_eval_seq ON ai_eval_ledger (sequence_number);

CREATE TABLE ai_eval_outcomes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  eval_ledger_id BIGINT NOT NULL,
  outcome_kind VARCHAR(64) NOT NULL,
  outcome_payload JSON NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by_user_id VARCHAR(36) NULL,
  CONSTRAINT fk_ai_eval_outcomes_eval FOREIGN KEY (eval_ledger_id) REFERENCES ai_eval_ledger(id)
);
CREATE INDEX idx_ai_eval_outcomes_eval ON ai_eval_outcomes (eval_ledger_id);
CREATE INDEX idx_ai_eval_outcomes_kind ON ai_eval_outcomes (outcome_kind, recorded_at);

-- Genesis row at sequence 0
INSERT INTO ai_eval_ledger (sequence_number, prev_hash, row_hash, suggestion_kind, scope_type, scope_id, input_hash, input_snapshot, output_payload, model_version)
VALUES (
  0,
  '0000000000000000000000000000000000000000000000000000000000000000',
  SHA2('genesis:ai-eval:247-customer-app:2026-05-11', 256),
  'genesis',
  'global',
  NULL,
  SHA2('genesis-input', 256),
  JSON_OBJECT('kind', 'genesis'),
  JSON_OBJECT('kind', 'genesis'),
  'genesis'
);
