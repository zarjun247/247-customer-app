CREATE TABLE incident_rehearsal_log (
  id INT NOT NULL AUTO_INCREMENT,
  scenario_name VARCHAR(128) NOT NULL,
  scenario_kind VARCHAR(32) NOT NULL,
  started_at DATETIME NOT NULL,
  resolved_at DATETIME NULL,
  duration_seconds INT NULL,
  participants_json JSON NOT NULL,
  outcome VARCHAR(32) NULL,
  lessons_learned TEXT NULL,
  follow_up_items JSON NULL,
  triggered_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_incident_rehearsal_scenario (scenario_name, started_at),
  INDEX idx_incident_rehearsal_outcome (outcome, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
