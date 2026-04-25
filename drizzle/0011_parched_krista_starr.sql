CREATE TABLE `doctor_consult_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`consultType` enum('instant','scheduled') NOT NULL DEFAULT 'instant',
	`status` enum('requested','assigned','in_progress','completed','cancelled','no_show') NOT NULL DEFAULT 'requested',
	`assignedDoctorName` varchar(200),
	`assignedDoctorReg` varchar(100),
	`chiefComplaint` text,
	`consultNote` text,
	`linkedPrescriptionId` int,
	`scheduledAt` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`consentGiven` boolean NOT NULL DEFAULT false,
	`platformNote` text,
	CONSTRAINT `doctor_consult_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` MODIFY COLUMN `rxLane` enum('otc','digital','on_file','fallback','doctor_consult') NOT NULL DEFAULT 'otc';--> statement-breakpoint
ALTER TABLE `prescriptions` MODIFY COLUMN `lane` enum('otc','digital','on_file','fallback','doctor_consult') NOT NULL DEFAULT 'digital';