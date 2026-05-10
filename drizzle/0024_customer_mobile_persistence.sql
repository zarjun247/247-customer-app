CREATE TABLE IF NOT EXISTS `notification_events` (
  `id` bigint AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `channel` enum('in_app','push','email','whatsapp','sms') NOT NULL,
  `type` varchar(80) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `safePayloadJson` text,
  `status` enum('pending','sent','failed','read','unconfigured') NOT NULL DEFAULT 'pending',
  `provider` varchar(80),
  `providerMessageId` varchar(150),
  `scheduledFor` timestamp NULL,
  `sentAt` timestamp NULL,
  `readAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_preferences` (
  `id` bigint AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `channel` enum('in_app','push','email','whatsapp','sms') NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `allowSensitiveContent` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `notification_preferences_user_channel_uq` (`userId`,`channel`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `dosage_schedules` (
  `id` bigint AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `familyMemberId` int,
  `prescriptionId` int,
  `saleLineId` int,
  `productId` int,
  `medicineNameSnapshot` varchar(255),
  `scheduleJson` text NOT NULL,
  `source` enum('prescription','pharmacist','user') NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `dose_logs` (
  `id` bigint AUTO_INCREMENT PRIMARY KEY,
  `scheduleId` bigint NOT NULL,
  `userId` int NOT NULL,
  `scheduledAt` timestamp NOT NULL,
  `status` enum('taken','skipped','missed') NOT NULL,
  `recordedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` varchar(500),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_ratings` (
  `id` bigint AUTO_INCREMENT PRIMARY KEY,
  `orderId` int NOT NULL,
  `userId` int NOT NULL,
  `overall` int NOT NULL,
  `delivery` int,
  `packaging` int,
  `pharmacistSupport` int,
  `availability` int,
  `issueTagsJson` text,
  `comment` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `order_ratings_order_user_uq` (`orderId`,`userId`)
);
