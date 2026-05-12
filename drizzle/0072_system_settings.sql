-- SM-LM Phase 1 Step 1.2: add unique key to system_settings + seed emergency stop flag
-- system_settings table already exists from migration 0013; we add a unique key on settingKey
-- so ON DUPLICATE KEY UPDATE works correctly for the emergency stop control plane.
ALTER TABLE system_settings
  ADD UNIQUE KEY uq_system_settings_key (settingKey);

INSERT INTO system_settings (settingKey, settingValue, settingType, description)
VALUES (
  'app_emergency_stop',
  '{"active":false,"reason":null,"activated_at":null}',
  'json',
  'Emergency stop flag — when active=true all customer mutations and worker ticks are blocked'
)
ON DUPLICATE KEY UPDATE settingKey = settingKey;
