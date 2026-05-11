CREATE TABLE capability_definitions (
  capability_name VARCHAR(128) NOT NULL PRIMARY KEY,
  description TEXT NOT NULL,
  risk_level VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE capability_grants (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  capability_name VARCHAR(128) NOT NULL,
  granted_by_user_id VARCHAR(36) NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL,
  revoked_by_user_id VARCHAR(36) NULL,
  reason TEXT NULL,
  CONSTRAINT fk_capability_grants_capability FOREIGN KEY (capability_name) REFERENCES capability_definitions(capability_name),
  CONSTRAINT uq_capability_grants_user_cap UNIQUE (user_id, capability_name, granted_at)
);
CREATE INDEX idx_capability_grants_user ON capability_grants (user_id, capability_name);
CREATE INDEX idx_capability_grants_revoked ON capability_grants (revoked_at);

-- Seed the initial capability definitions
INSERT INTO capability_definitions (capability_name, description, risk_level) VALUES
  ('user.create',       'Create new user accounts',           'high'),
  ('user.delete',       'Delete user accounts',               'critical'),
  ('audit.export',      'Export audit log to CSV',            'high'),
  ('audit.view',        'View audit log',                     'medium'),
  ('refund.large',      'Issue refund greater than 5000 INR', 'high'),
  ('inventory.adjust',  'Manual stock adjustment',            'critical'),
  ('store.create',      'Create new store',                   'critical'),
  ('store.close',       'Close existing store',               'critical'),
  ('rbac.grant',        'Grant capabilities to users',        'critical'),
  ('rbac.revoke',       'Revoke capabilities from users',     'high'),
  ('chaos.trigger',     'Trigger chaos drills',               'critical'),
  ('pii.decrypt-bulk',  'Bulk decrypt PII fields for export', 'critical');
