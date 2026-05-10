-- Privacy consent and staff session security foundation.
-- Backward-compatible: additive tables only, no changes to existing auth, vault, notification, payment, stock, or commercial lifecycle tables.
CREATE TABLE IF NOT EXISTS `privacy_consents` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NULL,
  `customerId` INT NULL,
  `phone` VARCHAR(20) NULL,
  `email` VARCHAR(320) NULL,
  `consentType` ENUM(
    'prescription_storage',
    'refill_reminder',
    'dosage_reminder',
    'whatsapp_transactional',
    'whatsapp_marketing',
    'sms_transactional',
    'sms_marketing',
    'family_profile_access',
    'invoice_claim_bundle'
  ) NOT NULL,
  `status` ENUM('granted', 'revoked', 'pending') NOT NULL DEFAULT 'pending',
  `source` ENUM('app', 'staff', 'whatsapp', 'import', 'system') NOT NULL DEFAULT 'app',
  `grantedAt` TIMESTAMP NULL,
  `revokedAt` TIMESTAMP NULL,
  `changedBy` INT NULL,
  `auditRef` VARCHAR(200) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `privacy_consents_user_type_idx` (`userId`, `consentType`, `updatedAt`),
  INDEX `privacy_consents_customer_type_idx` (`customerId`, `consentType`, `updatedAt`),
  INDEX `privacy_consents_phone_type_idx` (`phone`, `consentType`, `updatedAt`),
  INDEX `privacy_consents_email_type_idx` (`email`, `consentType`, `updatedAt`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_acknowledgements` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `staffId` INT NOT NULL,
  `acknowledgementType` ENUM(
    'patient_data_confidentiality',
    'prescription_handling',
    'H1_register_handling',
    'payment_data_handling',
    'no_shared_accounts'
  ) NOT NULL,
  `version` VARCHAR(40) NOT NULL,
  `acceptedAt` TIMESTAMP NOT NULL,
  `ipAddress` VARCHAR(45) NULL,
  `userAgent` VARCHAR(500) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `staff_acknowledgements_staff_type_idx` (`staffId`, `acknowledgementType`, `version`, `acceptedAt`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_device_sessions` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `staffId` INT NOT NULL,
  `sessionId` VARCHAR(200) NOT NULL,
  `deviceId` VARCHAR(200) NULL,
  `terminalId` VARCHAR(100) NULL,
  `ipAddress` VARCHAR(45) NULL,
  `userAgent` VARCHAR(500) NULL,
  `status` ENUM('active', 'revoked', 'expired') NOT NULL DEFAULT 'active',
  `lastSeenAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` TIMESTAMP NULL,
  `revokedBy` INT NULL,
  `revokeReason` VARCHAR(500) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `staff_device_sessions_staff_session_uq` (`staffId`, `sessionId`),
  INDEX `staff_device_sessions_staff_status_idx` (`staffId`, `status`, `lastSeenAt`)
);
