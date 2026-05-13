-- SM-LM Phase 11: DSR §11(5) Right to Nominate
-- A data principal may nominate a person to exercise DSR rights on their behalf.
CREATE TABLE dsr_nominees (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  nominee_name VARCHAR(200) NOT NULL,
  nominee_email VARCHAR(320) NOT NULL,
  nominee_phone VARCHAR(20),
  relationship VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  INDEX idx_dsr_nominees_user (user_id, is_active),
  INDEX idx_dsr_nominees_email (nominee_email)
);
