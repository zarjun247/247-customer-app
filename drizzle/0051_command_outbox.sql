-- Migration 0051: command_log + command_outbox (MP5 executeCommand + outbox dispatch)

CREATE TABLE command_log (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  idempotency_key VARCHAR(128) NOT NULL,
  command_name VARCHAR(128) NOT NULL,
  command_version INT NOT NULL DEFAULT 1,
  actor_user_id VARCHAR(36) NULL,
  actor_role VARCHAR(64) NULL,
  store_id VARCHAR(36) NULL,
  input_hash VARCHAR(64) NOT NULL,
  input_payload JSON NOT NULL,
  output_payload JSON NULL,
  state VARCHAR(32) NOT NULL,
  error_class VARCHAR(128) NULL,
  error_message TEXT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  duration_ms INT NULL,
  trace_id VARCHAR(64) NULL,
  CONSTRAINT uq_command_log_idempotency UNIQUE (idempotency_key, command_name)
);

CREATE INDEX idx_command_log_state_started ON command_log (state, started_at);
CREATE INDEX idx_command_log_actor_started ON command_log (actor_user_id, started_at);
CREATE INDEX idx_command_log_store_started ON command_log (store_id, started_at);
CREATE INDEX idx_command_log_command_started ON command_log (command_name, started_at);

CREATE TABLE command_outbox (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  command_log_id VARCHAR(36) NOT NULL,
  side_effect_kind VARCHAR(64) NOT NULL,
  side_effect_payload JSON NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dispatched_at TIMESTAMP NULL,
  failed_at TIMESTAMP NULL,
  CONSTRAINT fk_command_outbox_command_log FOREIGN KEY (command_log_id) REFERENCES command_log(id)
);

CREATE INDEX idx_command_outbox_state_next ON command_outbox (state, next_attempt_at);
CREATE INDEX idx_command_outbox_kind_state ON command_outbox (side_effect_kind, state);
