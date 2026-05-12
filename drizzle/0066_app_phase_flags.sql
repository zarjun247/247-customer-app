-- SM-E migration 0066: APP_PHASE feature flag registry
CREATE TABLE app_phase_flags (
  id INT NOT NULL AUTO_INCREMENT,
  flag_key VARCHAR(64) NOT NULL,
  required_phase VARCHAR(32) NOT NULL,
  description TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_phase_flag_key (flag_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO app_phase_flags (flag_key, required_phase, description) VALUES
  ('admin_dsr_queue', 'pilot', 'DPDP DSR admin queue'),
  ('admin_consent_registry', 'pilot', 'Consent notice registry'),
  ('admin_family_consent', 'pilot', 'Family consent admin'),
  ('admin_security', 'pilot', 'Security admin always available'),
  ('admin_intelligence', 'scaled', 'AI intelligence dashboards — phase 2'),
  ('admin_ai_eval_ledger', 'scaled', 'AI eval ledger — phase 2'),
  ('admin_command_center', 'scaled', 'Command center — phase 2'),
  ('admin_capacity_planning', 'scaled', 'Capacity reports — phase 2'),
  ('admin_chaos', 'scaled', 'Chaos drills — phase 2'),
  ('admin_deployment_readiness', 'scaled', 'Deploy readiness — phase 2'),
  ('admin_multi_store', 'full', 'Multi-store ops — phase 3'),
  ('intelligence_router_api', 'scaled', 'Intelligence tRPC routes — phase 2'),
  ('ai_eval_router_api', 'scaled', 'AI eval tRPC routes — phase 2');
