CREATE TABLE consent_notice_versions (
  id INT NOT NULL AUTO_INCREMENT,
  notice_kind VARCHAR(64) NOT NULL,
  version VARCHAR(32) NOT NULL,
  effective_from DATETIME NOT NULL,
  effective_until DATETIME NULL,
  content_hash CHAR(64) NOT NULL,
  content_text TEXT NOT NULL,
  language VARCHAR(8) NOT NULL DEFAULT 'en',
  published_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_consent_notice_kind_version_lang (notice_kind, version, language),
  INDEX idx_consent_notice_active (notice_kind, effective_until, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
