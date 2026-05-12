-- governance-approved: deduplication unique key — prevents duplicate SLA alerts for the same DSR on the same day
ALTER TABLE dsr_sla_monitor_log
  ADD UNIQUE KEY uq_dsr_sla_dedup (dsr_request_id, alert_kind, (DATE(detected_at)));
