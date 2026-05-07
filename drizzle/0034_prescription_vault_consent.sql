-- P20-05: Prescription vault metadata, consent governance, and access audit hardening.
-- All prescription columns are nullable/defaulted to preserve compatibility with existing uploads.
ALTER TABLE `prescriptions`
  ADD COLUMN `doctorRegNo` varchar(100),
  ADD COLUMN `clinicName` varchar(200),
  ADD COLUMN `prescriptionDate` timestamp NULL,
  ADD COLUMN `validUntil` timestamp NULL,
  ADD COLUMN `source` enum('upload','whatsapp','doctor','pharmacist','manual') DEFAULT 'upload',
  ADD COLUMN `consentGivenAt` timestamp NULL,
  ADD COLUMN `consentSource` enum('app','whatsapp','pharmacist','doctor','manual') NULL,
  ADD COLUMN `consentRevokedAt` timestamp NULL,
  ADD COLUMN `onFileMarkedBy` int,
  ADD COLUMN `onFileMarkedAt` timestamp NULL;

-- Backfill canonical metadata aliases from legacy fields where present.
UPDATE `prescriptions`
SET
  `doctorRegNo` = COALESCE(`doctorRegNo`, `doctorReg`),
  `prescriptionDate` = COALESCE(`prescriptionDate`, `prescribedDate`),
  `validUntil` = COALESCE(`validUntil`, `expiryDate`)
WHERE `doctorReg` IS NOT NULL OR `prescribedDate` IS NOT NULL OR `expiryDate` IS NOT NULL;

-- Preserve existing on-file readability while marking legacy rows as system-governed, not fake user consent.
UPDATE `prescriptions`
SET
  `onFileMarkedAt` = COALESCE(`onFileMarkedAt`, `updatedAt`, `createdAt`),
  `consentSource` = COALESCE(`consentSource`, 'manual')
WHERE `status` = 'on_file';

ALTER TABLE `prescription_access_log`
  ADD COLUMN `actorId` int,
  ADD COLUMN `actorRole` varchar(50),
  ADD COLUMN `channel` varchar(50) DEFAULT 'app',
  ADD COLUMN `accessedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE `prescription_access_log`
SET
  `actorId` = COALESCE(`actorId`, `accessedBy`),
  `accessedAt` = COALESCE(`accessedAt`, `createdAt`)
WHERE `actorId` IS NULL;
