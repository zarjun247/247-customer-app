CREATE TABLE `refunds` (
  `id` int AUTO_INCREMENT NOT NULL,
  `paymentId` int NOT NULL,
  `orderId` int,
  `saleId` int,
  `provider` varchar(50) NOT NULL,
  `providerRefundId` varchar(100),
  `amountPaise` int NOT NULL,
  `status` enum('pending','success','failed','cancelled') NOT NULL DEFAULT 'pending',
  `reason` text,
  `creditNoteId` int,
  `initiatedBy` int,
  `failureReason` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `refunds_id` PRIMARY KEY(`id`),
  CONSTRAINT `refunds_provider_refund_id_uq` UNIQUE(`provider`,`providerRefundId`)
);
