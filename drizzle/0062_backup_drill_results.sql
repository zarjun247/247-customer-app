CREATE TABLE backup_drill_results (
  id INT NOT NULL AUTO_INCREMENT,
  drill_kind VARCHAR(32) NOT NULL,
  drill_status VARCHAR(32) NOT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  duration_seconds INT NULL,
  rows_verified BIGINT NULL,
  bytes_transferred BIGINT NULL,
  restore_target_db VARCHAR(64) NULL,
  failure_reason TEXT NULL,
  triggered_by VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_backup_drill_status (drill_status, started_at),
  INDEX idx_backup_drill_kind (drill_kind, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
