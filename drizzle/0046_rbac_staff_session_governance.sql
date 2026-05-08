-- Runtime RBAC / privileged staff session governance additive fields.
ALTER TABLE `staff_device_sessions`
  ADD COLUMN `privilegedLastSeenAt` timestamp NULL,
  ADD COLUMN `requiresReauth` boolean NOT NULL DEFAULT false,
  ADD COLUMN `suspicious` boolean NOT NULL DEFAULT false;

CREATE INDEX `staff_device_sessions_staff_session_status_idx`
  ON `staff_device_sessions` (`staffId`, `sessionId`, `status`);
