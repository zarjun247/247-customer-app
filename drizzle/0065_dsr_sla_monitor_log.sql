-- SM-E migration 0065: DSR SLA monitor log for automated 30-day SLA tracking
CREATE TABLE dsr_sla_monitor_log (
  id INT NOT NULL AUTO_INCREMENT,
  dsr_request_id VARCHAR(36) NOT NULL,
  alert_kind VARCHAR(32) NOT NULL,
  days_to_sla INT NOT NULL,
  notified_recipients_json JSON NOT NULL,
  detected_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_dsr_sla_request (dsr_request_id, detected_at),
  INDEX idx_dsr_sla_kind (alert_kind, detected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
