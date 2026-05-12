CREATE TABLE dsr_requests (
  id VARCHAR(36) NOT NULL,
  customer_id INT NOT NULL,
  request_kind VARCHAR(32) NOT NULL,
  request_status VARCHAR(32) NOT NULL,
  request_payload JSON NULL,
  response_payload JSON NULL,
  confirmation_token VARCHAR(64) NULL,
  confirmation_expires_at DATETIME NULL,
  confirmed_at DATETIME NULL,
  processed_by_user_id INT NULL,
  rejection_reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (id),
  INDEX idx_dsr_customer (customer_id, created_at),
  INDEX idx_dsr_status (request_status, created_at),
  INDEX idx_dsr_kind (request_kind, request_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
