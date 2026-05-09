-- 0049_pharmacy_legal_ops.sql
-- Production pharmacy legal operations foundation: license config, pharmacist duty,
-- regulated release evidence, SOP acknowledgements, cold-chain, recalls, disposal,
-- and inspection export manifests. No data backfill claims legal readiness.

CREATE TABLE IF NOT EXISTS pharmacy_store_licenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  license_number VARCHAR(120) NOT NULL,
  license_type VARCHAR(80) NOT NULL,
  issuing_authority VARCHAR(200) NOT NULL,
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  status ENUM('active','expired','suspended','pending','unknown') NOT NULL DEFAULT 'unknown',
  document_storage_key VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pharmacy_store_licenses_store_status (store_id, status),
  INDEX idx_pharmacy_store_licenses_valid_until (valid_until)
);

CREATE TABLE IF NOT EXISTS pharmacist_registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  pharmacist_name VARCHAR(200) NOT NULL,
  registration_number VARCHAR(120) NOT NULL,
  council_name VARCHAR(200) NOT NULL,
  valid_until DATE NULL,
  status ENUM('active','expired','suspended','pending','unknown') NOT NULL DEFAULT 'unknown',
  document_storage_key VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pharmacist_registrations_user_registration (user_id, registration_number),
  INDEX idx_pharmacist_registrations_user_status (user_id, status),
  INDEX idx_pharmacist_registrations_valid_until (valid_until)
);

CREATE TABLE IF NOT EXISTS pharmacist_duty_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  pharmacist_user_id INT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  status ENUM('active','closed','interrupted') NOT NULL DEFAULT 'active',
  opened_by INT NOT NULL,
  closed_by INT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pharmacist_duty_sessions_store_status (store_id, status),
  INDEX idx_pharmacist_duty_sessions_pharmacist_started (pharmacist_user_id, started_at)
);

CREATE TABLE IF NOT EXISTS regulated_release_evidence (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id VARCHAR(36) NULL,
  order_id INT NULL,
  sale_line_id VARCHAR(36) NULL,
  order_item_id INT NULL,
  prescription_id INT NULL,
  store_id INT NOT NULL,
  pharmacist_user_id INT NOT NULL,
  pharmacist_duty_session_id INT NULL,
  patient_ref VARCHAR(200) NULL,
  doctor_ref VARCHAR(200) NULL,
  doctor_name VARCHAR(200) NULL,
  schedule_category VARCHAR(20) NULL,
  drug_name VARCHAR(300) NOT NULL,
  batch_ref VARCHAR(120) NULL,
  quantity INT NOT NULL,
  release_status ENUM('blocked','pending_review','approved','rejected','released') NOT NULL DEFAULT 'pending_review',
  release_reason TEXT NULL,
  approved_at TIMESTAMP NULL,
  released_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_regulated_release_evidence_sale (sale_id, sale_line_id),
  INDEX idx_regulated_release_evidence_order (order_id, order_item_id),
  INDEX idx_regulated_release_evidence_prescription (prescription_id),
  INDEX idx_regulated_release_evidence_status_created (release_status, created_at)
);

CREATE TABLE IF NOT EXISTS pharmacy_sop_acknowledgements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  sop_code VARCHAR(80) NOT NULL,
  sop_version VARCHAR(40) NOT NULL,
  acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash VARCHAR(128) NULL,
  device_ref VARCHAR(200) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pharmacy_sop_ack_user_sop_version (user_id, sop_code, sop_version),
  INDEX idx_pharmacy_sop_ack_sop_version (sop_code, sop_version)
);

CREATE TABLE IF NOT EXISTS pharmacy_inspection_exports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  export_type VARCHAR(80) NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  status ENUM('generated','failed','manual_required') NOT NULL DEFAULT 'manual_required',
  storage_key VARCHAR(500) NULL,
  generated_by INT NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  failure_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pharmacy_inspection_exports_type_store_generated (export_type, store_id, generated_at)
);

CREATE TABLE IF NOT EXISTS pharmacy_temperature_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  batch_id INT NULL,
  product_id INT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  temperature_celsius DECIMAL(5,2) NOT NULL,
  source ENUM('manual','iot') NOT NULL DEFAULT 'manual',
  device_ref VARCHAR(200) NULL,
  recorded_by INT NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pharmacy_temperature_logs_store_recorded (store_id, recorded_at),
  INDEX idx_pharmacy_temperature_logs_batch (batch_id)
);

CREATE TABLE IF NOT EXISTS cold_chain_breaches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  batch_id INT NULL,
  product_id INT NULL,
  detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  severity ENUM('watch','minor','major','critical') NOT NULL DEFAULT 'major',
  status ENUM('open','quarantined','resolved','rejected') NOT NULL DEFAULT 'open',
  temperature_log_id INT NULL,
  description TEXT NULL,
  resolved_by INT NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cold_chain_breaches_batch_status (batch_id, status),
  INDEX idx_cold_chain_breaches_store_status (store_id, status)
);

CREATE TABLE IF NOT EXISTS batch_recalls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  batch_ref VARCHAR(120) NOT NULL,
  product_id INT NULL,
  reason TEXT NOT NULL,
  status ENUM('open','quarantined','notifications_pending','closed') NOT NULL DEFAULT 'open',
  initiated_by INT NOT NULL,
  approved_by INT NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_batch_recalls_store_status (store_id, status),
  INDEX idx_batch_recalls_batch_ref (batch_ref)
);

CREATE TABLE IF NOT EXISTS batch_recall_customer_impacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  recall_id INT NOT NULL,
  sale_id VARCHAR(36) NULL,
  sale_line_id VARCHAR(36) NULL,
  customer_ref VARCHAR(200) NULL,
  notification_status ENUM('pending','queued','sent','failed','not_required') NOT NULL DEFAULT 'pending',
  provider_message_id VARCHAR(200) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_batch_recall_customer_impacts_recall (recall_id),
  INDEX idx_batch_recall_customer_impacts_sale (sale_id, sale_line_id)
);

CREATE TABLE IF NOT EXISTS expired_medicine_disposals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  batch_id INT NULL,
  batch_ref VARCHAR(120) NOT NULL,
  product_id INT NULL,
  quantity INT NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('draft','pending_approval','approved','disposed','rejected') NOT NULL DEFAULT 'pending_approval',
  stock_movement_id INT NULL,
  created_by INT NOT NULL,
  approved_by INT NULL,
  approved_at TIMESTAMP NULL,
  disposed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_expired_medicine_disposals_store_status (store_id, status),
  INDEX idx_expired_medicine_disposals_batch (batch_id)
);
