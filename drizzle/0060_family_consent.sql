CREATE TABLE family_consent (
  id INT NOT NULL AUTO_INCREMENT,
  minor_customer_id INT NOT NULL,
  guardian_customer_id INT NULL,
  guardian_name VARCHAR(255) NOT NULL,
  guardian_relationship VARCHAR(64) NOT NULL,
  guardian_id_proof_kind VARCHAR(32) NULL,
  guardian_id_proof_last4 VARCHAR(8) NULL,
  consent_scope_json JSON NOT NULL,
  consent_signed_at DATETIME NOT NULL,
  consent_revoked_at DATETIME NULL,
  consent_doc_storage_path VARCHAR(500) NULL,
  recorded_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_family_consent_minor_active (minor_customer_id, consent_revoked_at),
  INDEX idx_family_consent_minor (minor_customer_id),
  INDEX idx_family_consent_guardian (guardian_customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
